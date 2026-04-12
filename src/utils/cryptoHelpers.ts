/* ═══════════════════════════════════════════════════════════════════════════
 *  cryptoHelpers — small crypto utilities (OTP + tokens), no business logic
 *
 *  • OTPs are hashed with a server “pepper” before touching the database.
 *  • Refresh tokens are random bytes; we only store a hash of them.
 *  • Comparisons use timing-safe helpers where it matters.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { createHash, randomBytes, timingSafeEqual } from 'crypto'

// Hash OTP
export function hashOtp(otp: string, pepper: string): string {
  return createHash('sha256').update(pepper).update(otp).digest('hex')
}

// Verify OTP Hash
export function verifyOtpHash(otp: string, pepper: string, expectedHex: string): boolean {
  const computedHex = hashOtp(otp, pepper)
  try {
    const a = Buffer.from(computedHex, 'hex')
    const b = Buffer.from(expectedHex, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// Hash Token
export function hashToken(raw: string, pepper: string): string {
  return createHash('sha256').update(pepper).update(raw).digest('hex')
}

// New Refresh Token Raw
export function newRefreshTokenRaw(): string {
  return randomBytes(48).toString('base64url')
}

// New OTP Digits
export function newOtpDigits(): string {
  const n = randomBytes(4).readUInt32BE(0) % 1_000_000
  return String(n).padStart(6, '0')
}
