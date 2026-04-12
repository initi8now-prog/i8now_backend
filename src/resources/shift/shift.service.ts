/* ═══════════════════════════════════════════════════════════════════════════
 *  shift.service — discovery, detail, apply, and “my applications” for workers
 *
 *  Uses worker profile for default search radius and apply gates (KYC + payout).
 *  Controllers pass authenticated user id when present (optional for list/detail).
 * ═══════════════════════════════════════════════════════════════════════════ */

import * as categoryRepo from '../worker/category.repo.js'
import * as workerRepo from '../worker/worker.repo.js'
import * as employerRepo from './employer.repo.js'
import * as timesheetRepo from '../timesheet/timesheet.repo.js'
import * as shiftApplicationRepo from './shiftApplication.repo.js'
import * as shiftRepo from './shift.repo.js'
import { AppError } from '../../utils/errors.js'
import { haversineKm } from '../../utils/geo.js'
import type { CategoryDoc } from '../worker/category.model.js'
import type { EmployerProfileDoc } from './employerProfile.model.js'
import type { ShiftDoc } from './shift.model.js'
import type { MyApplicationsQuery, ShiftListQuery } from './shift.validator.js'

type ShiftListItem = {
  id: string
  title: string
  category: { id: string; name: string; slug: string; icon_url: string }
  employer: {
    id: string
    company_name: string
    logo_url: string | null
    rating_avg: number
    verified: boolean
  }
  date: string
  start_time: string
  end_time: string
  duration_hrs: number
  hourly_rate: number
  currency: string
  estimated_pay: number
  slots_left: number
  distance_km: number
  address: string
  applied: boolean
}

type ShiftDetailResult = {
  id: string
  title: string
  description: string
  category: { id: string; name: string; slug: string }
  employer: {
    id: string
    company_name: string
    logo_url: string | null
    rating_avg: number
    verified: boolean
    total_shifts_posted: number
  }
  date: string
  start_time: string
  end_time: string
  duration_hrs: number
  hourly_rate: number
  currency: string
  estimated_pay: number
  slots_total: number
  slots_filled: number
  slots_left: number
  address: string
  location_lat: number
  location_lng: number
  geofence_radius_m: number
  status: string
  applied: boolean
  application: { id: string; status: string; applied_at: string } | null
}

type ApplyResult = {
  id: string
  shift_id: string
  worker_id: string
  status: string
  applied_at: string
}

type ApplicationListItem = {
  id: string
  status: string
  applied_at: string
  shift: {
    id: string
    title: string
    date: string
    start_time: string
    hourly_rate: number
    estimated_pay: number
    address: string
    status: string
    employer: { company_name: string; logo_url: string | null; rating_avg: number }
  }
  timesheet: { id: string; status: string; total_hours: number | null } | null
}

export function durationHoursFromHHmm(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const startM = sh * 60 + (sm || 0)
  const endM = eh * 60 + (em || 0)
  let diff = endM - startM
  if (diff < 0) diff += 24 * 60
  return Math.round((diff / 60) * 100) / 100
}

function formatShiftDay(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isoToUtcDayStart(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function isoToUtcDayEndInclusive(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999))
}

function slotsLeft(s: ShiftDoc): number {
  return Math.max(0, s.slots_total - s.slots_filled)
}

function hasPayoutSetup(p: {
  payout_upi_id?: string | null
  payout_verified?: boolean
}): boolean {
  if (p.payout_verified) return true
  const upi = p.payout_upi_id
  return typeof upi === 'string' && upi.trim().length > 0
}

async function loadCategoryMap(ids: string[]): Promise<Map<string, CategoryDoc>> {
  const rows = await categoryRepo.findByIds([...new Set(ids)])
  return new Map(rows.map((c) => [c._id, c]))
}

async function loadEmployerMap(ids: string[]): Promise<Map<string, EmployerProfileDoc>> {
  const rows = await employerRepo.findByIds([...new Set(ids)])
  return new Map(rows.map((e) => [e._id, e]))
}

function buildListItem(
  s: ShiftDoc,
  lat: number,
  lng: number,
  cat: CategoryDoc | undefined,
  emp: EmployerProfileDoc | undefined,
  applied: boolean,
): ShiftListItem {
  const dur = durationHoursFromHHmm(s.start_time, s.end_time)
  const est = Math.round(s.hourly_rate * dur * 100) / 100
  const dist = haversineKm(lat, lng, s.location_lat, s.location_lng)
  const catSafe = cat ?? {
    _id: s.category_id,
    name: 'Unknown',
    slug: 'unknown',
    icon_url: '',
  }
  const empSafe = emp ?? {
    _id: s.employer_id,
    company_name: 'Unknown',
    logo_url: null,
    rating_avg: 0,
    verified: false,
  }
  return {
    id: s._id,
    title: s.title,
    category: {
      id: catSafe._id,
      name: catSafe.name,
      slug: catSafe.slug,
      icon_url: catSafe.icon_url,
    },
    employer: {
      id: empSafe._id,
      company_name: empSafe.company_name,
      logo_url: empSafe.logo_url ?? null,
      rating_avg: empSafe.rating_avg,
      verified: empSafe.verified,
    },
    date: formatShiftDay(s.date),
    start_time: s.start_time,
    end_time: s.end_time,
    duration_hrs: dur,
    hourly_rate: s.hourly_rate,
    currency: s.currency,
    estimated_pay: est,
    slots_left: slotsLeft(s),
    distance_km: dist,
    address: s.address,
    applied,
  }
}

/**
 * Paginated open shifts near lat/lng. Optional worker user id marks `applied`.
 */
export async function listShifts(
  q: ShiftListQuery,
  workerUserId: string | null,
): Promise<{ shifts: ShiftListItem[]; total: number; page: number; limit: number }> {
  const page = q.page ?? 1
  const limit = q.limit ?? 20
  const sort = q.sort ?? 'distance'

  let radiusKm = q.radius_km
  if (radiusKm === undefined && workerUserId) {
    const wp = await workerRepo.findByUserId(workerUserId)
    if (wp) radiusKm = wp.radius_km
  }
  if (radiusKm === undefined) {
    radiusKm = 10
  }

  let workerProfileId: string | null = null
  if (workerUserId) {
    const wp = await workerRepo.findByUserId(workerUserId)
    if (wp) workerProfileId = wp._id
  }

  const f: shiftRepo.ShiftListDbFilter = { status: 'open' }
  if (q.date) {
    f.dateEq = isoToUtcDayStart(q.date)
  } else {
    if (q.date_from) f.dateFrom = isoToUtcDayStart(q.date_from)
    if (q.date_to) f.dateTo = isoToUtcDayEndInclusive(q.date_to)
  }
  if (q.category_ids) {
    const parts = q.category_ids.split(',').map((s) => s.trim()).filter(Boolean)
    if (parts.length > 0) f.categoryIds = parts
  }
  if (q.min_rate !== undefined) f.minRate = q.min_rate
  if (q.max_rate !== undefined) f.maxRate = q.max_rate

  const rows = await shiftRepo.findWithFilters(f)

  type Row = { s: ShiftDoc; distance: number }
  const withDist: Row[] = []
  for (const s of rows) {
    const distance = haversineKm(q.lat, q.lng, s.location_lat, s.location_lng)
    if (distance <= radiusKm) {
      withDist.push({ s, distance })
    }
  }

  if (sort === 'rate_high') {
    withDist.sort((a, b) => b.s.hourly_rate - a.s.hourly_rate)
  } else if (sort === 'date_soon') {
    withDist.sort((a, b) => {
      const da = a.s.date.getTime() - b.s.date.getTime()
      if (da !== 0) return da
      return a.s.start_time.localeCompare(b.s.start_time)
    })
  } else {
    withDist.sort((a, b) => a.distance - b.distance)
  }

  const total = withDist.length
  const skip = (page - 1) * limit
  const pageRows = withDist.slice(skip, skip + limit)

  const catIds = pageRows.map((r) => r.s.category_id)
  const empIds = pageRows.map((r) => r.s.employer_id)
  const catMap = await loadCategoryMap(catIds)
  const empMap = await loadEmployerMap(empIds)

  let appliedSet = new Set<string>()
  if (workerProfileId && pageRows.length > 0) {
    const sids = pageRows.map((r) => r.s._id)
    const apps = await shiftApplicationRepo.findByShiftIdsAndWorker(sids, workerProfileId)
    appliedSet = new Set(apps.map((a) => a.shift_id))
  }

  const shifts: ShiftListItem[] = pageRows.map(({ s, distance }) => {
    void distance
    const cat = catMap.get(s.category_id)
    const emp = empMap.get(s.employer_id)
    return buildListItem(s, q.lat, q.lng, cat, emp, appliedSet.has(s._id))
  })

  return { shifts, total, page, limit }
}

/**
 * Single shift detail (any status). Optional worker id fills `applied` + `application`.
 */
export async function getShiftDetail(
  shiftId: string,
  workerUserId: string | null,
): Promise<ShiftDetailResult> {
  const s = await shiftRepo.findById(shiftId)
  if (!s) {
    throw new AppError('SHIFT_NOT_FOUND', 404, 'Shift does not exist')
  }

  let workerProfileId: string | null = null
  if (workerUserId) {
    const wp = await workerRepo.findByUserId(workerUserId)
    if (wp) workerProfileId = wp._id
  }

  const cat = await categoryRepo.findById(s.category_id)
  const emp = await employerRepo.findById(s.employer_id)
  const dur = durationHoursFromHHmm(s.start_time, s.end_time)
  const est = Math.round(s.hourly_rate * dur * 100) / 100

  let applied = false
  let application: ShiftDetailResult['application'] = null
  if (workerProfileId) {
    const appRow = await shiftApplicationRepo.findByShiftAndWorker(shiftId, workerProfileId)
    if (appRow) {
      applied = true
      application = {
        id: appRow._id,
        status: appRow.status,
        applied_at: appRow.applied_at.toISOString(),
      }
    }
  }

  const catSafe = cat ?? {
    _id: s.category_id,
    name: 'Unknown',
    slug: 'unknown',
    icon_url: '',
  }
  const empSafe = emp ?? {
    _id: s.employer_id,
    company_name: 'Unknown',
    logo_url: null,
    rating_avg: 0,
    verified: false,
    total_shifts_posted: 0,
  }

  return {
    id: s._id,
    title: s.title,
    description: s.description,
    category: { id: catSafe._id, name: catSafe.name, slug: catSafe.slug },
    employer: {
      id: empSafe._id,
      company_name: empSafe.company_name,
      logo_url: empSafe.logo_url ?? null,
      rating_avg: empSafe.rating_avg,
      verified: empSafe.verified,
      total_shifts_posted: empSafe.total_shifts_posted,
    },
    date: formatShiftDay(s.date),
    start_time: s.start_time,
    end_time: s.end_time,
    duration_hrs: dur,
    hourly_rate: s.hourly_rate,
    currency: s.currency,
    estimated_pay: est,
    slots_total: s.slots_total,
    slots_filled: s.slots_filled,
    slots_left: slotsLeft(s),
    address: s.address,
    location_lat: s.location_lat,
    location_lng: s.location_lng,
    geofence_radius_m: s.geofence_radius_m,
    status: s.status,
    applied,
    application,
  }
}

/**
 * Worker applies to a shift (KYC approved + payout setup required).
 */
export async function applyToShift(userId: string, shiftId: string): Promise<ApplyResult> {
  const profile = await workerRepo.findByUserId(userId)
  if (!profile) {
    throw new AppError('PROFILE_NOT_FOUND', 404, 'Worker profile does not exist yet')
  }

  if (profile.kyc_status !== 'approved') {
    throw new AppError('WORKER_KYC_REQUIRED', 403, 'KYC must be approved before applying')
  }

  if (!hasPayoutSetup(profile)) {
    throw new AppError('WORKER_PAYOUT_REQUIRED', 403, 'Payout account must be set up before applying')
  }

  const s = await shiftRepo.findById(shiftId)
  if (!s) {
    throw new AppError('SHIFT_NOT_FOUND', 404, 'Shift does not exist')
  }

  if (s.status !== 'open') {
    throw new AppError('SHIFT_NOT_OPEN', 400, 'Shift is filled or cancelled')
  }

  if (slotsLeft(s) <= 0) {
    throw new AppError('SHIFT_NOT_OPEN', 400, 'Shift is filled or cancelled')
  }

  const existing = await shiftApplicationRepo.findByShiftAndWorker(shiftId, profile._id)
  if (existing) {
    throw new AppError('SHIFT_ALREADY_APPLIED', 409, 'Worker has already applied to this shift')
  }

  const row = await shiftApplicationRepo.create(shiftId, profile._id)
  return {
    id: row._id,
    shift_id: shiftId,
    worker_id: profile._id,
    status: row.status,
    applied_at: row.applied_at.toISOString(),
  }
}

/**
 * Paginated list of the worker’s shift applications.
 */
export async function listMyApplications(
  userId: string,
  q: MyApplicationsQuery,
): Promise<{ applications: ApplicationListItem[]; total: number; page: number; limit: number }> {
  const profile = await workerRepo.findByUserId(userId)
  if (!profile) {
    throw new AppError('PROFILE_NOT_FOUND', 404, 'Worker profile does not exist yet')
  }

  const page = q.page ?? 1
  const limit = q.limit ?? 20
  const skip = (page - 1) * limit

  const total = await shiftApplicationRepo.countByWorkerProfile(profile._id, q.status)
  const apps = await shiftApplicationRepo.listByWorkerProfile(profile._id, q.status, skip, limit)

  const appIds = apps.map((a) => a._id)
  const tsRows = await timesheetRepo.findByApplicationIds(appIds)
  const tsByApp = new Map(tsRows.map((t) => [t.application_id, t]))

  const out: ApplicationListItem[] = []
  for (const a of apps) {
    const s = await shiftRepo.findById(a.shift_id)
    if (!s) continue
    const emp = await employerRepo.findById(s.employer_id)
    const dur = durationHoursFromHHmm(s.start_time, s.end_time)
    const est = Math.round(s.hourly_rate * dur * 100) / 100
    const ts = tsByApp.get(a._id)
    out.push({
      id: a._id,
      status: a.status,
      applied_at: a.applied_at.toISOString(),
      shift: {
        id: s._id,
        title: s.title,
        date: formatShiftDay(s.date),
        start_time: s.start_time,
        hourly_rate: s.hourly_rate,
        estimated_pay: est,
        address: s.address,
        status: s.status,
        employer: {
          company_name: emp?.company_name ?? 'Unknown',
          logo_url: emp?.logo_url ?? null,
          rating_avg: emp?.rating_avg ?? 0,
        },
      },
      timesheet: ts
        ? { id: ts._id, status: ts.status, total_hours: ts.total_hours ?? null }
        : null,
    })
  }

  return { applications: out, total, page, limit }
}
