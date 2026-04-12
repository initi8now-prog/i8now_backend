/* ═══════════════════════════════════════════════════════════════════════════
 *  timesheet.service — worker clock-in/out and timesheet detail
 *
 *  ── Where do lat / lng come from? ───────────────────────────────────────────
 *  Clock-in (and optional clock-out) bodies carry the WORKER’s coordinates: the
 *  device GPS fix at the moment of the API call. They are not the shift venue.
 *
 *  The job site is already stored on Shift: `location_lat`, `location_lng`, and
 *  `geofence_radius_m`. We compute straight-line distance(worker, venue) with
 *  `haversineMeters`; if distance > geofence_radius_m → CLOCK_IN_OUTSIDE_GEOFENCE.
 *  Example: venue at (26.90, 75.80) with 200 m radius; worker at (26.9001, 75.8001)
 *  is inside; sending coordinates for another city fails.
 *
 *  ── accuracy_m (optional, clock-in only) ───────────────────────────────────
 *  Horizontal GPS uncertainty in metres (browser Geolocation `accuracy`, etc.).
 *  We save it as `clock_in_accuracy_m` for support/audit. It does not change the
 *  geofence calculation — that uses only lat/lng.
 *
 *  Rules: application must be `confirmed`; clock-in only between shift start−30m
 *  and shift end (UTC wall time from shift.date + start_time/end_time).
 * ═══════════════════════════════════════════════════════════════════════════ */

import * as shiftApplicationRepo from '../shift/shiftApplication.repo.js'
import * as shiftRepo from '../shift/shift.repo.js'
import * as workerRepo from '../worker/worker.repo.js'
import * as timesheetRepo from './timesheet.repo.js'
import { AppError } from '../../utils/errors.js'
import { haversineMeters } from '../../utils/geo.js'
import type { ShiftDoc } from '../shift/shift.model.js'
import type { ClockInBody, ClockOutBody } from './timesheet.validator.js'

/** Calendar day (UTC) + HH:mm → UTC Date for comparisons (same convention as shift listing). */
function shiftWallDateTimeUtc(date: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), h, m || 0, 0, 0))
}

function shiftStartUtc(s: ShiftDoc): Date {
  return shiftWallDateTimeUtc(s.date, s.start_time)
}

function shiftEndUtc(s: ShiftDoc): Date {
  return shiftWallDateTimeUtc(s.date, s.end_time)
}

const EARLY_WINDOW_MS = 30 * 60 * 1000

type ClockInResult = {
  id: string
  application_id: string
  clock_in: string
  clock_in_lat: number
  clock_in_lng: number
  distance_from_venue_m: number
  status: string
}

type ClockOutResult = {
  id: string
  clock_in: string
  clock_out: string
  total_hours: number
  gross_amount: number
  status: string
}

type TimesheetDetailResult = {
  id: string
  application_id: string
  worker: { id: string; full_name: string; avatar_url: string | null; rating_avg: number }
  shift: {
    id: string
    title: string
    date: string
    start_time: string
    end_time: string
    hourly_rate: number
  }
  clock_in: string
  clock_out: string | null
  total_hours: number | null
  gross_amount: number | null
  platform_fee: number
  net_to_worker: number | null
  status: string
  approved_at: string | null
  dispute: null
}

function formatShiftDay(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function clockIn(
  userId: string,
  applicationId: string,
  body: ClockInBody,
): Promise<ClockInResult> {
  const profile = await workerRepo.findByUserId(userId)
  if (!profile) {
    throw new AppError('PROFILE_NOT_FOUND', 404, 'Worker profile does not exist yet')
  }

  const app = await shiftApplicationRepo.findById(applicationId)
  if (!app) {
    throw new AppError('APPLICATION_NOT_FOUND', 404, 'Application does not exist')
  }
  if (app.worker_profile_id !== profile._id) {
    throw new AppError('FORBIDDEN', 403, 'This application belongs to another worker')
  }
  if (app.status !== 'confirmed') {
    throw new AppError('APPLICATION_NOT_CONFIRMED', 400, 'Application must be confirmed before clock-in')
  }

  const existing = await timesheetRepo.findByApplicationId(applicationId)
  if (existing) {
    throw new AppError('CLOCK_IN_ALREADY_DONE', 409, 'Already clocked in for this application')
  }

  const s = await shiftRepo.findById(app.shift_id)
  if (!s) {
    throw new AppError('SHIFT_NOT_FOUND', 404, 'Shift does not exist')
  }

  const now = new Date()
  const start = shiftStartUtc(s)
  const end = shiftEndUtc(s)
  const earliest = new Date(start.getTime() - EARLY_WINDOW_MS)

  if (now < earliest) {
    throw new AppError('CLOCK_IN_TOO_EARLY', 400, 'Cannot clock in more than 30 min before shift start')
  }
  if (now > end) {
    throw new AppError('CLOCK_IN_TOO_LATE', 400, 'Cannot clock in after shift end time')
  }

  // Worker point (body) vs shift venue (Shift) — not the same unless physically there.
  const distanceM = haversineMeters(body.lat, body.lng, s.location_lat, s.location_lng)
  if (distanceM > s.geofence_radius_m) {
    throw new AppError('CLOCK_IN_OUTSIDE_GEOFENCE', 400, 'Too far from shift venue')
  }

  // Optional; does not affect the distance check above.
  const accuracy =
    body.accuracy_m !== undefined && !Number.isNaN(body.accuracy_m) ? body.accuracy_m : null

  const row = await timesheetRepo.create({
    application_id: applicationId,
    shift_id: app.shift_id,
    worker_profile_id: profile._id,
    clock_in: now,
    clock_in_lat: body.lat,
    clock_in_lng: body.lng,
    clock_in_accuracy_m: accuracy,
    distance_from_venue_m: distanceM,
  })

  return {
    id: row._id,
    application_id: applicationId,
    clock_in: row.clock_in.toISOString(),
    clock_in_lat: row.clock_in_lat,
    clock_in_lng: row.clock_in_lng,
    distance_from_venue_m: row.distance_from_venue_m,
    status: row.status,
  }
}

export async function clockOut(
  userId: string,
  applicationId: string,
  body: ClockOutBody,
): Promise<ClockOutResult> {
  const profile = await workerRepo.findByUserId(userId)
  if (!profile) {
    throw new AppError('PROFILE_NOT_FOUND', 404, 'Worker profile does not exist yet')
  }

  const app = await shiftApplicationRepo.findById(applicationId)
  if (!app) {
    throw new AppError('APPLICATION_NOT_FOUND', 404, 'Application does not exist')
  }
  if (app.worker_profile_id !== profile._id) {
    throw new AppError('FORBIDDEN', 403, 'This application belongs to another worker')
  }

  const ts = await timesheetRepo.findByApplicationId(applicationId)
  if (!ts) {
    throw new AppError('CLOCK_OUT_NOT_OPEN', 400, 'Clock in before clock out')
  }
  if (ts.status !== 'open') {
    throw new AppError('CLOCK_OUT_ALREADY_DONE', 409, 'Timesheet is already submitted')
  }

  const s = await shiftRepo.findById(app.shift_id)
  if (!s) {
    throw new AppError('SHIFT_NOT_FOUND', 404, 'Shift does not exist')
  }

  const now = new Date()
  const hours =
    (now.getTime() - ts.clock_in.getTime()) / (1000 * 60 * 60)
  const total_hours = Math.round(hours * 100) / 100
  const gross_amount = Math.round(total_hours * s.hourly_rate * 100) / 100
  const net_to_worker = Math.round((gross_amount - (ts.platform_fee ?? 0)) * 100) / 100

  // Optional worker position at clock-out (same meaning as clock-in lat/lng).
  const lat = body.lat
  const lng = body.lng
  const clock_out_lat = lat !== undefined && lng !== undefined ? lat : null
  const clock_out_lng = lat !== undefined && lng !== undefined ? lng : null

  const updated = await timesheetRepo.updateClockOut(ts._id, {
    clock_out: now,
    clock_out_lat,
    clock_out_lng,
    total_hours,
    gross_amount,
    net_to_worker,
  })
  if (!updated) {
    throw new AppError('TIMESHEET_NOT_FOUND', 404, 'Timesheet not found')
  }

  return {
    id: updated._id,
    clock_in: updated.clock_in.toISOString(),
    clock_out: updated.clock_out!.toISOString(),
    total_hours: updated.total_hours!,
    gross_amount: updated.gross_amount!,
    status: updated.status,
  }
}

export async function getTimesheetForWorker(
  userId: string,
  timesheetId: string,
): Promise<TimesheetDetailResult> {
  const profile = await workerRepo.findByUserId(userId)
  if (!profile) {
    throw new AppError('PROFILE_NOT_FOUND', 404, 'Worker profile does not exist yet')
  }

  const ts = await timesheetRepo.findById(timesheetId)
  if (!ts) {
    throw new AppError('TIMESHEET_NOT_FOUND', 404, 'Timesheet does not exist')
  }
  if (ts.worker_profile_id !== profile._id) {
    throw new AppError('FORBIDDEN', 403, 'You cannot view this timesheet')
  }

  const s = await shiftRepo.findById(ts.shift_id)
  if (!s) {
    throw new AppError('SHIFT_NOT_FOUND', 404, 'Shift does not exist')
  }

  const gross = ts.gross_amount ?? 0
  const fee = ts.platform_fee ?? 0
  const net = ts.net_to_worker ?? Math.round((gross - fee) * 100) / 100

  return {
    id: ts._id,
    application_id: ts.application_id,
    worker: {
      id: profile._id,
      full_name: profile.full_name,
      avatar_url: profile.avatar_url ?? null,
      rating_avg: profile.rating_avg ?? 0,
    },
    shift: {
      id: s._id,
      title: s.title,
      date: formatShiftDay(s.date),
      start_time: s.start_time,
      end_time: s.end_time,
      hourly_rate: s.hourly_rate,
    },
    clock_in: ts.clock_in.toISOString(),
    clock_out: ts.clock_out ? ts.clock_out.toISOString() : null,
    total_hours: ts.total_hours ?? null,
    gross_amount: ts.gross_amount ?? null,
    platform_fee: fee,
    net_to_worker: ts.clock_out ? net : null,
    status: ts.status,
    approved_at: ts.approved_at ? ts.approved_at.toISOString() : null,
    dispute: null,
  }
}
