/* ═══════════════════════════════════════════════════════════════════════════
 *  authTargets — build one stable string id for “this login target”
 *
 *  Same key is used for OTP rows, rate-limit counters, and lookups so every
 *  layer agrees on what “the phone login” vs “the email login” means.
 * ═══════════════════════════════════════════════════════════════════════════ */

export function buildTargetKey(phone: string | undefined, email: string | undefined): string {
  if (phone !== undefined) return `phone:${phone}`
  if (email !== undefined) return `email:${email.toLowerCase()}`
  throw new Error('Missing auth target')
}
