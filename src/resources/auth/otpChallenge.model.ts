import mongoose from 'mongoose'

/* ═══════════════════════════════════════════════════════════════════════════
 *  OtpChallenge — the active OTP for “this phone/email + this device”
 *
 *  We name the model “Challenge” because it backs the login proof step: the
 *  user must respond with the code we sent. Longer beginner explanation:
 *  auth.service file header.
 *
 *  Why it exists:
 *    After request-otp, we store a HASH of the 6-digit code (never the raw
 *    digits). verify-otp checks the code against this row.
 *
 *  One row per pair (target + device), so requesting OTP again replaces it.
 *
 *  Fields in plain words:
 *    • attempts / locked_until — wrong guesses → lock for a cooldown period.
 * ═══════════════════════════════════════════════════════════════════════════ */

const otpChallengeSchema = new mongoose.Schema({
  /** Stable id for the login target, e.g. `phone:+91...` or `email:user@...`. */
  target_key: { type: String, required: true },
  /** Same device_id the client sent with request-otp and verify-otp. */
  device_id: { type: String, required: true },
  /** Hash of the 6-digit OTP (pepper + hash), not the OTP itself. */
  otp_hash: { type: String, required: true },
  /** After this time the OTP is treated as expired. */
  expires_at: { type: Date, required: true },
  /** How many wrong OTP tries so far (for lockout rules). */
  attempts: { type: Number, default: 0 },
  /** If set and in the future, we refuse more tries until it passes. */
  locked_until: { type: Date, default: null },
})

/** Only one challenge per target + device at a time. */
otpChallengeSchema.index({ target_key: 1, device_id: 1 }, { unique: true })

export type OtpChallengeDoc = mongoose.InferSchemaType<typeof otpChallengeSchema> & {
  _id: mongoose.Types.ObjectId
}

export const OtpChallengeModel = mongoose.model('OtpChallenge', otpChallengeSchema)
