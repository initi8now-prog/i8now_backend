/* ═══════════════════════════════════════════════════════════════════════════
 *  admin.service — business rules for the admin HTTP API
 *
 *  Calls repos under this same `admin/` folder for admin-only DB writes, and
 *  shared shift/timesheet/user repos for reads that already exist elsewhere.
 *  Route layer guarantees `role === 'admin'` before any function here runs.
 * ═══════════════════════════════════════════════════════════════════════════ */

import * as adminEmployerRepo from './adminEmployer.repo.js'
import * as adminTimesheetRepo from './adminTimesheet.repo.js'
import * as adminUserRepo from './adminUser.repo.js'
import * as adminWorkerRepo from './adminWorker.repo.js'
import * as refreshTokenRepo from '../auth/refreshToken.repo.js'
import * as employerRepo from '../shift/employer.repo.js'
import * as shiftRepo from '../shift/shift.repo.js'
import * as categoryRepo from '../worker/category.repo.js'
import * as workerRepo from '../worker/worker.repo.js'
import * as workerDocumentRepo from '../worker/workerDocument.repo.js'
import * as workerQualificationRepo from '../worker/workerQualification.repo.js'
import * as timesheetRepo from '../timesheet/timesheet.repo.js'
import { UserModel } from '../user/user.model.js'
import { WorkerProfileModel } from '../worker/workerProfile.model.js'
import { WorkerDocumentModel } from '../worker/workerDocument.model.js'
import { TimesheetModel } from '../timesheet/timesheet.model.js'
import { ShiftModel } from '../shift/shift.model.js'
import { ShiftApplicationModel } from '../shift/shiftApplication.model.js'
import {
  generateSecret,
  generateURI,
  verify as verifyTotpEnrollment,
} from 'otplib'
import type { UserDoc } from '../user/user.model.js'
import * as userRepo from '../user/user.repo.js'
import { AppError } from '../../utils/errors.js'
import { hashPassword } from '../../utils/password.js'
import { safeRatingAvg } from '../../utils/rating.js'
import { createPresignedPutUrl, createSignedGetUrl, deleteS3ObjectByKey, uploadBufferToS3 } from '../../utils/s3.js'
import { nanoid } from 'nanoid'
import * as XLSX from 'xlsx'
import { formatDobDate } from '../worker/workerProfileRules.js'
import { ageYearsUtc, isValidFullName, parseDobString } from '../worker/workerProfileRules.js'
import type {
  AdminAddWorkerDocumentBody,
  AdminAddWorkerQualificationBody,
  AdminDeleteWorkerUploadBody,
  AdminEmployerListQuery,
  AdminShiftListQuery,
  AdminPresignWorkerUploadBody,
  AdminReviewWorkerDocumentBody,
  AdminTimesheetListQuery,
  AdminUserListQuery,
  AdminWorkerListQuery,
  CreateAdminWorkerBody,
  CreateAdminUserBody,
  PatchAdminWorkerProfileBody,
  PatchAdminUserBody,
  PatchEmployerVerificationBody,
  PatchAdminEmployerProfileBody,
  CreateAdminEmployerBody,
  CreateAdminShiftBody,
  DeleteAdminEmployerBody,
  AdminDeleteEmployerUploadBody,
  AdminRateEmployerBody,
  PatchAdminShiftBody,
  PatchAdminMeAccountBody,
  PatchPlatformSettingsBody,
  PatchWorkerKycBody,
  TimesheetRateWorkerBody,
} from './admin.validator.js'
import * as platformSettingsRepo from './platformSettings.repo.js'

function toIsoDayUTC(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseIsoDayToUtc(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function toPlainObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object') return {}
  const candidate = input as { toObject?: () => unknown }
  if (typeof candidate.toObject === 'function') {
    const plain = candidate.toObject()
    return plain && typeof plain === 'object' ? (plain as Record<string, unknown>) : {}
  }
  return input as Record<string, unknown>
}

export async function getOverviewDashboard() {
  const now = new Date()
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 13))
  const prevFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 27))
  const prevTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 14, 23, 59, 59))

  const [users_total, workers_total, employers_total, timesheets_open] = await Promise.all([
    UserModel.countDocuments({ deleted_at: null }),
    WorkerProfileModel.countDocuments({}),
    UserModel.countDocuments({ role: 'employer', deleted_at: null }),
    TimesheetModel.countDocuments({ status: { $in: ['open', 'pending'] } }),
  ])

  const [kyc_pending, kyc_approved, docs_pending, docs_approved, timesheets_approved_14d, new_workers_14d, prev_new_workers] =
    await Promise.all([
      WorkerProfileModel.countDocuments({ kyc_status: 'pending' }),
      WorkerProfileModel.countDocuments({ kyc_status: 'approved' }),
      WorkerDocumentModel.countDocuments({ status: 'pending' }),
      WorkerDocumentModel.countDocuments({ status: 'approved' }),
      TimesheetModel.countDocuments({ status: 'approved', updated_at: { $gte: from } }),
      WorkerProfileModel.countDocuments({ created_at: { $gte: from } }),
      WorkerProfileModel.countDocuments({ created_at: { $gte: prevFrom, $lte: prevTo } }),
    ])

  const trendSeed: Record<string, { workers_created: number; docs_uploaded: number; kyc_approved: number }> = {}
  for (let i = 0; i < 14; i += 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (13 - i)))
    trendSeed[toIsoDayUTC(d)] = { workers_created: 0, docs_uploaded: 0, kyc_approved: 0 }
  }

  const [workerTrend, docTrend, kycTrend] = await Promise.all([
    WorkerProfileModel.aggregate([
      { $match: { created_at: { $gte: from } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } }, count: { $sum: 1 } } },
    ]),
    WorkerDocumentModel.aggregate([
      { $match: { created_at: { $gte: from } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } }, count: { $sum: 1 } } },
    ]),
    WorkerDocumentModel.aggregate([
      { $match: { status: 'approved', reviewed_at: { $gte: from } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$reviewed_at' } }, count: { $sum: 1 } } },
    ]),
  ])

  for (const r of workerTrend) if (trendSeed[r._id]) trendSeed[r._id].workers_created = r.count
  for (const r of docTrend) if (trendSeed[r._id]) trendSeed[r._id].docs_uploaded = r.count
  for (const r of kycTrend) if (trendSeed[r._id]) trendSeed[r._id].kyc_approved = r.count

  const trend = Object.entries(trendSeed).map(([date, v]) => ({ date, ...v }))
  const growth_workers_pct = prev_new_workers > 0 ? ((new_workers_14d - prev_new_workers) / prev_new_workers) * 100 : 100

  return {
    cards: {
      users_total,
      workers_total,
      employers_total,
      timesheets_open,
      growth_workers_pct: Number.isFinite(growth_workers_pct) ? Math.round(growth_workers_pct * 10) / 10 : 0,
    },
    kyc: {
      pending: kyc_pending,
      approved: kyc_approved,
      docs_pending,
      docs_approved,
    },
    productivity: {
      timesheets_approved_14d,
      new_workers_14d,
    },
    trend,
  }
}

/**
 * Formats a shift `date` field as `YYYY-MM-DD` for JSON responses.
 */
function isoDay(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Normalised user row for admin JSON (includes soft-delete timestamp when set). */
function userToJson(u: UserDoc) {
  const c = u.created_at
  const up = u.updated_at
  const ph = u.password_hash
  return {
    id: u._id,
    phone: u.phone ?? null,
    email: u.email ?? null,
    role: u.role,
    status: u.status,
    onboarding_step: u.onboarding_step ?? 0,
    deleted_at: u.deleted_at ? new Date(u.deleted_at).toISOString() : null,
    created_at: c ? new Date(c as unknown as string | Date).toISOString() : null,
    updated_at: up ? new Date(up as unknown as string | Date).toISOString() : null,
    totp_enabled: u.totp_enabled === true,
    password_login_enabled: u.password_login_enabled === true,
    password_set: typeof ph === 'string' && ph.length > 0,
  }
}

function isMongoDuplicateKey(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000
}

/**
 * Paginated worker directory: optional KYC filter and name search.
 * Returns rows plus total count for `meta`.
 */
export async function listWorkers(q: AdminWorkerListQuery) {
  const page = q.page ?? 1
  const limit = q.limit ?? 20
  const skip = (page - 1) * limit
  const filter: adminWorkerRepo.AdminWorkerDirectoryFilter = {}
  if (q.kyc_status !== undefined) filter.kyc_status = q.kyc_status
  if (q.search !== undefined && q.search.trim() !== '') filter.search = q.search

  const total = await adminWorkerRepo.countForDirectory(filter)
  const rows = await adminWorkerRepo.listForDirectory(filter, skip, limit)

  const workers = await Promise.all(
    rows.map(async (p) => ({
      id: p._id,
      user_id: p.user_id,
      full_name: p.full_name,
      city: p.city,
      kyc_status: p.kyc_status,
      avatar_url: p.avatar_url ?? null,
      avatar_preview_url: await toPreviewUrlIfS3(p.avatar_url ?? null, p._id),
      rating_avg: safeRatingAvg(p.rating_avg),
      created_at: p.created_at ? new Date(p.created_at as unknown as string).toISOString() : null,
    })),
  )

  return { workers, total, page, limit }
}

/**
 * Creates a worker account and worker profile in one admin step.
 */
export async function createWorker(body: CreateAdminWorkerBody) {
  const emailNorm = body.email?.toLowerCase()
  const dobDate = parseDobString(body.dob)
  if (Number.isNaN(dobDate.getTime())) {
    throw new AppError('PROFILE_DOB_INVALID', 400, 'Invalid date of birth')
  }
  if (ageYearsUtc(dobDate) < 18) {
    throw new AppError('PROFILE_UNDERAGE', 400, 'Worker must be at least 18 years old')
  }
  if (!isValidFullName(body.full_name)) {
    throw new AppError('PROFILE_NAME_INVALID', 400, 'Name contains invalid characters or is too short')
  }

  if (emailNorm) {
    const clash = await userRepo.findByEmail(emailNorm)
    if (clash) throw new AppError('USER_ALREADY_EXISTS', 409, 'Email already in use')
  }
  if (body.phone) {
    const clash = await userRepo.findByPhone(body.phone)
    if (clash) throw new AppError('USER_ALREADY_EXISTS', 409, 'Phone already in use')
  }

  let password_hash: string | null = null
  if (body.password) {
    password_hash = await hashPassword(body.password)
  }

  try {
    const user = await adminUserRepo.insertUser({
      phone: body.phone ?? null,
      email: emailNorm ?? null,
      role: 'worker',
      status: body.status,
      onboarding_step: 3,
      password_hash,
      password_login_enabled: password_hash ? (body.password_login_enabled ?? true) : undefined,
    })

    await workerRepo.create({
      user_id: user._id,
      full_name: body.full_name.trim(),
      dob: dobDate,
      avatar_url: body.avatar_url ?? null,
      bio: body.bio ?? null,
      location_lat: body.location_lat,
      location_lng: body.location_lng,
      city: body.city.trim(),
      radius_km: body.radius_km,
    })

    const profile = await workerRepo.findByUserId(user._id)
    if (!profile) {
      throw new AppError('WORKER_NOT_FOUND', 404, 'Worker profile not found after create')
    }
    return getWorkerDetail(profile._id)
  } catch (e: unknown) {
    if (isMongoDuplicateKey(e)) {
      throw new AppError('USER_ALREADY_EXISTS', 409, 'Email or phone already in use')
    }
    throw e
  }
}

/**
 * Full worker card for admin: profile fields plus linked auth user (phone/email).
 */
export async function getWorkerDetail(profileId: string, viewerUserId?: string) {
  const profile = await adminWorkerRepo.findByProfileId(profileId)
  if (!profile) {
    throw new AppError('WORKER_NOT_FOUND', 404, 'Worker profile not found')
  }
  const user = await userRepo.findById(profile.user_id)
  if (!user) {
    throw new AppError('USER_NOT_FOUND', 404, 'Linked user not found')
  }

  const [docs, quals, completedShiftsCount] = await Promise.all([
    workerDocumentRepo.listByWorkerProfileId(profile._id),
    workerQualificationRepo.listByWorkerProfileId(profile._id),
    ShiftApplicationModel.countDocuments({ worker_profile_id: profile._id, status: 'completed' }).exec(),
  ])

  // Keep stored total_shifts in sync with reality (self-healing)
  if ((profile.total_shifts ?? 0) !== completedShiftsCount) {
    await WorkerProfileModel.findByIdAndUpdate(profile._id, { $set: { total_shifts: completedShiftsCount } }).exec()
  }
  const avatar_preview_url = await toPreviewUrlIfS3(profile.avatar_url ?? null, profile._id)
  const docsWithPreview = await Promise.all(
    docs.map(async (d) => ({
      id: d._id,
      type: d.type,
      file_url: d.file_url,
      preview_url: await toPreviewUrlIfS3(d.file_url, profile._id),
      status: d.status,
      reviewed_at: d.reviewed_at ? new Date(d.reviewed_at as unknown as string).toISOString() : null,
    })),
  )
  const qualifications = quals.map((q) => {
    const toDate = q.to_date ? new Date(q.to_date as unknown as string) : null
    const created = q.created_at ? new Date(q.created_at as unknown as string) : null
    return {
      id: q._id,
      type: q.type,
      title: q.title,
      institution: q.institution,
      from_date: formatDobDate(q.from_date),
      to_date: toDate ? formatDobDate(toDate) : null,
      is_currently_pursuing: !toDate,
      description: q.description ?? null,
      verified: q.verified,
      created_at: created ? created.toISOString() : new Date().toISOString(),
    }
  })

  return {
    profile: {
      id: profile._id,
      user_id: profile.user_id,
      full_name: profile.full_name,
      dob: formatDobDate(profile.dob),
      avatar_url: profile.avatar_url ?? null,
      avatar_preview_url,
      bio: profile.bio ?? null,
      location_lat: profile.location_lat,
      location_lng: profile.location_lng,
      city: profile.city,
      radius_km: profile.radius_km,
      kyc_status: profile.kyc_status,
      kyc_review_note: profile.kyc_review_note ?? null,
      rating_avg: safeRatingAvg(profile.rating_avg),
      admin_can_rate: viewerUserId ? !(profile.admin_rater_user_ids ?? []).includes(viewerUserId) : true,
      total_shifts: completedShiftsCount,
      category_ids: profile.category_ids ?? [],
      payout_account_holder: profile.payout_account_holder ?? null,
      payout_masked_account: profile.payout_masked_account ?? null,
      payout_upi_id: profile.payout_upi_id ?? null,
      payout_verified: profile.payout_verified ?? false,
      created_at: profile.created_at
        ? new Date(profile.created_at as unknown as string).toISOString()
        : null,
      updated_at: profile.updated_at
        ? new Date(profile.updated_at as unknown as string).toISOString()
        : null,
    },
    user: {
      id: user._id,
      role: user.role,
      status: user.status,
      phone: user.phone ?? null,
      email: user.email ?? null,
      onboarding_step: user.onboarding_step ?? 0,
    },
    verification: {
      documents_uploaded: docs.length,
      documents: docsWithPreview,
    },
    qualifications,
  }
}

export async function listWorkerQualifications(profileId: string) {
  const profile = await adminWorkerRepo.findByProfileId(profileId)
  if (!profile) throw new AppError('WORKER_NOT_FOUND', 404, 'Worker profile not found')
  const quals = await workerQualificationRepo.listByWorkerProfileId(profileId)
  return quals.map((q) => {
    const toDate = q.to_date ? new Date(q.to_date as unknown as string) : null
    const created = q.created_at ? new Date(q.created_at as unknown as string) : null
    return {
      id: q._id,
      type: q.type,
      title: q.title,
      institution: q.institution,
      from_date: formatDobDate(q.from_date),
      to_date: toDate ? formatDobDate(toDate) : null,
      is_currently_pursuing: !toDate,
      description: q.description ?? null,
      verified: q.verified,
      created_at: created ? created.toISOString() : new Date().toISOString(),
    }
  })
}

export async function addWorkerQualification(profileId: string, body: AdminAddWorkerQualificationBody) {
  const profile = await adminWorkerRepo.findByProfileId(profileId)
  if (!profile) throw new AppError('WORKER_NOT_FOUND', 404, 'Worker profile not found')
  const created = await workerQualificationRepo.create({
    worker_profile_id: profileId,
    type: body.type,
    title: body.title.trim(),
    institution: body.institution.trim(),
    from_date: parseIsoDayToUtc(body.from_date),
    to_date: body.to_date ? parseIsoDayToUtc(body.to_date) : null,
    description: body.description?.trim() || null,
  })
  const toDate = created.to_date ? new Date(created.to_date as unknown as string) : null
  const createdAt = created.created_at ? new Date(created.created_at as unknown as string) : null
  return {
    id: created._id,
    type: created.type,
    title: created.title,
    institution: created.institution,
    from_date: formatDobDate(created.from_date),
    to_date: toDate ? formatDobDate(toDate) : null,
    is_currently_pursuing: !toDate,
    description: created.description ?? null,
    verified: created.verified,
    created_at: createdAt ? createdAt.toISOString() : new Date().toISOString(),
  }
}

export async function deleteWorkerQualification(profileId: string, qualificationId: string) {
  const profile = await adminWorkerRepo.findByProfileId(profileId)
  if (!profile) throw new AppError('WORKER_NOT_FOUND', 404, 'Worker profile not found')
  const all = await workerQualificationRepo.listByWorkerProfileId(profileId)
  const matched = all.find((q) => q._id === qualificationId)
  if (!matched) throw new AppError('QUALIFICATION_NOT_FOUND', 404, 'Qualification not found')
  await workerQualificationRepo.deleteById(qualificationId)
  return { id: qualificationId }
}

/**
 * Updates KYC status and optional review note on a worker profile.
 */
export async function updateWorkerKyc(profileId: string, body: PatchWorkerKycBody) {
  const profile = await adminWorkerRepo.findByProfileId(profileId)
  if (!profile) {
    throw new AppError('WORKER_NOT_FOUND', 404, 'Worker profile not found')
  }

  const patch: adminWorkerRepo.AdminKycPatch = { kyc_status: body.kyc_status }
  if (body.note !== undefined) {
    patch.kyc_review_note = body.note
  }
  const updated = await adminWorkerRepo.updateKycByProfileId(profileId, patch)
  if (!updated) {
    throw new AppError('WORKER_NOT_FOUND', 404, 'Worker profile not found')
  }

  return {
    id: updated._id,
    kyc_status: updated.kyc_status,
    kyc_review_note: updated.kyc_review_note ?? null,
    updated_at: updated.updated_at
      ? new Date(updated.updated_at as unknown as string).toISOString()
      : null,
  }
}

export async function updateWorkerProfile(profileId: string, body: PatchAdminWorkerProfileBody) {
  const profile = await adminWorkerRepo.findByProfileId(profileId)
  if (!profile) {
    throw new AppError('WORKER_NOT_FOUND', 404, 'Worker profile not found')
  }
  const user = await userRepo.findById(profile.user_id)
  if (!user) {
    throw new AppError('USER_NOT_FOUND', 404, 'Linked user not found')
  }

  const userSet: Record<string, unknown> = {}
  const userUnset: Record<string, true> = {}
  if (body.status !== undefined) userSet.status = body.status
  if (body.email !== undefined || body.phone !== undefined) {
    let nextEmail = user.email ?? null
    let nextPhone = user.phone ?? null
    if (body.email !== undefined) nextEmail = body.email === '' ? null : body.email.trim().toLowerCase()
    if (body.phone !== undefined) nextPhone = body.phone === '' ? null : body.phone.trim()
    if (!nextEmail && !nextPhone) {
      throw new AppError('USER_CONTACT_REQUIRED', 400, 'Worker must keep email or phone.')
    }
    if (nextEmail) {
      const clash = await userRepo.findByEmail(nextEmail)
      if (clash && clash._id !== user._id) throw new AppError('USER_ALREADY_EXISTS', 409, 'Email already in use')
      userSet.email = nextEmail
    } else if (body.email !== undefined) userUnset.email = true

    if (nextPhone) {
      const clash = await userRepo.findByPhone(nextPhone)
      if (clash && clash._id !== user._id) throw new AppError('USER_ALREADY_EXISTS', 409, 'Phone already in use')
      userSet.phone = nextPhone
    } else if (body.phone !== undefined) userUnset.phone = true
  }

  const patch: Parameters<typeof workerRepo.updateByUserId>[1] = {}
  if (body.full_name !== undefined) {
    if (!isValidFullName(body.full_name)) {
      throw new AppError('PROFILE_NAME_INVALID', 400, 'Name contains invalid characters or is too short')
    }
    patch.full_name = body.full_name.trim()
  }
  if (body.dob !== undefined) {
    const dobDate = parseDobString(body.dob)
    if (Number.isNaN(dobDate.getTime())) throw new AppError('PROFILE_DOB_INVALID', 400, 'Invalid date of birth')
    if (ageYearsUtc(dobDate) < 18) throw new AppError('PROFILE_UNDERAGE', 400, 'Worker must be at least 18 years old')
    patch.dob = dobDate
  }
  if (body.city !== undefined) patch.city = body.city.trim()
  if (body.location_lat !== undefined) patch.location_lat = body.location_lat
  if (body.location_lng !== undefined) patch.location_lng = body.location_lng
  if (body.radius_km !== undefined) patch.radius_km = body.radius_km
  if (body.bio !== undefined) patch.bio = body.bio
  if (body.avatar_url !== undefined) patch.avatar_url = body.avatar_url

  if (Object.keys(userSet).length > 0 || Object.keys(userUnset).length > 0) {
    await adminUserRepo.applyAdminPatch(user._id, { $set: userSet, $unset: userUnset })
  }
  if (Object.keys(patch).length > 0) {
    await workerRepo.updateByUserId(profile.user_id, patch)
  }
  return getWorkerDetail(profileId)
}

export async function rateWorker(profileId: string, stars: number, adminUserId: string) {
  const profile = await adminWorkerRepo.findByProfileId(profileId)
  if (!profile) throw new AppError('WORKER_NOT_FOUND', 404, 'Worker profile not found')
  const { doc: updated, alreadyRated } = await workerRepo.incrementRatingFromAdminOnce(profileId, adminUserId, stars)
  if (!updated) throw new AppError('WORKER_NOT_FOUND', 404, 'Worker profile not found')
  if (alreadyRated) throw new AppError('RATING_ALREADY_GIVEN', 409, 'You have already rated this worker')
  return {
    profile_id: profileId,
    rating_avg: safeRatingAvg(updated.rating_avg),
  }
}

export async function addWorkerDocument(profileId: string, body: AdminAddWorkerDocumentBody) {
  const profile = await adminWorkerRepo.findByProfileId(profileId)
  if (!profile) throw new AppError('WORKER_NOT_FOUND', 404, 'Worker profile not found')
  const created = await workerDocumentRepo.create({
    worker_profile_id: profileId,
    type: body.type,
    file_url: body.file_url,
  })
  return {
    id: created._id,
    worker_profile_id: created.worker_profile_id,
    type: created.type,
    file_url: created.file_url,
    status: created.status,
  }
}

function extensionForUpload(filename: string, contentType: string): string {
  const fromName = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : ''
  if (fromName && fromName.length <= 10) return fromName.toLowerCase()
  if (contentType === 'image/jpeg') return '.jpg'
  if (contentType === 'image/png') return '.png'
  if (contentType === 'image/webp') return '.webp'
  if (contentType === 'application/pdf') return '.pdf'
  return ''
}

export async function presignWorkerUpload(profileId: string, body: AdminPresignWorkerUploadBody) {
  const profile = await adminWorkerRepo.findByProfileId(profileId)
  if (!profile) throw new AppError('WORKER_NOT_FOUND', 404, 'Worker profile not found')
  const ext = extensionForUpload(body.filename, body.content_type)
  const key = `workers/${profileId}/${body.kind}/${Date.now()}_${nanoid(8)}${ext}`
  return createPresignedPutUrl(key, body.content_type, 300)
}

export async function uploadWorkerFile(
  profileId: string,
  kind: 'worker_document' | 'worker_avatar',
  filename: string,
  contentType: string,
  buffer: Buffer,
) {
  const profile = await adminWorkerRepo.findByProfileId(profileId)
  if (!profile) throw new AppError('WORKER_NOT_FOUND', 404, 'Worker profile not found')
  const ext = extensionForUpload(filename, contentType)
  const key = `workers/${profileId}/${kind}/${Date.now()}_${nanoid(8)}${ext}`
  const uploaded = await uploadBufferToS3(key, buffer, contentType)
  const preview_url = await createSignedGetUrl(key, 3600)
  return { ...uploaded, preview_url }
}

function extractS3KeyForWorker(fileUrl: string, profileId: string): string {
  const u = new URL(fileUrl)
  const key = u.pathname.replace(/^\/+/, '')
  if (!key.startsWith(`workers/${profileId}/`)) {
    throw new AppError('UPLOAD_KEY_INVALID', 400, 'File URL is not within this worker directory')
  }
  return key
}

async function toPreviewUrlIfS3(fileUrl: string | null | undefined, profileId: string): Promise<string | null> {
  if (!fileUrl || !/^https?:\/\//i.test(fileUrl)) return null
  try {
    const key = extractS3KeyForWorker(fileUrl, profileId)
    return await createSignedGetUrl(key, 3600)
  } catch {
    return fileUrl
  }
}

export async function deleteWorkerUpload(profileId: string, body: AdminDeleteWorkerUploadBody) {
  const profile = await adminWorkerRepo.findByProfileId(profileId)
  if (!profile) throw new AppError('WORKER_NOT_FOUND', 404, 'Worker profile not found')
  const key = extractS3KeyForWorker(body.file_url, profileId)
  await deleteS3ObjectByKey(key)
  return { deleted: true }
}

export async function reviewWorkerDocument(
  profileId: string,
  documentId: string,
  body: AdminReviewWorkerDocumentBody,
) {
  const profile = await adminWorkerRepo.findByProfileId(profileId)
  if (!profile) throw new AppError('WORKER_NOT_FOUND', 404, 'Worker profile not found')
  const updated = await workerDocumentRepo.setStatusById(documentId, profileId, body.status)
  if (!updated) throw new AppError('DOCUMENT_NOT_FOUND', 404, 'Document not found')
  return {
    id: updated._id,
    status: updated.status,
    reviewed_at: updated.reviewed_at ? new Date(updated.reviewed_at as unknown as string).toISOString() : null,
  }
}

export async function deleteWorkerDocument(profileId: string, documentId: string) {
  const profile = await adminWorkerRepo.findByProfileId(profileId)
  if (!profile) throw new AppError('WORKER_NOT_FOUND', 404, 'Worker profile not found')
  const docs = await workerDocumentRepo.listByWorkerProfileId(profileId)
  const hit = docs.find((d) => d._id === documentId)
  if (!hit) throw new AppError('DOCUMENT_NOT_FOUND', 404, 'Document not found')
  try {
    const key = extractS3KeyForWorker(hit.file_url, profileId)
    await deleteS3ObjectByKey(key)
  } catch {
    // Non-S3 URLs or already-deleted objects should not block record deletion.
  }
  const ok = await workerDocumentRepo.deleteById(documentId, profileId)
  if (!ok) throw new AppError('DOCUMENT_NOT_FOUND', 404, 'Document not found')
  return { deleted: true }
}

/**
 * Paginated list of employer companies (minimal fields for the table).
 */
export async function listEmployers(q: AdminEmployerListQuery) {
  const page = q.page ?? 1
  const limit = q.limit ?? 20
  const skip = (page - 1) * limit
  const filter: adminEmployerRepo.AdminEmployerListFilter = {}
  if (q.verified !== undefined) filter.verified = q.verified
  if (q.search?.trim()) filter.search = q.search.trim()
  const total = await adminEmployerRepo.countForList(filter)
  const rows = await adminEmployerRepo.listForList(filter, skip, limit)
  const employers = await Promise.all(
    rows.map(async (e) => ({
      id: e._id,
      company_name: e.company_name,
      logo_url: e.logo_url ?? null,
      logo_preview_url: await toPreviewUrlIfS3Employer(e.logo_url ?? null, e._id),
      logo_fit: e.logo_fit ?? 'contain',
      verified: e.verified ?? false,
      rating_avg: safeRatingAvg(e.rating_avg),
      total_shifts_posted: e.total_shifts_posted ?? 0,
      created_at: e.created_at ? new Date(e.created_at as unknown as string).toISOString() : null,
    })),
  )
  return { employers, total, page, limit }
}

/**
 * Single employer profile by `emp_…` id (same fields as stored today).
 */
export async function getEmployerDetail(employerId: string, viewerUserId?: string) {
  const e = await employerRepo.findById(employerId)
  if (!e) {
    throw new AppError('EMPLOYER_NOT_FOUND', 404, 'Employer profile not found')
  }
  const logo_preview_url = await toPreviewUrlIfS3Employer(e.logo_url ?? null, e._id)
  return {
    id: e._id,
    company_name: e.company_name,
    logo_url: e.logo_url ?? null,
    logo_preview_url,
    logo_fit: e.logo_fit ?? 'contain',
    verified: e.verified ?? false,
    rating_avg: safeRatingAvg(e.rating_avg),
    admin_can_rate: viewerUserId ? !(e.admin_rater_user_ids ?? []).includes(viewerUserId) : true,
    total_shifts_posted: e.total_shifts_posted ?? 0,
    industry: e.industry ?? null,
    company_size: e.company_size ?? null,
    website_url: e.website_url ?? null,
    contact_name: e.contact_name ?? null,
    contact_email: e.contact_email ?? null,
    contact_phone: e.contact_phone ?? null,
    city: e.city ?? null,
    address_line1: e.address_line1 ?? null,
    address_line2: e.address_line2 ?? null,
    notes: e.notes ?? null,
    status: e.status ?? 'active',
    created_at: e.created_at ? new Date(e.created_at as unknown as string).toISOString() : null,
    updated_at: e.updated_at ? new Date(e.updated_at as unknown as string).toISOString() : null,
  }
}

function extractS3KeyForEmployer(fileUrl: string, employerId: string): string {
  const u = new URL(fileUrl)
  const key = u.pathname.replace(/^\/+/, '')
  if (!key.startsWith(`employers/${employerId}/`)) {
    throw new AppError('UPLOAD_KEY_INVALID', 400, 'File URL is not within this employer directory')
  }
  return key
}

async function toPreviewUrlIfS3Employer(fileUrl: string | null | undefined, employerId: string): Promise<string | null> {
  if (!fileUrl || !/^https?:\/\//i.test(fileUrl)) return null
  try {
    const key = extractS3KeyForEmployer(fileUrl, employerId)
    return await createSignedGetUrl(key, 3600)
  } catch {
    return fileUrl
  }
}

/**
 * Turns employer `verified` on or off (platform trust).
 */
export async function updateEmployerVerification(employerId: string, body: PatchEmployerVerificationBody) {
  const e = await adminEmployerRepo.setVerified(employerId, body.verified)
  if (!e) {
    throw new AppError('EMPLOYER_NOT_FOUND', 404, 'Employer profile not found')
  }
  return {
    id: e._id,
    verified: e.verified ?? false,
    updated_at: e.updated_at ? new Date(e.updated_at as unknown as string).toISOString() : null,
  }
}

export async function rateEmployer(employerId: string, body: AdminRateEmployerBody, adminUserId: string) {
  const { doc: updated, alreadyRated } = await employerRepo.incrementRatingFromAdminOnce(employerId, adminUserId, body.stars)
  if (!updated) throw new AppError('EMPLOYER_NOT_FOUND', 404, 'Employer profile not found')
  if (alreadyRated) throw new AppError('RATING_ALREADY_GIVEN', 409, 'You have already rated this employer')
  return {
    id: updated._id,
    rating_avg: safeRatingAvg(updated.rating_avg),
    rating_count: updated.rating_count ?? 0,
  }
}

export async function updateEmployerProfile(employerId: string, body: PatchAdminEmployerProfileBody) {
  const patch: {
    company_name?: string
    logo_url?: string | null
    logo_fit?: 'contain' | 'cover'
    verified?: boolean
    industry?: string | null
    company_size?: string | null
    website_url?: string | null
    contact_name?: string | null
    contact_email?: string | null
    contact_phone?: string | null
    city?: string | null
    address_line1?: string | null
    address_line2?: string | null
    notes?: string | null
    status?: 'active' | 'inactive'
  } = {}
  if (body.company_name !== undefined) patch.company_name = body.company_name.trim()
  if (body.logo_url !== undefined) patch.logo_url = body.logo_url
  if (body.logo_fit !== undefined) patch.logo_fit = body.logo_fit
  if (body.verified !== undefined) patch.verified = body.verified
  if (body.industry !== undefined) patch.industry = body.industry
  if (body.company_size !== undefined) patch.company_size = body.company_size
  if (body.website_url !== undefined) patch.website_url = body.website_url
  if (body.contact_name !== undefined) patch.contact_name = body.contact_name
  if (body.contact_email !== undefined) patch.contact_email = body.contact_email
  if (body.contact_phone !== undefined) patch.contact_phone = body.contact_phone || null
  if (body.city !== undefined) patch.city = body.city
  if (body.address_line1 !== undefined) patch.address_line1 = body.address_line1
  if (body.address_line2 !== undefined) patch.address_line2 = body.address_line2
  if (body.notes !== undefined) patch.notes = body.notes
  if (body.status !== undefined) patch.status = body.status
  const e = await adminEmployerRepo.patchById(employerId, patch)
  if (!e) throw new AppError('EMPLOYER_NOT_FOUND', 404, 'Employer profile not found')
  return {
    id: e._id,
    company_name: e.company_name,
    logo_url: e.logo_url ?? null,
    logo_fit: e.logo_fit ?? 'contain',
    verified: e.verified ?? false,
    rating_avg: safeRatingAvg(e.rating_avg),
    total_shifts_posted: e.total_shifts_posted ?? 0,
    industry: e.industry ?? null,
    company_size: e.company_size ?? null,
    website_url: e.website_url ?? null,
    contact_name: e.contact_name ?? null,
    contact_email: e.contact_email ?? null,
    contact_phone: e.contact_phone ?? null,
    city: e.city ?? null,
    address_line1: e.address_line1 ?? null,
    address_line2: e.address_line2 ?? null,
    notes: e.notes ?? null,
    status: e.status ?? 'active',
    created_at: e.created_at ? new Date(e.created_at as unknown as string).toISOString() : null,
    updated_at: e.updated_at ? new Date(e.updated_at as unknown as string).toISOString() : null,
  }
}

export async function createEmployer(body: CreateAdminEmployerBody) {
  const e = await adminEmployerRepo.createEmployer({
    company_name: body.company_name.trim(),
    logo_url: body.logo_url ?? null,
    logo_fit: body.logo_fit ?? 'contain',
    verified: body.verified ?? false,
    industry: body.industry ?? null,
    company_size: body.company_size ?? null,
    website_url: body.website_url ?? null,
    contact_name: body.contact_name ?? null,
    contact_email: body.contact_email ?? null,
    contact_phone: body.contact_phone || null,
    city: body.city ?? null,
    address_line1: body.address_line1 ?? null,
    address_line2: body.address_line2 ?? null,
    notes: body.notes ?? null,
    status: body.status ?? 'active',
  })
  return {
    id: e._id,
    company_name: e.company_name,
    verified: e.verified ?? false,
    created_at: e.created_at ? new Date(e.created_at as unknown as string).toISOString() : null,
  }
}

export async function bulkCreateEmployersFromExcel(fileBuffer: Buffer) {
  const wb = XLSX.read(fileBuffer, { type: 'buffer' })
  const firstSheet = wb.SheetNames[0]
  if (!firstSheet) throw new AppError('VALIDATION_ERROR', 400, 'Excel file has no sheets')
  const ws = wb.Sheets[firstSheet]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
  if (rows.length === 0) throw new AppError('VALIDATION_ERROR', 400, 'Excel sheet is empty')
  if (rows.length > 10) throw new AppError('VALIDATION_ERROR', 400, 'Maximum 10 rows allowed per upload')

  const normalize = (v: unknown) => String(v ?? '').trim()
  let created = 0
  const errors: Array<{ row: number; message: string }> = []

  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i]
    const body: CreateAdminEmployerBody = {
      company_name: normalize(r.company_name),
      industry: normalize(r.industry) || null,
      company_size: normalize(r.company_size) || null,
      website_url: normalize(r.website_url) || null,
      contact_name: normalize(r.contact_name) || null,
      contact_email: normalize(r.contact_email) || null,
      contact_phone: normalize(r.contact_phone) || null,
      city: normalize(r.city) || null,
      address_line1: normalize(r.address_line1) || null,
      address_line2: normalize(r.address_line2) || null,
      notes: normalize(r.notes) || null,
      logo_url: normalize(r.logo_url) || null,
      logo_fit: normalize(r.logo_fit).toLowerCase() === 'cover' ? 'cover' : 'contain',
      verified: normalize(r.verified).toLowerCase() === 'true',
      status: normalize(r.status).toLowerCase() === 'inactive' ? 'inactive' : 'active',
    }
    try {
      if (!body.company_name) throw new Error('company_name is required')
      await createEmployer(body)
      created += 1
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid row'
      errors.push({ row: i + 2, message: msg })
    }
  }

  return { total_rows: rows.length, created, failed: errors.length, errors }
}

export function buildEmployersBulkUploadSampleXlsx(): Buffer {
  const headers = [
    'company_name',
    'industry',
    'company_size',
    'website_url',
    'contact_name',
    'contact_email',
    'contact_phone',
    'city',
    'address_line1',
    'address_line2',
    'notes',
    'logo_url',
    'logo_fit',
    'verified',
    'status',
  ]
  const sampleRows = [
    {
      company_name: 'Regal Events Pvt Ltd',
      industry: 'Events',
      company_size: '20-50',
      website_url: 'https://regalevents.example',
      contact_name: 'Akhilesh Yadav',
      contact_email: 'ops@regalevents.example',
      contact_phone: '+919876543210',
      city: 'Jaipur',
      address_line1: 'Near Jaipur Chaupati',
      address_line2: 'Rajasthan',
      notes: 'Preferred staffing partner',
      logo_url: '',
      logo_fit: 'contain',
      verified: 'true',
      status: 'active',
    },
  ]
  const ws = XLSX.utils.json_to_sheet(sampleRows, { header: headers })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Employers')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

export async function deleteEmployer(employerId: string, body: DeleteAdminEmployerBody) {
  const e = await employerRepo.findById(employerId)
  if (!e) throw new AppError('EMPLOYER_NOT_FOUND', 404, 'Employer profile not found')
  if (body.confirmation.trim() !== e.company_name) {
    throw new AppError('INVALID_CONFIRMATION', 400, 'Confirmation text must exactly match company name')
  }
  const ok = await adminEmployerRepo.deleteById(employerId)
  if (!ok) throw new AppError('EMPLOYER_NOT_FOUND', 404, 'Employer profile not found')
  return { deleted: true }
}

export async function uploadEmployerLogo(
  employerId: string,
  filename: string,
  contentType: string,
  buffer: Buffer,
) {
  const employer = await employerRepo.findById(employerId)
  if (!employer) throw new AppError('EMPLOYER_NOT_FOUND', 404, 'Employer profile not found')
  const ext = extensionForUpload(filename, contentType)
  const key = `employers/${employerId}/logo/${Date.now()}_${nanoid(8)}${ext}`
  const uploaded = await uploadBufferToS3(key, buffer, contentType)
  const preview_url = await createSignedGetUrl(key, 3600)
  return { ...uploaded, preview_url }
}

export async function deleteEmployerUpload(employerId: string, body: AdminDeleteEmployerUploadBody) {
  const employer = await employerRepo.findById(employerId)
  if (!employer) throw new AppError('EMPLOYER_NOT_FOUND', 404, 'Employer profile not found')
  const key = extractS3KeyForEmployer(body.file_url, employerId)
  await deleteS3ObjectByKey(key)
  return { deleted: true }
}

/**
 * Paginated timesheet queue with optional status / worker / shift filters.
 * Enriches each row with shift title and worker name for the table.
 */
export async function listTimesheets(q: AdminTimesheetListQuery) {
  const page = q.page ?? 1
  const limit = q.limit ?? 20
  const skip = (page - 1) * limit
  const f: adminTimesheetRepo.AdminTimesheetQueueFilter = {}
  if (q.status !== undefined) f.status = q.status
  if (q.worker_profile_id !== undefined) f.worker_profile_id = q.worker_profile_id
  if (q.shift_id !== undefined) f.shift_id = q.shift_id

  // worker name search: resolve matching profile ids first
  if (q.search?.trim()) {
    const matchedProfiles = await WorkerProfileModel.find(
      { full_name: { $regex: q.search.trim(), $options: 'i' } },
      { _id: 1 },
    ).lean().exec()
    f.worker_profile_id = { $in: matchedProfiles.map((p) => String(p._id)) } as unknown as string
  }

  const total = await adminTimesheetRepo.countForQueue(f)
  const rows = await adminTimesheetRepo.listForQueue(f, skip, limit)

  const items = []
  for (const t of rows) {
    const shift = await shiftRepo.findById(t.shift_id)
    const wp = await adminWorkerRepo.findByProfileId(t.worker_profile_id)
    items.push({
      id: t._id,
      application_id: t.application_id,
      shift_id: t.shift_id,
      worker_profile_id: t.worker_profile_id,
      status: t.status,
      clock_in: t.clock_in.toISOString(),
      clock_out: t.clock_out ? t.clock_out.toISOString() : null,
      total_hours: t.total_hours ?? null,
      gross_amount: t.gross_amount ?? null,
      shift_title: shift?.title ?? 'Unknown',
      worker_name: wp?.full_name ?? 'Unknown',
    })
  }

  return { timesheets: items, total, page, limit }
}

export async function listShifts(q: AdminShiftListQuery) {
  const page = q.page ?? 1
  const limit = q.limit ?? 20
  const skip = (page - 1) * limit
  const f: Record<string, unknown> = {}
  if (q.status !== undefined) f.status = q.status
  if (q.employer_id !== undefined) f.employer_id = q.employer_id
  if (q.search?.trim()) f.title = { $regex: q.search.trim(), $options: 'i' }
  const total = await ShiftModel.countDocuments(f).exec()
  const rows = await ShiftModel.find(f).sort({ date: -1, start_time: 1 }).skip(skip).limit(limit).exec()
  const shifts = await Promise.all(
    rows.map(async (s) => {
      const emp = await employerRepo.findById(s.employer_id)
      const cat = await categoryRepo.findById(s.category_id)
      return {
        id: s._id,
        title: s.title,
        employer_id: s.employer_id,
        employer_name: emp?.company_name ?? 'Unknown',
        category_id: s.category_id,
        category_name: cat?.name ?? 'Unknown',
        date: s.date.toISOString().slice(0, 10),
        start_time: s.start_time,
        end_time: s.end_time,
        hourly_rate: s.hourly_rate,
        currency: s.currency,
        slots_total: s.slots_total,
        slots_filled: s.slots_filled,
        status: s.status,
        address: s.address,
        created_at: s.created_at ? new Date(s.created_at as unknown as string).toISOString() : null,
      }
    }),
  )
  return { shifts, total, page, limit }
}

export async function createShift(body: CreateAdminShiftBody) {
  const row = await ShiftModel.create({
    employer_id: body.employer_id,
    category_id: body.category_id,
    title: body.title.trim(),
    description: body.description?.trim() ?? '',
    date: parseIsoDayToUtc(body.date),
    start_time: body.start_time,
    end_time: body.end_time,
    hourly_rate: body.hourly_rate,
    currency: body.currency,
    slots_total: body.slots_total,
    slots_filled: 0,
    address: body.address.trim(),
    location_lat: body.location_lat,
    location_lng: body.location_lng,
    geofence_radius_m: body.geofence_radius_m,
    status: body.status ?? 'open',
  })
  return { id: row._id }
}

export async function getShiftDetailByAdmin(shiftId: string) {
  const s = await ShiftModel.findById(shiftId).exec()
  if (!s) throw new AppError('SHIFT_NOT_FOUND', 404, 'Shift not found')
  const [emp, cat, applications_count, timesheets_count] = await Promise.all([
    employerRepo.findById(s.employer_id),
    categoryRepo.findById(s.category_id),
    ShiftApplicationModel.countDocuments({ shift_id: shiftId }).exec(),
    TimesheetModel.countDocuments({ shift_id: shiftId }).exec(),
  ])
  return {
    id: s._id,
    employer_id: s.employer_id,
    employer_name: emp?.company_name ?? 'Unknown',
    category_id: s.category_id,
    category_name: cat?.name ?? 'Unknown',
    title: s.title,
    description: s.description,
    date: s.date.toISOString().slice(0, 10),
    start_time: s.start_time,
    end_time: s.end_time,
    hourly_rate: s.hourly_rate,
    currency: s.currency,
    slots_total: s.slots_total,
    slots_filled: s.slots_filled,
    status: s.status,
    address: s.address,
    location_lat: s.location_lat,
    location_lng: s.location_lng,
    geofence_radius_m: s.geofence_radius_m,
    applications_count,
    timesheets_count,
    created_at: s.created_at ? new Date(s.created_at as unknown as string).toISOString() : null,
    updated_at: s.updated_at ? new Date(s.updated_at as unknown as string).toISOString() : null,
  }
}

export async function getWorkerShiftHistory(workerProfileId: string) {
  // All applications for this worker, most recent first
  const apps = await ShiftApplicationModel.find({ worker_profile_id: workerProfileId })
    .sort({ applied_at: -1 })
    .lean()
    .exec()

  if (apps.length === 0) return []

  const shiftIds = apps.map((a) => a.shift_id)
  const appIds = apps.map((a) => a._id)

  // Fetch shifts, timesheets and employer profiles in parallel
  const [shifts, timesheets] = await Promise.all([
    ShiftModel.find({ _id: { $in: shiftIds } }).lean().exec(),
    TimesheetModel.find({ application_id: { $in: appIds } }).lean().exec(),
  ])

  const employerIds = [...new Set(shifts.map((s) => s.employer_id))]
  const employers = await Promise.all(employerIds.map((id) => employerRepo.findById(id)))

  const shiftMap = new Map(shifts.map((s) => [s._id, s]))
  const timesheetMap = new Map(timesheets.map((t) => [t.application_id, t]))
  const employerMap = new Map(
    employers.filter(Boolean).map((e) => [e!._id, e!])
  )

  return apps.map((app) => {
    const shift = shiftMap.get(app.shift_id)
    const ts = timesheetMap.get(app._id)
    const employer = shift ? employerMap.get(shift.employer_id) : undefined

    return {
      application_id: app._id,
      status: app.status,
      applied_at: new Date(app.applied_at as unknown as string).toISOString(),
      shift: shift
        ? {
            id: shift._id,
            title: shift.title,
            date: shift.date ? new Date(shift.date as unknown as string).toISOString().slice(0, 10) : null,
            start_time: shift.start_time,
            end_time: shift.end_time,
            hourly_rate: shift.hourly_rate,
            currency: shift.currency,
            address: shift.address,
            employer_id: shift.employer_id,
            employer_name: employer?.company_name ?? 'Unknown',
            employer_logo_url: employer?.logo_url ?? null,
            category_id: shift.category_id,
          }
        : null,
      timesheet: ts
        ? {
            id: ts._id,
            status: ts.status,
            clock_in: ts.clock_in ? new Date(ts.clock_in as unknown as string).toISOString() : null,
            clock_out: ts.clock_out ? new Date(ts.clock_out as unknown as string).toISOString() : null,
            total_hours: ts.total_hours ?? null,
            gross_amount: ts.gross_amount ?? null,
            net_to_worker: ts.net_to_worker ?? null,
            approved_at: ts.approved_at ? new Date(ts.approved_at as unknown as string).toISOString() : null,
            // What the worker thought about the company
            worker_rating_employer: (ts as unknown as Record<string, unknown>).worker_rating_employer as number | null ?? null,
            // What the employer thought about this worker
            employer_rating_worker: (ts as unknown as Record<string, unknown>).employer_rating_worker as number | null ?? null,
          }
        : null,
    }
  })
}

export async function getShiftApplications(shiftId: string) {
  const shift = await ShiftModel.findById(shiftId).lean().exec()
  if (!shift) throw new AppError('SHIFT_NOT_FOUND', 404, 'Shift not found')

  const apps = await ShiftApplicationModel.find({ shift_id: shiftId }).sort({ applied_at: -1 }).lean().exec()
  if (apps.length === 0) return []

  const workerProfileIds = apps.map((a) => a.worker_profile_id)
  const profiles = await WorkerProfileModel.find({ _id: { $in: workerProfileIds } }).lean().exec()
  const userIds = profiles.map((p) => p.user_id)
  const users = await UserModel.find({ _id: { $in: userIds } }).lean().exec()

  const profileMap = new Map(profiles.map((p) => [p._id, p]))
  const userMap = new Map(users.map((u) => [u._id as string, u]))

  return Promise.all(
    apps.map(async (app) => {
      const profile = profileMap.get(app.worker_profile_id)
      const user = profile ? userMap.get(profile.user_id) : undefined
      const avatarPreviewUrl = profile?.avatar_url
        ? await toPreviewUrlIfS3(profile.avatar_url, profile._id)
        : null
      return {
        application_id: app._id,
        worker_profile_id: app.worker_profile_id,
        status: app.status,
        applied_at: new Date(app.applied_at as unknown as string).toISOString(),
        worker: profile
          ? {
              full_name: profile.full_name,
              avatar_url: avatarPreviewUrl,
              city: profile.city,
              kyc_status: profile.kyc_status,
              rating_avg: profile.rating_avg,
              rating_count: profile.rating_count,
              total_shifts: profile.total_shifts,
            }
          : null,
        user: user
          ? {
              id: user._id as string,
              email: (user as unknown as Record<string, unknown>).email as string | null ?? null,
              phone: (user as unknown as Record<string, unknown>).phone as string | null ?? null,
            }
          : null,
      }
    })
  )
}

export async function patchShiftApplicationStatus(applicationId: string, status: string) {
  const allowed = ['applied', 'confirmed', 'rejected', 'completed', 'cancelled']
  if (!allowed.includes(status)) throw new AppError('VALIDATION_ERROR', 400, 'Invalid status')

  // Fetch previous status before updating so we can sync total_shifts
  const existing = await ShiftApplicationModel.findById(applicationId).exec()
  if (!existing) throw new AppError('APPLICATION_NOT_FOUND', 404, 'Application not found')

  const prevStatus = existing.status
  existing.status = status as typeof existing.status
  await existing.save()

  // Keep total_shifts in sync with completed transitions
  const wasCompleted = prevStatus === 'completed'
  const isNowCompleted = status === 'completed'
  if (!wasCompleted && isNowCompleted) {
    await WorkerProfileModel.findByIdAndUpdate(
      existing.worker_profile_id,
      { $inc: { total_shifts: 1 } },
    ).exec()
  } else if (wasCompleted && !isNowCompleted) {
    await WorkerProfileModel.findByIdAndUpdate(
      existing.worker_profile_id,
      { $inc: { total_shifts: -1 } },
    ).exec()
  }

  return { id: existing._id, status: existing.status }
}

export async function listAllApplications(opts: {
  status?: string
  search?: string
  page: number
  limit: number
}) {
  const { status, search, page, limit } = opts
  const filter: Record<string, unknown> = {}
  if (status) filter.status = status

  if (search) {
    const matchedProfiles = await WorkerProfileModel.find(
      { full_name: { $regex: search.trim(), $options: 'i' } },
      { _id: 1 },
    ).lean().exec()
    filter.worker_profile_id = { $in: matchedProfiles.map((p) => p._id) }
  }

  const total = await ShiftApplicationModel.countDocuments(filter).exec()
  const apps = await ShiftApplicationModel.find(filter)
    .sort({ applied_at: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean()
    .exec()

  if (apps.length === 0) return { items: [], total }

  const shiftIds = [...new Set(apps.map((a) => String(a.shift_id)))]
  const workerProfileIds = [...new Set(apps.map((a) => String(a.worker_profile_id)))]

  const [shifts, profiles] = await Promise.all([
    ShiftModel.find({ _id: { $in: shiftIds } }).lean().exec(),
    WorkerProfileModel.find({ _id: { $in: workerProfileIds } }).lean().exec(),
  ])

  const userIds = profiles.map((p) => String(p.user_id))
  const users = await UserModel.find({ _id: { $in: userIds } }).lean().exec()

  const shiftMap = new Map(shifts.map((s) => [String(s._id), s]))
  const profileMap = new Map(profiles.map((p) => [String(p._id), p]))
  const userMap = new Map(users.map((u) => [String(u._id), u]))

  const items = await Promise.all(
    apps.map(async (app) => {
      const profile = profileMap.get(String(app.worker_profile_id))
      const shift = shiftMap.get(String(app.shift_id))
      const user = profile ? userMap.get(String(profile.user_id)) : undefined
      const avatarPreviewUrl = profile?.avatar_url
        ? await toPreviewUrlIfS3(profile.avatar_url, profile._id)
        : null
      return {
        application_id: String(app._id),
        worker_profile_id: String(app.worker_profile_id),
        shift_id: String(app.shift_id),
        status: app.status,
        applied_at: new Date(app.applied_at as unknown as string).toISOString(),
        worker: profile
          ? {
              full_name: profile.full_name,
              avatar_url: avatarPreviewUrl,
              city: profile.city,
              kyc_status: profile.kyc_status,
              rating_avg: profile.rating_avg,
              total_shifts: profile.total_shifts,
            }
          : null,
        shift: shift
          ? {
              id: String(shift._id),
              title: shift.title,
              date: shift.date
                ? new Date(shift.date as unknown as string).toISOString().substring(0, 10)
                : null,
              start_time: shift.start_time,
              end_time: shift.end_time,
              hourly_rate: shift.hourly_rate,
              employer_name: (shift as unknown as Record<string, unknown>).employer_name as string ?? '',
              status: shift.status,
            }
          : null,
        user: user
          ? {
              id: String(user._id),
              email: (user as unknown as Record<string, unknown>).email as string | null ?? null,
              phone: (user as unknown as Record<string, unknown>).phone as string | null ?? null,
            }
          : null,
      }
    }),
  )

  return { items, total }
}

export async function getApplicationDetail(applicationId: string) {
  const app = await ShiftApplicationModel.findById(applicationId).lean().exec()
  if (!app) throw new AppError('APPLICATION_NOT_FOUND', 404, 'Application not found')

  const [profile, shift, timesheet] = await Promise.all([
    WorkerProfileModel.findById(app.worker_profile_id).lean().exec(),
    ShiftModel.findById(app.shift_id).lean().exec(),
    TimesheetModel.findOne({ application_id: applicationId }).lean().exec(),
  ])

  const [user, employer] = await Promise.all([
    profile ? UserModel.findById(profile.user_id).lean().exec() : Promise.resolve(null),
    shift ? employerRepo.findById(String(shift.employer_id)) : Promise.resolve(null),
  ])

  const avatarPreviewUrl = profile?.avatar_url
    ? await toPreviewUrlIfS3(profile.avatar_url, profile._id)
    : null

  const workerQuals = profile
    ? await workerQualificationRepo.listByWorkerProfileId(String(profile._id))
    : []

  return {
    application_id: String(app._id),
    status: app.status,
    applied_at: new Date(app.applied_at as unknown as string).toISOString(),

    worker: profile ? {
      id: String(profile._id),
      full_name: profile.full_name,
      avatar_url: avatarPreviewUrl,
      city: profile.city,
      bio: profile.bio ?? null,
      dob: profile.dob ? new Date(profile.dob as unknown as string).toISOString().slice(0, 10) : null,
      radius_km: profile.radius_km,
      kyc_status: profile.kyc_status,
      kyc_review_note: profile.kyc_review_note ?? null,
      rating_avg: profile.rating_avg,
      rating_count: (profile as unknown as Record<string, unknown>).rating_count as number ?? 0,
      total_shifts: profile.total_shifts,
      payout_account_holder: profile.payout_account_holder ?? null,
      payout_masked_account: profile.payout_masked_account ?? null,
      payout_upi_id: profile.payout_upi_id ?? null,
      created_at: profile.created_at ? new Date(profile.created_at as unknown as string).toISOString() : null,
    } : null,

    user: user ? {
      id: String(user._id),
      email: (user as unknown as Record<string, unknown>).email as string | null ?? null,
      phone: (user as unknown as Record<string, unknown>).phone as string | null ?? null,
      role: user.role,
      status: user.status,
      onboarding_step: user.onboarding_step,
    } : null,

    shift: shift ? {
      id: String(shift._id),
      title: shift.title,
      description: shift.description ?? null,
      date: shift.date ? new Date(shift.date as unknown as string).toISOString().slice(0, 10) : null,
      start_time: shift.start_time,
      end_time: shift.end_time,
      hourly_rate: shift.hourly_rate,
      currency: shift.currency,
      slots_total: shift.slots_total,
      slots_filled: shift.slots_filled,
      status: shift.status,
      address: shift.address,
      location_lat: shift.location_lat ?? null,
      location_lng: shift.location_lng ?? null,
      geofence_radius_m: shift.geofence_radius_m ?? null,
      employer_id: String(shift.employer_id),
      employer_name: employer?.company_name ?? 'Unknown',
      employer_logo_url: employer ? await toPreviewUrlIfS3Employer(employer.logo_url ?? null, String(employer._id)) : null,
      employer_verified: employer?.verified ?? false,
      employer_rating: employer?.rating_avg ?? 0,
    } : null,

    timesheet: timesheet ? {
      id: String(timesheet._id),
      status: timesheet.status,
      clock_in: timesheet.clock_in ? new Date(timesheet.clock_in as unknown as string).toISOString() : null,
      clock_out: timesheet.clock_out ? new Date(timesheet.clock_out as unknown as string).toISOString() : null,
      clock_in_lat: (timesheet as unknown as Record<string, unknown>).clock_in_lat as number | null ?? null,
      clock_in_lng: (timesheet as unknown as Record<string, unknown>).clock_in_lng as number | null ?? null,
      distance_from_venue_m: (timesheet as unknown as Record<string, unknown>).distance_from_venue_m as number | null ?? null,
      total_hours: timesheet.total_hours ?? null,
      gross_amount: timesheet.gross_amount ?? null,
      platform_fee: (timesheet as unknown as Record<string, unknown>).platform_fee as number | null ?? null,
      net_to_worker: timesheet.net_to_worker ?? null,
      approved_at: timesheet.approved_at ? new Date(timesheet.approved_at as unknown as string).toISOString() : null,
      worker_rating_employer: (timesheet as unknown as Record<string, unknown>).worker_rating_employer as number | null ?? null,
      employer_rating_worker: (timesheet as unknown as Record<string, unknown>).employer_rating_worker as number | null ?? null,
    } : null,

    qualifications: workerQuals.slice(0, 5).map((q) => ({
      id: q.id,
      type: q.type,
      title: q.title,
      institution: q.institution,
      from_date: q.from_date,
      to_date: q.to_date ?? null,
    })),
  }
}

export async function updateShift(shiftId: string, body: PatchAdminShiftBody) {
  const patch: Record<string, unknown> = { ...body }
  if (body.title !== undefined) patch.title = body.title.trim()
  if (body.description !== undefined) patch.description = body.description ?? ''
  if (body.address !== undefined) patch.address = body.address.trim()
  if (body.date !== undefined) patch.date = parseIsoDayToUtc(body.date)
  if (body.slots_filled !== undefined && body.slots_total !== undefined && body.slots_filled > body.slots_total) {
    throw new AppError('VALIDATION_ERROR', 400, 'slots_filled cannot exceed slots_total')
  }
  const row = await ShiftModel.findByIdAndUpdate(shiftId, { $set: patch }, { new: true }).exec()
  if (!row) throw new AppError('SHIFT_NOT_FOUND', 404, 'Shift not found')
  return { id: row._id, updated_at: row.updated_at ? new Date(row.updated_at as unknown as string).toISOString() : null }
}

export async function deleteShift(shiftId: string) {
  const countApps = await ShiftApplicationModel.countDocuments({ shift_id: shiftId }).exec()
  const countTs = await TimesheetModel.countDocuments({ shift_id: shiftId }).exec()
  if (countApps > 0 || countTs > 0) {
    throw new AppError('SHIFT_HAS_ACTIVITY', 400, 'Cannot delete shift with applications or timesheets')
  }
  const res = await ShiftModel.deleteOne({ _id: shiftId }).exec()
  if (res.deletedCount === 0) throw new AppError('SHIFT_NOT_FOUND', 404, 'Shift not found')
  return { deleted: true }
}

export async function listShiftCategories() {
  const rows = await categoryRepo.listAll()
  return rows.map((c) => ({ id: c._id, name: c.name, slug: c.slug }))
}

/**
 * One timesheet with joined shift, worker, and employer snippets for review.
 */
export async function getTimesheetDetail(timesheetId: string) {
  const t = await timesheetRepo.findById(timesheetId)
  if (!t) {
    throw new AppError('TIMESHEET_NOT_FOUND', 404, 'Timesheet not found')
  }
  const shift = await shiftRepo.findById(t.shift_id)
  const wp = await adminWorkerRepo.findByProfileId(t.worker_profile_id)
  const emp = shift ? await employerRepo.findById(shift.employer_id) : null

  return {
    id: t._id,
    application_id: t.application_id,
    shift_id: t.shift_id,
    worker_profile_id: t.worker_profile_id,
    status: t.status,
    clock_in: t.clock_in.toISOString(),
    clock_out: t.clock_out ? t.clock_out.toISOString() : null,
    clock_in_lat: t.clock_in_lat,
    clock_in_lng: t.clock_in_lng,
    distance_from_venue_m: t.distance_from_venue_m,
    total_hours: t.total_hours ?? null,
    gross_amount: t.gross_amount ?? null,
    platform_fee: t.platform_fee ?? 0,
    net_to_worker: t.net_to_worker ?? null,
    approved_at: t.approved_at ? t.approved_at.toISOString() : null,
    worker_rating_employer: (t as { worker_rating_employer?: number | null }).worker_rating_employer ?? null,
    employer_rating_worker: (t as { employer_rating_worker?: number | null }).employer_rating_worker ?? null,
    shift: shift
      ? {
          id: shift._id,
          title: shift.title,
          date: isoDay(shift.date),
          start_time: shift.start_time,
          end_time: shift.end_time,
          hourly_rate: shift.hourly_rate,
          address: shift.address,
        }
      : null,
    worker: wp
      ? {
          id: wp._id,
          full_name: wp.full_name,
          user_id: wp.user_id,
          kyc_status: wp.kyc_status,
          city: wp.city,
          rating_avg: safeRatingAvg(wp.rating_avg),
        }
      : null,
    employer: emp
      ? {
          id: emp._id,
          company_name: emp.company_name,
          verified: emp.verified ?? false,
          rating_avg: safeRatingAvg(emp.rating_avg),
        }
      : null,
  }
}

/**
 * Forces a **pending** timesheet to **approved** (support override).
 */
export async function approveTimesheet(timesheetId: string) {
  const t = await timesheetRepo.findById(timesheetId)
  if (!t) {
    throw new AppError('TIMESHEET_NOT_FOUND', 404, 'Timesheet not found')
  }
  if (t.status !== 'pending') {
    throw new AppError('TIMESHEET_NOT_PENDING', 400, 'Only pending timesheets can be approved')
  }
  const approvedAt = new Date()
  const updated = await adminTimesheetRepo.setApproved(timesheetId, approvedAt)
  if (!updated) {
    throw new AppError('TIMESHEET_NOT_FOUND', 404, 'Timesheet not found')
  }
  return {
    id: updated._id,
    status: updated.status,
    approved_at: updated.approved_at ? updated.approved_at.toISOString() : null,
    total_hours: updated.total_hours ?? null,
    gross_amount: updated.gross_amount ?? null,
    net_to_worker: updated.net_to_worker ?? null,
  }
}

/**
 * Records employer→worker stars for a settled timesheet (admin proxy until employer APIs exist).
 * Updates the worker’s running average.
 */
export async function rateWorkerOnTimesheet(timesheetId: string, body: TimesheetRateWorkerBody) {
  const stars = body.stars
  const t = await timesheetRepo.findById(timesheetId)
  if (!t) {
    throw new AppError('TIMESHEET_NOT_FOUND', 404, 'Timesheet not found')
  }
  const existingEmployerRating = (t as { employer_rating_worker?: number | null }).employer_rating_worker
  if (existingEmployerRating != null) {
    throw new AppError('RATING_ALREADY_SET', 409, 'This worker has already been rated for this timesheet')
  }
  if (t.status !== 'approved' && t.status !== 'paid') {
    throw new AppError('TIMESHEET_NOT_RATING_READY', 400, 'Approve the timesheet before recording a worker rating')
  }

  const updated = await timesheetRepo.setEmployerRatingForWorker(timesheetId, stars)
  if (!updated) {
    throw new AppError('RATING_NOT_SAVED', 409, 'Could not save rating — try again')
  }

  const wp = await workerRepo.incrementRatingFromEmployer(t.worker_profile_id, stars)
  if (!wp) {
    await timesheetRepo.clearEmployerRatingForWorker(timesheetId)
    throw new AppError('WORKER_NOT_FOUND', 404, 'Worker profile not found')
  }

  return {
    id: t._id,
    employer_rating_worker: stars,
    worker_rating_avg: safeRatingAvg(wp.rating_avg),
  }
}

/**
 * Current operator’s User row (for admin dashboard header / session check).
 * Fails if the account was soft-deleted.
 */
export async function getAdminSessionUser(userId: string) {
  const u = await userRepo.findById(userId)
  if (!u) {
    throw new AppError('USER_NOT_FOUND', 404, 'User not found')
  }
  if (u.deleted_at) {
    throw new AppError('AUTH_ACCOUNT_DELETED', 403, 'This account has been deactivated')
  }
  return { user: userToJson(u) }
}

/** Self-service profile update for currently signed-in admin (email/phone/password only). */
export async function patchAdminMeAccount(userId: string, body: PatchAdminMeAccountBody) {
  const existing = await userRepo.findById(userId)
  if (!existing) {
    throw new AppError('USER_NOT_FOUND', 404, 'User not found')
  }

  const $set: Record<string, unknown> = {}
  const $unset: Record<string, true> = {}

  if (body.password !== undefined) {
    $set.password_hash = await hashPassword(body.password)
    $set.password_login_enabled = true
  }

  const touchContact = body.email !== undefined || body.phone !== undefined
  if (touchContact) {
    let nextEmail = existing.email ?? null
    let nextPhone = existing.phone ?? null
    if (body.email !== undefined) {
      nextEmail = body.email === '' ? null : body.email.trim().toLowerCase()
    }
    if (body.phone !== undefined) {
      nextPhone = body.phone === '' ? null : body.phone.trim()
    }

    if (!nextEmail && !nextPhone) {
      throw new AppError(
        'USER_CONTACT_REQUIRED',
        400,
        'Account must keep at least one email or phone for sign-in.',
      )
    }

    if (nextEmail) {
      const clash = await userRepo.findByEmail(nextEmail)
      if (clash && clash._id !== userId) {
        throw new AppError('USER_ALREADY_EXISTS', 409, 'Email already in use')
      }
    }
    if (nextPhone) {
      const clash = await userRepo.findByPhone(nextPhone)
      if (clash && clash._id !== userId) {
        throw new AppError('USER_ALREADY_EXISTS', 409, 'Phone already in use')
      }
    }

    if (body.email !== undefined) {
      if (nextEmail) $set.email = nextEmail
      else $unset.email = true
    }
    if (body.phone !== undefined) {
      if (nextPhone) $set.phone = nextPhone
      else $unset.phone = true
    }
  }

  const updated = await adminUserRepo.applyAdminPatch(userId, { $set, $unset })
  if (!updated) {
    throw new AppError('USER_NOT_FOUND', 404, 'User not found')
  }
  return { user: userToJson(updated) }
}

/**
 * Paginated user directory with optional role/status/search and soft-deleted rows.
 */
export async function listUsers(q: AdminUserListQuery) {
  const page = q.page ?? 1
  const limit = q.limit ?? 20
  const skip = (page - 1) * limit
  const filter: adminUserRepo.AdminUserListFilter = {
    include_deleted: q.include_deleted === true,
  }
  if (q.role !== undefined) filter.role = q.role
  if (q.status !== undefined) filter.status = q.status
  if (q.search !== undefined && q.search.trim() !== '') filter.search = q.search

  const total = await adminUserRepo.countForDirectory(filter)
  const rows = await adminUserRepo.listForDirectory(filter, skip, limit)
  const users = rows.map((u) => userToJson(u))
  return { users, total, page, limit }
}

/**
 * Single user by id (includes `deleted_at` if soft-deleted).
 */
export async function getUserById(userId: string) {
  const u = await userRepo.findById(userId)
  if (!u) {
    throw new AppError('USER_NOT_FOUND', 404, 'User not found')
  }
  return { user: userToJson(u) }
}

/**
 * Creates a login identity (phone or email). User may sign in via OTP and/or password.
 * Duplicate phone/email returns 409.
 */
export async function createUser(body: CreateAdminUserBody) {
  let password_hash: string | null = null
  if (body.password) {
    password_hash = await hashPassword(body.password)
  }
  try {
    const doc = await adminUserRepo.insertUser({
      phone: body.phone ?? null,
      email: body.email?.toLowerCase() ?? null,
      role: body.role,
      status: body.status,
      onboarding_step: body.onboarding_step ?? 0,
      password_hash,
      password_login_enabled: password_hash
        ? (body.password_login_enabled ?? true)
        : undefined,
    })
    return { user: userToJson(doc) }
  } catch (e: unknown) {
    if (isMongoDuplicateKey(e)) {
      throw new AppError('USER_ALREADY_EXISTS', 409, 'Email or phone already in use')
    }
    throw e
  }
}

/**
 * Updates role, status, onboarding, email / phone, and optional password fields.
 */
export async function updateUser(userId: string, body: PatchAdminUserBody) {
  const existing = await userRepo.findById(userId)
  if (!existing) {
    throw new AppError('USER_NOT_FOUND', 404, 'User not found')
  }
  const nextRole = body.role ?? existing.role
  const nextStatus = body.status ?? existing.status
  if (nextRole === 'admin' && nextStatus === 'suspended') {
    throw new AppError('ADMIN_SUSPEND_NOT_ALLOWED', 400, 'Admin accounts cannot be suspended')
  }

  const $set: Record<string, unknown> = {}
  const $unset: Record<string, true> = {}

  if (body.clear_password === true) {
    $unset.password_hash = true
    $set.password_login_enabled = false
  } else {
    if (body.password !== undefined) {
      $set.password_hash = await hashPassword(body.password)
      if (body.password_login_enabled === undefined) {
        $set.password_login_enabled = true
      }
    }
    if (body.password_login_enabled !== undefined) {
      $set.password_login_enabled = body.password_login_enabled
    }
  }

  const willEnable =
    $set.password_login_enabled !== undefined
      ? $set.password_login_enabled === true
      : existing.password_login_enabled === true
  const willHaveHash =
    body.password !== undefined ||
    (body.clear_password !== true && existing.password_hash && $unset.password_hash !== true)
  if (willEnable && !willHaveHash) {
    throw new AppError(
      'USER_PASSWORD_REQUIRED',
      400,
      'Set a password before enabling password sign-in',
    )
  }

  if (body.role !== undefined) $set.role = body.role
  if (body.status !== undefined) $set.status = body.status
  if (body.onboarding_step !== undefined) $set.onboarding_step = body.onboarding_step

  const touchContact = body.email !== undefined || body.phone !== undefined
  if (touchContact) {
    let nextEmail = existing.email ?? null
    let nextPhone = existing.phone ?? null
    if (body.email !== undefined) {
      nextEmail = body.email === '' ? null : body.email.trim().toLowerCase()
    }
    if (body.phone !== undefined) {
      nextPhone = body.phone === '' ? null : body.phone.trim()
    }

    if (!nextEmail && !nextPhone) {
      throw new AppError(
        'USER_CONTACT_REQUIRED',
        400,
        'Account must keep at least one email or phone for sign-in.',
      )
    }

    if (nextEmail) {
      const clash = await userRepo.findByEmail(nextEmail)
      if (clash && clash._id !== userId) {
        throw new AppError('USER_ALREADY_EXISTS', 409, 'Email already in use')
      }
    }
    if (nextPhone) {
      const clash = await userRepo.findByPhone(nextPhone)
      if (clash && clash._id !== userId) {
        throw new AppError('USER_ALREADY_EXISTS', 409, 'Phone already in use')
      }
    }

    if (body.email !== undefined) {
      if (nextEmail) $set.email = nextEmail
      else $unset.email = true
    }
    if (body.phone !== undefined) {
      if (nextPhone) $set.phone = nextPhone
      else $unset.phone = true
    }
  }

  if (Object.keys($set).length === 0 && Object.keys($unset).length === 0) {
    return { user: userToJson(existing) }
  }

  try {
    const updated = await adminUserRepo.applyAdminPatch(userId, { $set, $unset })
    if (!updated) {
      throw new AppError('USER_NOT_FOUND', 404, 'User not found')
    }
    return { user: userToJson(updated) }
  } catch (e: unknown) {
    if (isMongoDuplicateKey(e)) {
      throw new AppError('USER_ALREADY_EXISTS', 409, 'Email or phone already in use')
    }
    throw e
  }
}

/**
 * Soft-deletes a user and revokes all refresh tokens so they cannot get new access.
 */
export async function softDeleteUser(userId: string) {
  const u = await userRepo.findById(userId)
  if (!u) {
    throw new AppError('USER_NOT_FOUND', 404, 'User not found')
  }
  if (u.role === 'admin') {
    throw new AppError('ADMIN_DEACTIVATE_NOT_ALLOWED', 400, 'Admin accounts cannot be deactivated')
  }
  if (u.deleted_at) {
    throw new AppError('USER_ALREADY_DELETED', 400, 'User is already deactivated')
  }
  const updated = await adminUserRepo.softDelete(userId)
  if (!updated) {
    throw new AppError('USER_NOT_FOUND', 404, 'User not found')
  }
  await refreshTokenRepo.deleteAllForUser(userId)
  return { user: userToJson(updated) }
}

/**
 * Restores a soft-deleted user so OTP login works again.
 */
export async function restoreUser(userId: string) {
  const u = await userRepo.findById(userId)
  if (!u) {
    throw new AppError('USER_NOT_FOUND', 404, 'User not found')
  }
  if (!u.deleted_at) {
    throw new AppError('USER_NOT_DELETED', 400, 'User is not deactivated')
  }
  const updated = await adminUserRepo.restore(userId)
  if (!updated) {
    throw new AppError('USER_NOT_FOUND', 404, 'User not found')
  }
  return { user: userToJson(updated) }
}

/**
 * Start enrolling TOTP: stores a pending secret and returns the otpauth:// URI for the authenticator app.
 */
export async function beginAdminTotpEnrollment(userId: string) {
  const u = await userRepo.findById(userId)
  if (!u) {
    throw new AppError('USER_NOT_FOUND', 404, 'User not found')
  }
  if (u.totp_enabled) {
    throw new AppError('TOTP_ALREADY_ENABLED', 400, 'Authenticator is already enabled')
  }
  const secret = generateSecret()
  await userRepo.setTotpPending(userId, secret)
  const label = u.email ?? u.phone ?? u._id
  const otpauth_url = generateURI({ issuer: 'i8now', label, secret })
  return { otpauth_url, secret_base32: secret }
}

/**
 * Confirms enrollment using a 6-digit code from the authenticator app.
 */
export async function confirmAdminTotpEnrollment(userId: string, code: string) {
  const u = await userRepo.findById(userId)
  if (!u?.totp_pending_secret) {
    throw new AppError('TOTP_SETUP_MISSING', 400, 'Run setup first to get a new secret')
  }
  const check = await verifyTotpEnrollment({ secret: u.totp_pending_secret, token: code })
  if (!check.valid) {
    throw new AppError('AUTH_TOTP_INVALID', 400, 'Invalid authenticator code')
  }
  const ok = await userRepo.activateTotpFromPending(userId)
  if (!ok) {
    throw new AppError('USER_NOT_FOUND', 404, 'User not found')
  }
  return { totp_enabled: true }
}

/** GET /admin/platform-settings — singleton toggles (Mongo). */
export async function getPlatformSettings() {
  const doc = await platformSettingsRepo.getOrCreatePlatformSettings()
  const storedUi = toPlainObject(doc.ui_settings)
  const defaultUi = {
    site_name: 'i8now Admin',
    site_subtitle: 'Operations',
    logo_data_url: null as string | null,
    login_left_image_url: null as string | null,
    login_left_heading: 'Operations command centre',
    login_left_caption: 'Manage workers, employers, timesheets, and platform settings from one place.',
    theme: 'light' as const,
    accent: 'zinc' as const,
    radius: 'lg' as const,
    font_family: 'geist' as const,
    font_size: 'md' as const,
    letter_spacing: 'normal' as const,
    nav_items: [
      { id: 'overview' as const, visible: true },
      { id: 'users' as const, visible: true },
      { id: 'workers' as const, visible: true },
      { id: 'employers' as const, visible: true },
      { id: 'shifts' as const, visible: true },
      { id: 'timesheets' as const, visible: true },
      { id: 'applications' as const, visible: true },
    ],
  }
  const ui = {
    ...defaultUi,
    ...storedUi,
  }
  return {
    login_email_enabled: doc.login_email_enabled,
    login_phone_enabled: doc.login_phone_enabled,
    admin_totp_required: doc.admin_totp_required,
    site_display_name: doc.site_display_name,
    ui_settings: ui,
    updated_at: doc.updated_at ? new Date(doc.updated_at as Date).toISOString() : null,
  }
}

/** PATCH /admin/platform-settings */
export async function patchPlatformSettings(body: PatchPlatformSettingsBody) {
  const current = await platformSettingsRepo.getOrCreatePlatformSettings()
  const storedUi = toPlainObject(current.ui_settings)
  const currentUi = {
    site_name: 'i8now Admin',
    site_subtitle: 'Operations',
    logo_data_url: null as string | null,
    login_left_image_url: null as string | null,
    login_left_heading: 'Operations command centre',
    login_left_caption: 'Manage workers, employers, timesheets, and platform settings from one place.',
    theme: 'light' as const,
    accent: 'zinc' as const,
    radius: 'lg' as const,
    font_family: 'geist' as const,
    font_size: 'md' as const,
    letter_spacing: 'normal' as const,
    nav_items: [
      { id: 'overview' as const, visible: true },
      { id: 'users' as const, visible: true },
      { id: 'workers' as const, visible: true },
      { id: 'employers' as const, visible: true },
      { id: 'shifts' as const, visible: true },
      { id: 'timesheets' as const, visible: true },
      { id: 'applications' as const, visible: true },
    ],
    ...storedUi,
  }
  const next = {
    login_email_enabled: body.login_email_enabled ?? current.login_email_enabled,
    login_phone_enabled: body.login_phone_enabled ?? current.login_phone_enabled,
    admin_totp_required: body.admin_totp_required ?? current.admin_totp_required,
    site_display_name: body.site_display_name ?? current.site_display_name,
    ui_settings: body.ui_settings ? { ...currentUi, ...body.ui_settings } : currentUi,
  }
  if (!next.login_email_enabled && !next.login_phone_enabled) {
    throw new AppError(
      'PLATFORM_LOGIN_ALL_DISABLED',
      400,
      'At least one of email or phone sign-in must remain enabled',
    )
  }
  const updated = await platformSettingsRepo.updatePlatformSettings({
    login_email_enabled: next.login_email_enabled,
    login_phone_enabled: next.login_phone_enabled,
    admin_totp_required: next.admin_totp_required,
    site_display_name: next.site_display_name,
    ui_settings: next.ui_settings,
  })
  if (!updated) {
    throw new AppError('PLATFORM_SETTINGS_UPDATE_FAILED', 500, 'Could not save platform settings')
  }
  return getPlatformSettings()
}
