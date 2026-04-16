/* ═══════════════════════════════════════════════════════════════════════════
 *  admin.seed — optional bootstrap: promote one user to `admin` via env
 *
 *  Set ADMIN_PROMOTE_EMAIL in .env to the email of an existing account (after
 *  they have verified OTP once). On startup, role becomes `admin` and status
 *  `active`. Remove or leave unset in production if you prefer manual DB only.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { loadEnv } from '../../config/env.js'
import { UserModel, type UserDoc } from '../user/user.model.js'

/**
 * If `ADMIN_PROMOTE_EMAIL` is set, sets that user’s role to `admin` and status
 * to `active`. No-op when unset or when no user matches the email.
 */
export async function promoteAdminFromEnv(): Promise<void> {
  const env = loadEnv()
  if (!env.ADMIN_PROMOTE_EMAIL) return

  const email = env.ADMIN_PROMOTE_EMAIL.toLowerCase()
  const r = await UserModel.updateOne(
    { email },
    { $set: { role: 'admin', status: 'active' } },
  ).exec()

  if (r.matchedCount === 0) {
    console.warn(`[admin.seed] No user with email ${email} — admin promotion skipped`)
  }
}

/**
 * After OTP success: if `ADMIN_PROMOTE_EMAIL` matches this login email, promote
 * that user so the first sign-up can become admin without a server restart (startup
 * seed runs before any user exists).
 */
export async function promoteUserIfBootstrapEmail(
  user: UserDoc,
  emailLower: string | undefined,
): Promise<UserDoc> {
  const env = loadEnv()
  if (!emailLower || !env.ADMIN_PROMOTE_EMAIL) return user
  if (env.ADMIN_PROMOTE_EMAIL.toLowerCase() !== emailLower) return user

  const updated = await UserModel.findByIdAndUpdate(
    user._id,
    { $set: { role: 'admin', status: 'active' } },
    { new: true },
  ).exec()

  return updated ?? user
}
