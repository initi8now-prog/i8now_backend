/* ═══════════════════════════════════════════════════════════════════════════
 *  shiftApplication.repo — applications for shifts (worker profile id = wp_…)
 *
 *  DB only — no business rules.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { ShiftApplicationModel, type ShiftApplicationDoc } from './shiftApplication.model.js'

export async function create(
  shift_id: string,
  worker_profile_id: string,
): Promise<ShiftApplicationDoc> {
  return ShiftApplicationModel.create({
    shift_id,
    worker_profile_id,
    status: 'applied',
    applied_at: new Date(),
  })
}

export async function findById(id: string): Promise<ShiftApplicationDoc | null> {
  return ShiftApplicationModel.findById(id).exec()
}

export async function findByShiftAndWorker(
  shiftId: string,
  workerProfileId: string,
): Promise<ShiftApplicationDoc | null> {
  return ShiftApplicationModel.findOne({ shift_id: shiftId, worker_profile_id: workerProfileId }).exec()
}

export async function findByShiftIdsAndWorker(
  shiftIds: string[],
  workerProfileId: string,
): Promise<ShiftApplicationDoc[]> {
  if (shiftIds.length === 0) return []
  return ShiftApplicationModel.find({
    shift_id: { $in: shiftIds },
    worker_profile_id: workerProfileId,
  }).exec()
}

type AppStatusFilter = 'applied' | 'confirmed' | 'rejected' | 'completed' | 'cancelled' | undefined

export async function listByWorkerProfile(
  workerProfileId: string,
  status: AppStatusFilter,
  skip: number,
  limit: number,
): Promise<ShiftApplicationDoc[]> {
  const q: Record<string, unknown> = { worker_profile_id: workerProfileId }
  if (status !== undefined) {
    q.status = status
  }
  return ShiftApplicationModel.find(q)
    .sort({ applied_at: -1 })
    .skip(skip)
    .limit(limit)
    .exec()
}

export async function countByWorkerProfile(
  workerProfileId: string,
  status: AppStatusFilter,
): Promise<number> {
  const q: Record<string, unknown> = { worker_profile_id: workerProfileId }
  if (status !== undefined) {
    q.status = status
  }
  return ShiftApplicationModel.countDocuments(q).exec()
}
