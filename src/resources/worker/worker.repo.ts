/* ═══════════════════════════════════════════════════════════════════════════
 *  worker.repo — Mongo queries for WorkerProfile only
 *
 *  DB only: no age checks, no duplicate logic — services own business rules.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { nextRunningAverage } from '../../utils/rating.js'
import { WorkerProfileModel, type WorkerProfileDoc } from './workerProfile.model.js'

export async function findByUserId(userId: string): Promise<WorkerProfileDoc | null> {
  return WorkerProfileModel.findOne({ user_id: userId }).exec()
}

type CreateWorkerProfileInput = {
  user_id: string
  full_name: string
  dob: Date
  avatar_url: string | null
  bio: string | null
  location_lat: number
  location_lng: number
  city: string
  radius_km: number
}

/** Inserts a new worker profile row (service ensures user has none yet). */
export async function create(input: CreateWorkerProfileInput): Promise<WorkerProfileDoc> {
  const doc = await WorkerProfileModel.create({
    user_id: input.user_id,
    full_name: input.full_name,
    dob: input.dob,
    avatar_url: input.avatar_url,
    bio: input.bio,
    location_lat: input.location_lat,
    location_lng: input.location_lng,
    city: input.city,
    radius_km: input.radius_km,
    kyc_status: 'unverified',
    rating_avg: 0,
    rating_count: 0,
    total_shifts: 0,
    category_ids: [],
  })
  return doc
}

type WorkerProfilePatch = {
  full_name?: string
  dob?: Date
  avatar_url?: string | null
  bio?: string | null
  location_lat?: number
  location_lng?: number
  city?: string
  radius_km?: number
  category_ids?: string[]
  kyc_status?: string
  kyc_review_note?: string | null
  payout_account_holder?: string | null
  payout_masked_account?: string | null
  payout_upi_id?: string | null
  payout_verified?: boolean
}

/** Applies only defined keys; returns null if no profile exists for this user. */
export async function updateByUserId(
  userId: string,
  patch: WorkerProfilePatch,
): Promise<WorkerProfileDoc | null> {
  return WorkerProfileModel.findOneAndUpdate({ user_id: userId }, { $set: patch }, { new: true }).exec()
}

/**
 * Applies one employer→worker star rating (1–5) to the running average on the profile.
 */
export async function incrementRatingFromEmployer(
  workerProfileId: string,
  stars: number,
): Promise<WorkerProfileDoc | null> {
  const doc = await WorkerProfileModel.findById(workerProfileId).exec()
  if (!doc) return null
  const oldC = doc.rating_count ?? 0
  const newAvg = nextRunningAverage(doc.rating_avg, oldC, stars)
  const newC = oldC + 1
  return WorkerProfileModel.findByIdAndUpdate(
    workerProfileId,
    { $set: { rating_avg: newAvg, rating_count: newC } },
    { new: true },
  ).exec()
}

export async function incrementRatingFromAdminOnce(
  workerProfileId: string,
  adminUserId: string,
  stars: number,
): Promise<{ doc: WorkerProfileDoc | null; alreadyRated: boolean }> {
  const doc = await WorkerProfileModel.findById(workerProfileId).exec()
  if (!doc) return { doc: null, alreadyRated: false }
  if ((doc.admin_rater_user_ids ?? []).includes(adminUserId)) {
    return { doc, alreadyRated: true }
  }
  const oldC = doc.rating_count ?? 0
  const newAvg = nextRunningAverage(doc.rating_avg, oldC, stars)
  const newC = oldC + 1
  const updated = await WorkerProfileModel.findByIdAndUpdate(
    workerProfileId,
    {
      $set: { rating_avg: newAvg, rating_count: newC },
      $addToSet: { admin_rater_user_ids: adminUserId },
    },
    { new: true },
  ).exec()
  return { doc: updated, alreadyRated: false }
}
