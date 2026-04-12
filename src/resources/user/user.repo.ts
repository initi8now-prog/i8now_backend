/* ═══════════════════════════════════════════════════════════════════════════
 *  user.repo — Mongo queries for the User collection (user resource)
 *
 *  No passwords (OTP app). No business rules — callers decide when to create.
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
    phone: input.phone,
    email: input.email,
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
