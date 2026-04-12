/* ═══════════════════════════════════════════════════════════════════════════
 *  otpChallenge.repo — read/write rows that store the hashed OTP + lock state
 *
 *  One active challenge per (target_key + device_id); upsert replaces the old OTP.
 *
 *  “Challenge” here = one DB record that backs the login proof step: the user
 *  must send the code we “challenged” them with. See auth.service file header.
 *
 *  Used by:
 *    • auth.service.requestOtp → upsertChallenge (create/replace after send OTP)
 *    • auth.service.verifyOtp → findChallenge, incrementAttempts, lockChallenge,
 *      deleteByTargetAndDevice (check code, lock on failures, remove on success)
 * ═══════════════════════════════════════════════════════════════════════════ */

import { OtpChallengeModel, type OtpChallengeDoc } from './otpChallenge.model.js'

/** Save the active OTP for this phone/email + device (called from requestOtp). */
export async function upsertChallenge(
  target_key: string,
  device_id: string,
  otp_hash: string,
  expires_at: Date,
): Promise<void> {
  await OtpChallengeModel.findOneAndUpdate(
    { target_key, device_id },
    {
      $set: {
        otp_hash,
        expires_at,
        locked_until: null,
        attempts: 0,
      },
    },
    { upsert: true, new: true },
  ).exec()
}

/** Load the challenge row for verifyOtp (null if none — expired, used, or missing). */
export async function findChallenge(
  target_key: string,
  device_id: string,
): Promise<OtpChallengeDoc | null> {
  return OtpChallengeModel.findOne({ target_key, device_id }).exec()
}

export async function deleteByTargetAndDevice(target_key: string, device_id: string): Promise<void> {
  await OtpChallengeModel.deleteOne({ target_key, device_id }).exec()
}

export async function incrementAttempts(challengeId: unknown): Promise<OtpChallengeDoc | null> {
  return OtpChallengeModel.findByIdAndUpdate(
    challengeId,
    { $inc: { attempts: 1 } },
    { new: true },
  ).exec()
}

export async function lockChallenge(challengeId: unknown, locked_until: Date): Promise<void> {
  await OtpChallengeModel.findByIdAndUpdate(challengeId, { $set: { locked_until } }).exec()
}
