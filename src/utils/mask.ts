/* ═══════════════════════════════════════════════════════════════════════════
 *  mask — hide most of phone/email for safe display after OTP send
 *
 *  The API returns these so the UI can show “we sent a code to ****” without
 *  leaking the full secret in the response body.
 * ═══════════════════════════════════════════════════════════════════════════ */

export function maskPhone(phone: string): string {
  // Mask Phone: Remove non-digits and keep last 4 digits (but how ?)
  // 1. Trim the phone number to remove any leading or trailing whitespace
  // 2. Replace all non-digits with an empty string
  // 3. Keep the last 4 digits
  // 4. If the phone number has less than 4 digits, replace the remaining digits with ****
  // 5. If the phone number starts with a +, keep the first 3 digits
  // 6. If the phone number does not start with a +, keep the first 2 digits
  // 7. Return the masked phone number
  const normalized = phone.trim()
  const digits = normalized.replace(/\D/g, '')
  const last4 = digits.length >= 4 ? digits.slice(-4) : '****'
  const prefix = normalized.startsWith('+') ? normalized.slice(0, 3) : normalized.slice(0, 2)
  return `${prefix}****${last4}`
}

export function maskEmail(email: string): string {
  const trimmed = email.trim()
  const at = trimmed.indexOf('@')
  if (at <= 0) return '****'
  const local = trimmed.slice(0, at)
  const domain = trimmed.slice(at + 1)
  const first = local[0] ?? '*'
  return `${first}***@${domain}`
}
