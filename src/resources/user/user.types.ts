/* ═══════════════════════════════════════════════════════════════════════════
 *  user.types — shared vocabulary for roles, account state, and public payloads
 *
 *  Imported by auth middleware, JWT helpers, and Express typings. The User
 *  model lives in user.model.ts; this file stays types-only.
 * ═══════════════════════════════════════════════════════════════════════════ */

export type UserRole = 'worker' | 'employer' | 'admin'

export type UserStatus = 'pending' | 'active' | 'suspended' | 'banned'

export type UserPublic = {
  id: string
  role: UserRole
  status: UserStatus
  is_new: boolean
  onboarding_step: number
}
