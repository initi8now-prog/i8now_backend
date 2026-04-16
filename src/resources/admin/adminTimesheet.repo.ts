/* ═══════════════════════════════════════════════════════════════════════════
 *  adminTimesheet.repo — Mongo access for admin timesheet directory + approval
 *
 *  Worker clock-in/out continues to use `timesheet/timesheet.repo.ts` only.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { TimesheetModel, type TimesheetDoc } from '../timesheet/timesheet.model.js'

/** Filters for the admin timesheet queue (list + count). */
export type AdminTimesheetQueueFilter = {
  status?: 'open' | 'pending' | 'approved' | 'disputed' | 'paid'
  worker_profile_id?: string
  shift_id?: string
}

function buildQueueQuery(f: AdminTimesheetQueueFilter): Record<string, unknown> {
  const q: Record<string, unknown> = {}
  if (f.status !== undefined) q.status = f.status
  if (f.worker_profile_id !== undefined) q.worker_profile_id = f.worker_profile_id
  if (f.shift_id !== undefined) q.shift_id = f.shift_id
  return q
}

/**
 * How many timesheets match the queue filter (pagination total).
 */
export async function countForQueue(f: AdminTimesheetQueueFilter): Promise<number> {
  return TimesheetModel.countDocuments(buildQueueQuery(f)).exec()
}

/**
 * One page of timesheets for the admin queue, newest first.
 */
export async function listForQueue(
  f: AdminTimesheetQueueFilter,
  skip: number,
  limit: number,
): Promise<TimesheetDoc[]> {
  return TimesheetModel.find(buildQueueQuery(f))
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(limit)
    .exec()
}

/**
 * Marks a timesheet approved and stamps `approved_at` (support when employer cannot).
 */
export async function setApproved(id: string, approvedAt: Date): Promise<TimesheetDoc | null> {
  return TimesheetModel.findByIdAndUpdate(
    id,
    { $set: { status: 'approved', approved_at: approvedAt } },
    { new: true },
  ).exec()
}
