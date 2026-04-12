/* ═══════════════════════════════════════════════════════════════════════════
 *  worker.repo — Mongo queries for WorkerProfile only
 *
 *  DB only: no age checks, no duplicate logic — services own business rules.
 * ═══════════════════════════════════════════════════════════════════════════ */

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
    total_shifts: 0,
  })
  return doc
}

type WorkerProfilePatch = {
  full_name?: string
  avatar_url?: string | null
  bio?: string | null
  location_lat?: number
  location_lng?: number
  city?: string
  radius_km?: number
}

/** Applies only defined keys; returns null if no profile exists for this user. */
export async function updateByUserId(
  userId: string,
  patch: WorkerProfilePatch,
): Promise<WorkerProfileDoc | null> {
  return WorkerProfileModel.findOneAndUpdate({ user_id: userId }, { $set: patch }, { new: true }).exec()
}
