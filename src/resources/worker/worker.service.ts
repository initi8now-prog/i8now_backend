/* ═══════════════════════════════════════════════════════════════════════════
 *  worker.service — business rules for worker profile, categories, quals, docs
 *
 *  Controllers call here with the authenticated user id. This layer checks
 *  profile existence, catalog ids, duplicates, then calls worker + user repos.
 *  No req/res — only AppError when something blocks the operation.
 * ═══════════════════════════════════════════════════════════════════════════ */

import * as userRepo from '../user/user.repo.js'
import * as categoryRepo from './category.repo.js'
import * as workerDocumentRepo from './workerDocument.repo.js'
import * as workerQualificationRepo from './workerQualification.repo.js'
import * as workerRepo from './worker.repo.js'
import { AppError } from '../../utils/errors.js'
import { safeRatingAvg } from '../../utils/rating.js'
import {
  ageYearsUtc,
  formatDobDate,
  isCurrentlyPursuingQualification,
  isValidFullName,
  parseDobString,
} from './workerProfileRules.js'
import type { CategoryDoc } from './category.model.js'
import type { WorkerDocumentDoc } from './workerDocument.model.js'
import type { WorkerQualificationDoc } from './workerQualification.model.js'
import type { WorkerProfileDoc } from './workerProfile.model.js'
import type {
  AddWorkerDocumentBody,
  AddWorkerQualificationBody,
  CreateWorkerProfileBody,
  SetWorkerCategoriesBody,
  UpdateWorkerProfileBody,
} from './worker.validator.js'

// Create Profile Result
type CreateProfileResult = {
  id: string
  user_id: string
  full_name: string
  dob: string
  avatar_url: string | null
  bio: string | null
  location_lat: number
  location_lng: number
  city: string
  radius_km: number
  kyc_status: string
  rating_avg: number
  total_shifts: number
  onboarding_step: number
  created_at: string
}

// Update Profile Result
type UpdateProfileResult = {
  id: string
  full_name: string
  avatar_url: string | null
  bio: string | null
  city: string
  radius_km: number
  updated_at: string
}

type PayoutPreview = {
  account_holder: string
  masked_account: string
  upi_id: string
  verified: boolean
} | null

type CategoryPreview = { id: string; name: string; slug: string }

type QualificationPreview = {
  id: string
  type: string
  title: string
  institution: string
  from_date: string
  to_date: string | null
  /** Derived: no end date, or end date is today/future (UTC calendar day). */
  is_currently_pursuing: boolean
  description: string | null
  verified: boolean
  created_at: string
}

type DocumentPreview = {
  type: string
  status: string
  reviewed_at: string | null
}

type MeProfileResult = {
  id: string
  user_id: string
  full_name: string
  dob: string
  avatar_url: string | null
  bio: string | null
  city: string
  location_lat: number
  location_lng: number
  radius_km: number
  kyc_status: string
  rating_avg: number
  total_shifts: number
  onboarding_step: number
  categories: CategoryPreview[]
  qualifications: QualificationPreview[]
  documents: DocumentPreview[]
  payout_account: PayoutPreview
  created_at: string
  updated_at: string
}

type SetCategoriesResult = {
  categories: Array<{ id: string; name: string; slug: string; icon_url: string }>
  onboarding_step: number
}

type AddQualificationResult = {
  id: string
  worker_id: string
  type: string
  title: string
  institution: string
  from_date: string
  to_date: string | null
  is_currently_pursuing: boolean
  description: string | null
  verified: boolean
  created_at: string
}

type AddDocumentResult = {
  id: string
  type: string
  file_url: string
  status: string
  created_at: string
}

function roundRating(n: unknown): number {
  return safeRatingAvg(n)
}

function profileDocToCreated(doc: WorkerProfileDoc, onboardingStep: number): CreateProfileResult {
  const created = (doc as { created_at?: Date }).created_at
  return {
    id: doc._id,
    user_id: doc.user_id,
    full_name: doc.full_name,
    dob: formatDobDate(doc.dob),
    avatar_url: doc.avatar_url ?? null,
    bio: doc.bio ?? null,
    location_lat: doc.location_lat,
    location_lng: doc.location_lng,
    city: doc.city,
    radius_km: doc.radius_km,
    kyc_status: doc.kyc_status,
    rating_avg: roundRating(doc.rating_avg),
    total_shifts: doc.total_shifts,
    onboarding_step: onboardingStep,
    created_at: created ? created.toISOString() : new Date().toISOString(),
  }
}

/** Same ids in request order, but each id only once (duplicate entries ignored). */
function dedupeCategoryIds(ids: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of ids) {
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/** Keeps the same order the client sent for category_ids. */
function orderCategories(ids: string[], cats: CategoryDoc[]): CategoryDoc[] {
  const byId = new Map(cats.map((c) => [c._id, c]))
  const out: CategoryDoc[] = []
  for (const id of ids) {
    const row = byId.get(id)
    if (row) out.push(row)
  }
  return out
}

function mapCategoryForMe(c: CategoryDoc): CategoryPreview {
  return { id: c._id, name: c.name, slug: c.slug }
}

function mapQualificationRow(q: WorkerQualificationDoc): QualificationPreview {
  const created = (q as { created_at?: Date }).created_at
  const toRaw = q.to_date
  const toDate = toRaw ? new Date(toRaw) : null
  return {
    id: q._id,
    type: q.type,
    title: q.title,
    institution: q.institution,
    from_date: formatDobDate(q.from_date),
    to_date: toDate ? formatDobDate(toDate) : null,
    is_currently_pursuing: isCurrentlyPursuingQualification(toDate),
    description: q.description ?? null,
    verified: q.verified,
    created_at: created ? created.toISOString() : new Date().toISOString(),
  }
}

function buildPayoutPreview(profile: WorkerProfileDoc): PayoutPreview {
  const p = profile as WorkerProfileDoc & {
    payout_account_holder?: string | null
    payout_masked_account?: string | null
    payout_upi_id?: string | null
    payout_verified?: boolean
  }
  const hasAny =
    (p.payout_upi_id && p.payout_upi_id.length > 0) ||
    (p.payout_account_holder && p.payout_account_holder.length > 0)
  if (!hasAny && !p.payout_verified) {
    return null
  }
  return {
    account_holder: p.payout_account_holder ?? '',
    masked_account: p.payout_masked_account ?? '',
    upi_id: p.payout_upi_id ?? '',
    verified: p.payout_verified ?? false,
  }
}

function mapDocumentRow(d: WorkerDocumentDoc): DocumentPreview {
  const reviewed = d.reviewed_at
  return {
    type: d.type,
    status: d.status,
    reviewed_at: reviewed ? new Date(reviewed).toISOString() : null,
  }
}

async function requireProfile(userId: string): Promise<WorkerProfileDoc> {
  const profile = await workerRepo.findByUserId(userId)
  if (!profile) {
    throw new AppError('PROFILE_NOT_FOUND', 404, 'Worker profile does not exist yet')
  }
  return profile
}

/**
 * First-time worker profile after OTP: saves name, DOB, home location, optional bio/photo URL.
 * Sets user onboarding to step 3. Fails if a profile already exists or user is under 18.
 */
export async function createProfile(userId: string, body: CreateWorkerProfileBody): Promise<CreateProfileResult> {
  const existing = await workerRepo.findByUserId(userId)
  if (existing) {
    throw new AppError('PROFILE_ALREADY_EXISTS', 409, 'Worker profile already created for this user')
  }

  if (!isValidFullName(body.full_name)) {
    throw new AppError('PROFILE_NAME_INVALID', 400, 'Name contains invalid characters or is too short')
  }

  const dobDate = parseDobString(body.dob)
  if (ageYearsUtc(dobDate) < 18) {
    throw new AppError('PROFILE_UNDERAGE', 400, 'Worker must be at least 18 years old')
  }

  const doc = await workerRepo.create({
    user_id: userId,
    full_name: body.full_name.trim(),
    dob: dobDate,
    avatar_url: body.avatar_url ?? null,
    bio: body.bio ?? null,
    location_lat: body.location_lat,
    location_lng: body.location_lng,
    city: body.city.trim(),
    radius_km: body.radius_km,
  })

  await userRepo.updateOnboardingStep(userId, 3)

  return profileDocToCreated(doc, 3)
}

/**
 * Change any subset of profile fields (all optional in the body). Used after onboarding too.
 */
export async function updateProfile(userId: string, body: UpdateWorkerProfileBody): Promise<UpdateProfileResult> {
  const profile = await workerRepo.findByUserId(userId)
  if (!profile) {
    throw new AppError('PROFILE_NOT_FOUND', 404, 'Worker profile does not exist yet')
  }

  const patch: Parameters<typeof workerRepo.updateByUserId>[1] = {}

  if (body.full_name !== undefined) {
    if (!isValidFullName(body.full_name)) {
      throw new AppError('PROFILE_NAME_INVALID', 400, 'Name contains invalid characters or is too short')
    }
    patch.full_name = body.full_name.trim()
  }
  if (body.avatar_url !== undefined) {
    patch.avatar_url = body.avatar_url
  }
  if (body.bio !== undefined) {
    patch.bio = body.bio
  }
  if (body.location_lat !== undefined) {
    patch.location_lat = body.location_lat
  }
  if (body.location_lng !== undefined) {
    patch.location_lng = body.location_lng
  }
  if (body.city !== undefined) {
    patch.city = body.city.trim()
  }
  if (body.radius_km !== undefined) {
    patch.radius_km = body.radius_km
  }
  if (body.payout_account_holder !== undefined) {
    patch.payout_account_holder = body.payout_account_holder
  }
  if (body.payout_masked_account !== undefined) {
    patch.payout_masked_account = body.payout_masked_account
  }
  if (body.payout_upi_id !== undefined) {
    patch.payout_upi_id = body.payout_upi_id
  }

  const updated = await workerRepo.updateByUserId(userId, patch)
  if (!updated) {
    throw new AppError('PROFILE_NOT_FOUND', 404, 'Worker profile does not exist yet')
  }

  const u = updated as { updated_at?: Date }
  return {
    id: updated._id,
    full_name: updated.full_name,
    avatar_url: updated.avatar_url ?? null,
    bio: updated.bio ?? null,
    city: updated.city,
    radius_km: updated.radius_km,
    updated_at: (u.updated_at ?? new Date()).toISOString(),
  }
}

/**
 * Full “my profile” payload: profile row + user onboarding + categories, quals, docs.
 */
export async function getMyProfile(userId: string): Promise<MeProfileResult> {
  const profile = await requireProfile(userId)
  const user = await userRepo.findById(userId)
  const onboardingStep = user?.onboarding_step ?? 0

  const created = (profile as { created_at?: Date }).created_at
  const updated = (profile as { updated_at?: Date }).updated_at

  const ids = profile.category_ids ?? []
  const catRows = await categoryRepo.findByIds(ids)
  const categoriesOrdered = orderCategories(ids, catRows).map(mapCategoryForMe)

  const quals = await workerQualificationRepo.listByWorkerProfileId(profile._id)
  const qualifications = quals.map(mapQualificationRow)

  const docs = await workerDocumentRepo.listByWorkerProfileId(profile._id)
  const documents = docs.map(mapDocumentRow)

  const payout_account = buildPayoutPreview(profile)

  return {
    id: profile._id,
    user_id: profile.user_id,
    full_name: profile.full_name,
    dob: formatDobDate(profile.dob),
    avatar_url: profile.avatar_url ?? null,
    bio: profile.bio ?? null,
    city: profile.city,
    location_lat: profile.location_lat,
    location_lng: profile.location_lng,
    radius_km: profile.radius_km,
    kyc_status: profile.kyc_status,
    rating_avg: roundRating(profile.rating_avg),
    total_shifts: profile.total_shifts,
    onboarding_step: onboardingStep,
    categories: categoriesOrdered,
    qualifications,
    documents,
    payout_account,
    created_at: created ? created.toISOString() : new Date().toISOString(),
    updated_at: updated ? updated.toISOString() : new Date().toISOString(),
  }
}

/**
 * Replaces the worker’s category list; every id must exist in the catalog.
 * Bumps onboarding to at least step 4 on success.
 */
export async function setWorkerCategories(
  userId: string,
  body: SetWorkerCategoriesBody,
): Promise<SetCategoriesResult> {
  await requireProfile(userId)

  const uniqueIds = dedupeCategoryIds(body.category_ids)
  if (uniqueIds.length < 1) {
    throw new AppError('CATEGORIES_EMPTY', 400, 'At least one category must be selected')
  }

  const found = await categoryRepo.findByIds(uniqueIds)
  if (found.length !== uniqueIds.length) {
    throw new AppError('CATEGORIES_INVALID', 400, 'One or more category IDs do not exist')
  }

  const updated = await workerRepo.updateByUserId(userId, { category_ids: uniqueIds })
  if (!updated) {
    throw new AppError('PROFILE_NOT_FOUND', 404, 'Worker profile does not exist yet')
  }

  const user = await userRepo.findById(userId)
  const current = user?.onboarding_step ?? 0
  const nextStep = Math.max(current, 4)
  await userRepo.updateOnboardingStep(userId, nextStep)

  const ordered = orderCategories(uniqueIds, found)
  const categories = ordered.map((c) => ({
    id: c._id,
    name: c.name,
    slug: c.slug,
    icon_url: c.icon_url,
  }))

  return { categories, onboarding_step: nextStep }
}

/**
 * Adds a single qualification row tied to this worker’s profile (wp_ id).
 */
export async function addQualification(
  userId: string,
  body: AddWorkerQualificationBody,
): Promise<AddQualificationResult> {
  const profile = await requireProfile(userId)

  const fromD = parseDobString(body.from_date)

  let toDate: Date | null = null
  if (body.to_date !== undefined && body.to_date !== null) {
    toDate = parseDobString(body.to_date)
    if (toDate < fromD) {
      throw new AppError('QUALIFICATION_DATE_ORDER', 400, 'to_date must be on or after from_date')
    }
  }

  const row = await workerQualificationRepo.create({
    worker_profile_id: profile._id,
    type: body.type,
    title: body.title.trim(),
    institution: body.institution.trim(),
    from_date: fromD,
    to_date: toDate,
    description: body.description?.trim() ?? null,
  })

  const created = (row as { created_at?: Date }).created_at
  const toStored = row.to_date ? new Date(row.to_date) : null
  return {
    id: row._id,
    worker_id: profile._id,
    type: row.type,
    title: row.title,
    institution: row.institution,
    from_date: formatDobDate(row.from_date),
    to_date: toStored ? formatDobDate(toStored) : null,
    is_currently_pursuing: isCurrentlyPursuingQualification(toStored),
    description: row.description ?? null,
    verified: row.verified,
    created_at: created ? created.toISOString() : new Date().toISOString(),
  }
}

/**
 * Submits a KYC document row; blocks duplicate pending/approved for the same type.
 * Moves profile kyc_status to pending the first time a doc is submitted.
 */
export async function addDocument(userId: string, body: AddWorkerDocumentBody): Promise<AddDocumentResult> {
  const profile = await requireProfile(userId)

  let urlOk = false
  try {
    const u = new URL(body.file_url)
    urlOk = u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    urlOk = false
  }
  if (!urlOk) {
    throw new AppError('DOCUMENT_URL_INVALID', 400, 'file_url is not a valid or accessible URL')
  }

  const dup = await workerDocumentRepo.hasBlockingDuplicate(profile._id, body.type)
  if (dup) {
    throw new AppError(
      'DOCUMENT_DUPLICATE',
      409,
      'A document of this type is already pending or approved',
    )
  }

  const row = await workerDocumentRepo.create({
    worker_profile_id: profile._id,
    type: body.type,
    file_url: body.file_url,
  })

  if (profile.kyc_status === 'unverified') {
    await workerRepo.updateByUserId(userId, { kyc_status: 'pending' })
  }

  const created = (row as { created_at?: Date }).created_at
  return {
    id: row._id,
    type: row.type,
    file_url: row.file_url,
    status: row.status,
    created_at: created ? created.toISOString() : new Date().toISOString(),
  }
}
