/* ═══════════════════════════════════════════════════════════════════════════
 *  otpRate.repo — insert “someone asked for OTP” events + count them in a window
 *
 *  Used only for rate limiting; TTL on the collection trims old rows automatically.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { OtpRateEventModel } from './otpRateEvent.model.js'

export async function countSince(key: string, since: Date): Promise<number> {
  return OtpRateEventModel.countDocuments({ key, created_at: { $gte: since } }).exec()
}

export async function recordEvent(key: string): Promise<void> {
  await OtpRateEventModel.create({ key, created_at: new Date() })
}
