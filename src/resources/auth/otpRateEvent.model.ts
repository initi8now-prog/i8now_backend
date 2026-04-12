import mongoose from 'mongoose'

/* ═══════════════════════════════════════════════════════════════════════════
 *  OtpRateEvent — “someone asked for an OTP” log (for rate limiting)
 *
 *  Why it exists:
 *    When a user requests an OTP, we drop one small row here so we can COUNT
 *    how many times that device or phone/email asked in the last hour.
 *    If the count is too high, we block with AUTH_RATE_LIMITED.
 *
 *  How it works:
 *    • `key` labels WHO we are counting, e.g. `device:abc-123` or
 *      `target:phone:+9198...` — one row per request we care about.
 *    • `created_at` is WHEN that request happened.
 *
 *  The TTL index below:
 *    MongoDB automatically deletes old rows after 2 hours so this collection
 *    does not grow forever. We only need recent history for rate limits.
 * ═══════════════════════════════════════════════════════════════════════════ */

const otpRateEventSchema = new mongoose.Schema({
  /** What we are counting (device id or target id as a single string). */
  key: { type: String, required: true, index: true },
  /** When this OTP request was recorded (used for “last hour” queries). */
  created_at: { type: Date, required: true, default: () => new Date() },
})

/** Auto-cleanup: remove documents ~2 hours after their `created_at` time. */
otpRateEventSchema.index({ created_at: 1 }, { expireAfterSeconds: 7200 })

/** Mongoose model: read/write the `otprateevents` collection (pluralized name). */
export const OtpRateEventModel = mongoose.model('OtpRateEvent', otpRateEventSchema)
