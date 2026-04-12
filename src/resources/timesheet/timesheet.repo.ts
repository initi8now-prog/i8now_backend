/* ═══════════════════════════════════════════════════════════════════════════
 *  timesheet.repo — Mongo queries for Timesheet documents
 *
 *  DB only — no business rules.
 *
 *  Persisted location fields (see timesheet.model):
 *    • clock_in_lat / clock_in_lng — worker position from the clock-in API body.
 *    • clock_in_accuracy_m — optional GPS accuracy from the same request.
 *    • distance_from_venue_m — precomputed distance to Shift venue (metres).
 *    • clock_out_lat / clock_out_lng — optional worker position at clock-out.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { TimesheetModel, type TimesheetDoc } from './timesheet.model.js'

export async function create(doc: {
  application_id: string
  shift_id: string
  worker_profile_id: string
  clock_in: Date
  clock_in_lat: number
  clock_in_lng: number
  clock_in_accuracy_m: number | null
  distance_from_venue_m: number
}): Promise<TimesheetDoc> {
  return TimesheetModel.create({
    application_id: doc.application_id,
    shift_id: doc.shift_id,
    worker_profile_id: doc.worker_profile_id,
    clock_in: doc.clock_in,
    clock_in_lat: doc.clock_in_lat,
    clock_in_lng: doc.clock_in_lng,
    clock_in_accuracy_m: doc.clock_in_accuracy_m,
    distance_from_venue_m: doc.distance_from_venue_m,
    status: 'open',
  })
}

export async function findById(id: string): Promise<TimesheetDoc | null> {
  return TimesheetModel.findById(id).exec()
}

export async function findByApplicationId(applicationId: string): Promise<TimesheetDoc | null> {
  return TimesheetModel.findOne({ application_id: applicationId }).exec()
}

export async function findByApplicationIds(applicationIds: string[]): Promise<TimesheetDoc[]> {
  if (applicationIds.length === 0) return []
  const uniq = [...new Set(applicationIds)]
  return TimesheetModel.find({ application_id: { $in: uniq } }).exec()
}

export async function updateClockOut(
  id: string,
  data: {
    clock_out: Date
    clock_out_lat: number | null
    clock_out_lng: number | null
    total_hours: number
    gross_amount: number
    net_to_worker: number
  },
): Promise<TimesheetDoc | null> {
  return TimesheetModel.findByIdAndUpdate(
    id,
    {
      $set: {
        clock_out: data.clock_out,
        clock_out_lat: data.clock_out_lat,
        clock_out_lng: data.clock_out_lng,
        total_hours: data.total_hours,
        gross_amount: data.gross_amount,
        platform_fee: 0,
        net_to_worker: data.net_to_worker,
        status: 'pending',
      },
    },
    { new: true },
  ).exec()
}
