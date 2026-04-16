/* ═══════════════════════════════════════════════════════════════════════════
 *  constants — magic numbers in one place (TTLs, limits, URL prefix)
 *
 *  Tweak here instead of hunting through services when you change policy.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** All versioned HTTP routes hang under this path prefix. */
export const API_PREFIX = '/api/v1'

/** Short-lived JWT lifetime (seconds). */
export const ACCESS_TOKEN_TTL_SEC = 900
/** Refresh token lifetime (days). */
export const REFRESH_TOKEN_TTL_DAYS = 30
/** OTP valid window (seconds). */
export const OTP_TTL_SEC = 300
/** Wrong OTP tries before we lock the challenge. */
export const OTP_MAX_ATTEMPTS = 5
/** How long the challenge stays locked after too many wrong OTPs (minutes). */
export const OTP_LOCK_MINUTES = 15

/** Max OTP “request-otp” calls per device per rolling hour. */
export const OTP_RATE_DEVICE_PER_HOUR = 10
/** Max OTP “request-otp” calls per phone/email per rolling hour. */
export const OTP_RATE_TARGET_PER_HOUR = 5

/** Short-lived JWT after email OTP when admin must complete authenticator (seconds). */
export const MFA_TOKEN_TTL_SEC = 300
