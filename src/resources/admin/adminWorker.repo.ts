/* ═══════════════════════════════════════════════════════════════════════════
 *  adminWorker.repo — Mongo access for admin actions on WorkerProfile
 *
 *  Lives under `admin/` so worker-facing `worker.repo.ts` stays small. DB only.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { WorkerProfileModel, type WorkerProfileDoc } from '../worker/workerProfile.model.js'

/**
 * Loads a single worker profile by document id (`wp_…`).
 * Used when admin opens one worker or when joining worker name on timesheet rows.
 */
export async function findByProfileId(profileId: string): Promise<WorkerProfileDoc | null> {
  return WorkerProfileModel.findById(profileId).exec()
}

/** Query shape for the paginated “all workers” list in the admin UI. */
export type AdminWorkerDirectoryFilter = {
  kyc_status?: 'unverified' | 'pending' | 'approved' | 'rejected'
  search?: string
}

function buildDirectoryQuery(filter: AdminWorkerDirectoryFilter): Record<string, unknown> {
  const q: Record<string, unknown> = {}
  if (filter.kyc_status !== undefined) {
    q.kyc_status = filter.kyc_status
  }
  if (filter.search !== undefined && filter.search.trim() !== '') {
    const escaped = filter.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    q.full_name = { $regex: escaped, $options: 'i' }
  }
  return q
}

/**
 * Returns how many worker profiles match the directory filter
 * (for pagination `meta.total`).
 */
export async function countForDirectory(filter: AdminWorkerDirectoryFilter): Promise<number> {
  return WorkerProfileModel.countDocuments(buildDirectoryQuery(filter)).exec()
}

/**
 * Returns one page of worker profiles for the directory, newest profiles first.
 */
export async function listForDirectory(
  filter: AdminWorkerDirectoryFilter,
  skip: number,
  limit: number,
): Promise<WorkerProfileDoc[]> {
  return WorkerProfileModel.find(buildDirectoryQuery(filter))
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(limit)
    .exec()
}

/** Payload for PATCH …/workers/:id/kyc (only fields admins may change here). */
export type AdminKycPatch = {
  kyc_status: string
  kyc_review_note?: string | null
}

/**
 * Writes KYC decision fields on a profile identified by `wp_…` id.
 * Returns the updated document, or null if no such profile exists.
 */
export async function updateKycByProfileId(
  profileId: string,
  patch: AdminKycPatch,
): Promise<WorkerProfileDoc | null> {
  return WorkerProfileModel.findByIdAndUpdate(profileId, { $set: patch }, { new: true }).exec()
}
