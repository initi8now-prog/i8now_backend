/* ═══════════════════════════════════════════════════════════════════════════
 *  worker.service — business rules for worker profile create / update / read
 *
 *  Controllers call here with the authenticated user id. This layer checks
 *  duplicates, age 18+, name rules, then talks to worker + user repositories.
 *  No req/res — only AppError when something blocks the operation.
 * ═══════════════════════════════════════════════════════════════════════════ */

import * as userRepo from '../user/user.repo.js'
import * as workerRepo from './worker.repo.js'
import { AppError } from '../../utils/errors.js'
import {
  ageYearsUtc,
  formatDobDate,
  isValidFullName,
  parseDobString,
} from './workerProfileRules.js'
import type { CreateWorkerProfileBody, UpdateWorkerProfileBody } from './worker.validator.js'
import type { WorkerProfileDoc } from './workerProfile.model.js'

// Create Profile Result
type CreateProfileResult = {
  id: string
  user_id: string
  full_name: string
  dob: string
  avatar_url: string | null
  bio: string | null
  location_lat: number
  location_lng: number
  city: string
  radius_km: number
  kyc_status: string
  rating_avg: number
  total_shifts: number
  onboarding_step: number
  created_at: string
}

// Update Profile Result
type UpdateProfileResult = {
  id: string
  full_name: string
  avatar_url: string | null
  bio: string | null
  city: string
  radius_km: number
  updated_at: string
}

type PayoutPreview = {
  account_holder: string
  masked_account: string
  upi_id: string
  verified: boolean
} | null

type CategoryPreview = { id: string; name: string; slug: string }

type QualificationPreview = {
  id: string
  type: string
  title: string
  institution: string
  from_date: string
  to_date: string | null
  description: string | null
  verified: boolean
  created_at: string
}

type DocumentPreview = {
  type: string
  status: string
  reviewed_at: string | null
}

type MeProfileResult = {
  id: string
  user_id: string
  full_name: string
  dob: string
  avatar_url: string | null
  bio: string | null
  city: string
  location_lat: number
  location_lng: number
  radius_km: number
  kyc_status: string
  rating_avg: number
  total_shifts: number
  onboarding_step: number
  categories: CategoryPreview[]
  qualifications: QualificationPreview[]
  documents: DocumentPreview[]
  payout_account: PayoutPreview
  created_at: string
  updated_at: string
}

function roundRating(n: number): number {
  // Round the rating to 2 decimal places
  // 1. Multiply the rating by 100
  // 2. Round the result to the nearest integer
  // 3. Divide the result by 100
  return Math.round(n * 100) / 100
}

function profileDocToCreated(doc: WorkerProfileDoc, onboardingStep: number): CreateProfileResult {
  const created = (doc as { created_at?: Date }).created_at
  return {
    id: doc._id,
    user_id: doc.user_id,
    full_name: doc.full_name,
    dob: formatDobDate(doc.dob),
    avatar_url: doc.avatar_url ?? null,
    bio: doc.bio ?? null,
    location_lat: doc.location_lat,
    location_lng: doc.location_lng,
    city: doc.city,
    radius_km: doc.radius_km,
    kyc_status: doc.kyc_status,
    rating_avg: roundRating(doc.rating_avg),
    total_shifts: doc.total_shifts,
    onboarding_step: onboardingStep,
    created_at: created ? created.toISOString() : new Date().toISOString(),
  }
}

/**
 * First-time worker profile after OTP: saves name, DOB, home location, optional bio/photo URL.
 * Sets user onboarding to step 3. Fails if a profile already exists or user is under 18.
 */
export async function createProfile(userId: string, body: CreateWorkerProfileBody): Promise<CreateProfileResult> {
  const existing = await workerRepo.findByUserId(userId)
  if (existing) {
    throw new AppError('PROFILE_ALREADY_EXISTS', 409, 'Worker profile already created for this user')
  }

  if (!isValidFullName(body.full_name)) {
    throw new AppError('PROFILE_NAME_INVALID', 400, 'Name contains invalid characters or is too short')
  }

  const dobDate = parseDobString(body.dob)
  if (ageYearsUtc(dobDate) < 18) {
    throw new AppError('PROFILE_UNDERAGE', 400, 'Worker must be at least 18 years old')
  }

  const doc = await workerRepo.create({
    user_id: userId,
    full_name: body.full_name.trim(),
    dob: dobDate,
    avatar_url: body.avatar_url ?? null,
    bio: body.bio ?? null,
    location_lat: body.location_lat,
    location_lng: body.location_lng,
    city: body.city.trim(),
    radius_km: body.radius_km,
  })

  await userRepo.updateOnboardingStep(userId, 3)

  return profileDocToCreated(doc, 3)
}

/**
 * Change any subset of profile fields (all optional in the body). Used after onboarding too.
 */
export async function updateProfile(userId: string, body: UpdateWorkerProfileBody): Promise<UpdateProfileResult> {
  const profile = await workerRepo.findByUserId(userId)
  if (!profile) {
    throw new AppError('PROFILE_NOT_FOUND', 404, 'Worker profile does not exist yet')
  }

  const patch: Parameters<typeof workerRepo.updateByUserId>[1] = {}

  if (body.full_name !== undefined) {
    if (!isValidFullName(body.full_name)) {
      throw new AppError('PROFILE_NAME_INVALID', 400, 'Name contains invalid characters or is too short')
    }
    patch.full_name = body.full_name.trim()
  }
  if (body.avatar_url !== undefined) {
    patch.avatar_url = body.avatar_url
  }
  if (body.bio !== undefined) {
    patch.bio = body.bio
  }
  if (body.location_lat !== undefined) {
    patch.location_lat = body.location_lat
  }
  if (body.location_lng !== undefined) {
    patch.location_lng = body.location_lng
  }
  if (body.city !== undefined) {
    patch.city = body.city.trim()
  }
  if (body.radius_km !== undefined) {
    patch.radius_km = body.radius_km
  }

  const updated = await workerRepo.updateByUserId(userId, patch)
  if (!updated) {
    throw new AppError('PROFILE_NOT_FOUND', 404, 'Worker profile does not exist yet')
  }

  const u = updated as { updated_at?: Date }
  return {
    id: updated._id,
    full_name: updated.full_name,
    avatar_url: updated.avatar_url ?? null,
    bio: updated.bio ?? null,
    city: updated.city,
    radius_km: updated.radius_km,
    updated_at: (u.updated_at ?? new Date()).toISOString(),
  }
}

/**
 * Full “my profile” payload for the app home screen. Categories, qualifications,
 * documents, and payout are empty until those features are wired in later.
 */
export async function getMyProfile(userId: string): Promise<MeProfileResult> {
  const profile = await workerRepo.findByUserId(userId)
  if (!profile) {
    throw new AppError('PROFILE_NOT_FOUND', 404, 'Worker profile does not exist yet')
  }

  const user = await userRepo.findById(userId)
  const onboardingStep = user?.onboarding_step ?? 0

  const created = (profile as { created_at?: Date }).created_at
  const updated = (profile as { updated_at?: Date }).updated_at

  return {
    id: profile._id,
    user_id: profile.user_id,
    full_name: profile.full_name,
    dob: formatDobDate(profile.dob),
    avatar_url: profile.avatar_url ?? null,
    bio: profile.bio ?? null,
    city: profile.city,
    location_lat: profile.location_lat,
    location_lng: profile.location_lng,
    radius_km: profile.radius_km,
    kyc_status: profile.kyc_status,
    rating_avg: roundRating(profile.rating_avg),
    total_shifts: profile.total_shifts,
    onboarding_step: onboardingStep,
    categories: [],
    qualifications: [],
    documents: [],
    payout_account: null,
    created_at: created ? created.toISOString() : new Date().toISOString(),
    updated_at: updated ? updated.toISOString() : new Date().toISOString(),
  }
}
