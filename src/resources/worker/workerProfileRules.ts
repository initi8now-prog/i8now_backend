/* ═══════════════════════════════════════════════════════════════════════════
 *  workerProfileRules — small pure checks for worker profile onboarding
 *
 *  Used by worker.validator (DOB string checks) and worker.service (name + age).
 *  Keeps rules out of HTTP and DB layers so they stay easy to read and test.
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Parses `YYYY-MM-DD` into a UTC date at midnight (no timezone surprises for DOB).
 */
export function parseDobString(dob: string): Date {
  const parts = dob.split('-').map((p) => Number(p))
  const y = parts[0]
  const m = parts[1]
  const d = parts[2]
  if (!y || !m || !d) {
    return new Date(NaN)
  }
  return new Date(Date.UTC(y, m - 1, d))
}

/**
 * Full years between DOB and “today” in UTC — matches common “18+” legal checks.
 */
export function ageYearsUtc(dob: Date): number {
  const today = new Date()
  let age = today.getUTCFullYear() - dob.getUTCFullYear()
  const monthDiff = today.getUTCMonth() - dob.getUTCMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < dob.getUTCDate())) {
    age -= 1
  }
  return age
}

/**
 * Legal-style name: letters (any script), spaces, dot, apostrophe, hyphen; length 2–100.
 * Rejects empty-looking or numeric-only strings so PROFILE_NAME_INVALID is meaningful.
 */
export function isValidFullName(name: string): boolean {
  const trimmed = name.trim()
  if (trimmed.length < 2 || trimmed.length > 100) {
    return false
  }
  return /^[\p{L}\p{M}\s'.-]{2,100}$/u.test(trimmed)
}

/**
 * Formats a stored DOB Date as `YYYY-MM-DD` for API responses.
 */
export function formatDobDate(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
