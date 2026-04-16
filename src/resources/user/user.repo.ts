/* ═══════════════════════════════════════════════════════════════════════════
 *  user.repo — Mongo queries for the User collection (user resource)
 *
 *  Optional password hash for admin-provisioned password login; OTP remains primary for most flows.
 * ═══════════════════════════════════════════════════════════════════════════ */

import type { UserRole } from './user.types.js'
import { UserModel, type UserDoc } from './user.model.js'

export async function findById(id: string): Promise<UserDoc | null> {
  return UserModel.findById(id).exec()
}

export async function findByPhone(phone: string): Promise<UserDoc | null> {
  return UserModel.findOne({ phone }).exec()
}

export async function findByEmail(email: string): Promise<UserDoc | null> {
  return UserModel.findOne({ email }).exec()
}

type CreateUserInput = {
  phone: string | null
  email: string | null
  role: UserRole
}

export async function create(input: CreateUserInput): Promise<UserDoc> {
  const doc = await UserModel.create({
    ...(input.phone != null && input.phone !== '' ? { phone: input.phone } : {}),
    ...(input.email != null && input.email !== '' ? { email: input.email } : {}),
    role: input.role,
    status: 'pending',
    onboarding_step: 0,
  })
  return doc
}

/** Updates how far the user got in onboarding (e.g. 3 after worker profile is saved). */
export async function updateOnboardingStep(userId: string, step: number): Promise<void> {
  await UserModel.updateOne({ _id: userId }, { $set: { onboarding_step: step } }).exec()
}

export async function setTotpPending(userId: string, secret: string): Promise<void> {
  await UserModel.updateOne({ _id: userId }, { $set: { totp_pending_secret: secret } }).exec()
}

/** Moves `totp_pending_secret` into `totp_secret` and enables TOTP. */
export async function activateTotpFromPending(userId: string): Promise<boolean> {
  const u = await UserModel.findById(userId).exec()
  if (!u || !u.totp_pending_secret) return false
  await UserModel.updateOne(
    { _id: userId },
    {
      $set: {
        totp_secret: u.totp_pending_secret,
        totp_enabled: true,
        totp_pending_secret: null,
      },
    },
  ).exec()
  return true
}
