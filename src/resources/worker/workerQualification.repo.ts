/* ═══════════════════════════════════════════════════════════════════════════
 *  workerQualification.repo — list / insert qualification rows for a profile
 *
 *  DB only — no business rules.
 * ═══════════════════════════════════════════════════════════════════════════ */

import {
  WorkerQualificationModel,
  type WorkerQualificationDoc,
} from './workerQualification.model.js'

type CreateQualInput = {
  worker_profile_id: string
  type: 'education' | 'work_experience' | 'certification'
  title: string
  institution: string
  from_date: Date
  to_date: Date | null
  description: string | null
}

export async function create(input: CreateQualInput): Promise<WorkerQualificationDoc> {
  return WorkerQualificationModel.create({
    worker_profile_id: input.worker_profile_id,
    type: input.type,
    title: input.title,
    institution: input.institution,
    from_date: input.from_date,
    to_date: input.to_date,
    description: input.description,
    verified: false,
  })
}

export async function listByWorkerProfileId(workerProfileId: string): Promise<WorkerQualificationDoc[]> {
  return WorkerQualificationModel.find({ worker_profile_id: workerProfileId }).sort({ created_at: 1 }).exec()
}

export async function deleteById(id: string): Promise<WorkerQualificationDoc | null> {
  return WorkerQualificationModel.findByIdAndDelete(id).exec()
}
