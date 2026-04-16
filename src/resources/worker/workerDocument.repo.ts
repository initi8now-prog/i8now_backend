/* ═══════════════════════════════════════════════════════════════════════════
 *  workerDocument.repo — insert + list + duplicate check for KYC rows
 *
 *  DB only — duplicate logic lives in service using hasBlockingDuplicate.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { WorkerDocumentModel, type WorkerDocumentDoc } from './workerDocument.model.js'

type CreateDocInput = {
  worker_profile_id: string
  type: 'govt_id' | 'right_to_work' | 'background_check'
  file_url: string
}

export async function create(input: CreateDocInput): Promise<WorkerDocumentDoc> {
  return WorkerDocumentModel.create({
    worker_profile_id: input.worker_profile_id,
    type: input.type,
    file_url: input.file_url,
    status: 'pending',
    reviewed_at: null,
  })
}

export async function listByWorkerProfileId(workerProfileId: string): Promise<WorkerDocumentDoc[]> {
  return WorkerDocumentModel.find({ worker_profile_id: workerProfileId }).sort({ created_at: 1 }).exec()
}

/** True if this profile already has pending or approved doc of this type. */
export async function hasBlockingDuplicate(
  workerProfileId: string,
  type: string,
): Promise<boolean> {
  const found = await WorkerDocumentModel.findOne({
    worker_profile_id: workerProfileId,
    type,
    status: { $in: ['pending', 'approved'] },
  })
    .select('_id')
    .exec()
  return found !== null
}

export async function setStatusById(
  id: string,
  workerProfileId: string,
  status: 'pending' | 'approved' | 'rejected',
): Promise<WorkerDocumentDoc | null> {
  return WorkerDocumentModel.findOneAndUpdate(
    { _id: id, worker_profile_id: workerProfileId },
    { $set: { status, reviewed_at: status === 'pending' ? null : new Date() } },
    { new: true },
  ).exec()
}

export async function deleteById(id: string, workerProfileId: string): Promise<boolean> {
  const r = await WorkerDocumentModel.deleteOne({ _id: id, worker_profile_id: workerProfileId }).exec()
  return r.deletedCount === 1
}
