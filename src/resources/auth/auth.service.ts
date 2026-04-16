/* ═══════════════════════════════════════════════════════════════════════════
 *  auth.service — login / signup logic (OTP + JWT + refresh token)
 *
 *  This file is the “brain” for authentication. It does NOT talk HTTP; routes
 *  and controllers do that. Here we only:
 *    • requestOtp — create a challenge + rate-limit markers
 *    • verifyOtp — check OTP, create user if first time, issue tokens
 *    • refreshAccessToken — mint a new short-lived access JWT from refresh
 *
 *  All database work goes through repositories (no raw Mongoose here).
 *
 *  ── What is an “OTP challenge”? ───────────────────────
 *  A challenge is one row in the database for: “this phone or email” + “this
 *  device”. It stores a hash of the 6-digit code (not the code itself) and
 *  when that code stops working (expires_at). We use the word “challenge”
 *  because the server is asking the user to prove they got the message: they
 *  must answer with the right code. That proof step is a common idea in
 *  security (“challenge–response”). This row is the data behind that step.
 *
 *  Where it shows up:
 *    • POST /request-otp → requestOtp() → writes or replaces the challenge
 *      (see otpChallenge.repo.upsertChallenge).
 *    • POST /verify-otp → verifyOtp() → reads the challenge, checks the code,
 *      then deletes it on success (see otpChallenge.repo.findChallenge, etc.).
 * ═══════════════════════════════════════════════════════════════════════════ */

import { loadEnv } from '../../config/env.js'
import {
  ACCESS_TOKEN_TTL_SEC,
  MFA_TOKEN_TTL_SEC,
  OTP_LOCK_MINUTES,
  OTP_MAX_ATTEMPTS,
  OTP_RATE_DEVICE_PER_HOUR,
  OTP_RATE_TARGET_PER_HOUR,
  OTP_TTL_SEC,
  REFRESH_TOKEN_TTL_DAYS,
} from '../../config/constants.js'
import * as otpChallengeRepo from './otpChallenge.repo.js'
import * as otpRateRepo from './otpRate.repo.js'
import * as refreshTokenRepo from './refreshToken.repo.js'
import { promoteUserIfBootstrapEmail } from '../admin/admin.seed.js'
import * as platformSettingsRepo from '../admin/platformSettings.repo.js'
import * as userRepo from '../user/user.repo.js'
import { hashOtp, hashToken, newOtpDigits, newRefreshTokenRaw, verifyOtpHash } from '../../utils/cryptoHelpers.js'
import { AppError } from '../../utils/errors.js'
import { signAccessToken, signMfaToken, verifyMfaToken } from '../../utils/jwt.js'
import { verify as verifyTotp } from 'otplib'
import { maskEmail, maskPhone } from '../../utils/mask.js'
import { verifyPassword } from '../../utils/password.js'
import { buildTargetKey } from './authTargets.js'
import { getLogger } from '../../instrumentation/logger.js'
import type { UserDoc } from '../user/user.model.js'
import type { LoginPasswordBody, RequestOtpBody, VerifyAdminTotpBody, VerifyOtpBody } from './auth.validator.js'

// Request OTP Result
type RequestOtpResult = {
  otp_sent: boolean
  expires_in: number
  masked_target: string
}

function toPlainObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object') return {}
  const candidate = input as { toObject?: () => unknown }
  if (typeof candidate.toObject === 'function') {
    const plain = candidate.toObject()
    return plain && typeof plain === 'object' ? (plain as Record<string, unknown>) : {}
  }
  return input as Record<string, unknown>
}

export async function getLoginUiSettings() {
  const platform = await platformSettingsRepo.getOrCreatePlatformSettings()
  const ui = toPlainObject(platform.ui_settings)
  return {
    site_display_name: platform.site_display_name ?? 'i8now',
    login_left_image_url: (ui.login_left_image_url as string | null | undefined) ?? null,
    login_left_heading:
      (ui.login_left_heading as string | undefined) ?? 'Operations command centre',
    login_left_caption:
      (ui.login_left_caption as string | undefined) ??
      'Manage workers, employers, timesheets, and platform settings from one place.',
  }
}

/**
 * Step 1 of login: user asks for a code (same HTTP route as “send OTP”).
 * Creates or updates the OTP challenge row for this phone/email + device,
 * then (in real apps) the SMS/email provider sends the digits. See file
 * header for what “challenge” means.
 */
export async function requestOtp(body: RequestOtpBody): Promise<RequestOtpResult> {
  const env = loadEnv()
  const logger = getLogger()

  const platform = await platformSettingsRepo.getOrCreatePlatformSettings()
  if (body.email && !platform.login_email_enabled) {
    throw new AppError('AUTH_CHANNEL_DISABLED', 403, 'Email sign-in is disabled for this platform')
  }
  if (body.phone && !platform.login_phone_enabled) {
    throw new AppError('AUTH_CHANNEL_DISABLED', 403, 'Phone sign-in is disabled for this platform')
  }

  // One string that always means “this phone” or “this email” everywhere (DB + limits).
  const target_key = buildTargetKey(body.phone, body.email)
  // Sliding window: only events newer than this count toward “per hour” limits.
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000)

  // Check if the device has exceeded the rate limit
  const deviceCount = await otpRateRepo.countSince(`device:${body.device_id}`, hourAgo)
  if (deviceCount >= OTP_RATE_DEVICE_PER_HOUR) {
    throw new AppError('AUTH_RATE_LIMITED', 429, 'Too many OTP requests from this device')
  }

  // Check if the target (phone/email) has exceeded the rate limit
  const targetCount = await otpRateRepo.countSince(`target:${target_key}`, hourAgo)
  if (targetCount >= OTP_RATE_TARGET_PER_HOUR) {
    throw new AppError('AUTH_RATE_LIMITED', 429, 'Too many OTP requests for this number or email')
  }

  // Check if the target (phone/email) is banned
  const existingUser = body.phone
    ? await userRepo.findByPhone(body.phone)
    : await userRepo.findByEmail(body.email!.toLowerCase())
  if (existingUser && existingUser.deleted_at) {
    throw new AppError('AUTH_ACCOUNT_DELETED', 403, 'This account has been deactivated')
  }
  if (existingUser && existingUser.status === 'suspended') {
    throw new AppError('AUTH_ACCOUNT_SUSPENDED', 403, 'Account is suspended')
  }
  if (existingUser && existingUser.status === 'banned') {
    throw new AppError('AUTH_TARGET_BANNED', 403, 'This phone/email is banned from the platform')
  }

  // Generate a new 6-digit OTP
  const otp = newOtpDigits()
  // Hash the OTP for storage and comparison
  const otp_hash = hashOtp(otp, env.OTP_PEPPER)
  // OTP expires after 5 minutes
  const expires_at = new Date(Date.now() + OTP_TTL_SEC * 1000)

  // Save the challenge row so verifyOtp can check the code later (same target + device).
  await otpChallengeRepo.upsertChallenge(target_key, body.device_id, otp_hash, expires_at)
  // Remember this request for rate limiting (two separate counters: device + target).
  await otpRateRepo.recordEvent(`device:${body.device_id}`)
  await otpRateRepo.recordEvent(`target:${target_key}`)

  if (env.NODE_ENV === 'development') {
    logger.debug({ target_key, otp }, 'OTP issued (dev only)')
  }

  const masked_target = body.phone ? maskPhone(body.phone) : maskEmail(body.email!)

  return {
    otp_sent: true,
    expires_in: OTP_TTL_SEC,
    masked_target,
  }
}

// Verify OTP
type VerifyOtpResult =
  | {
      access_token: string
      refresh_token: string
      token_type: 'Bearer'
      expires_in: number
      user: {
        id: string
        role: string
        status: string
        is_new: boolean
        onboarding_step: number
      }
    }
  | {
      mfa_required: true
      mfa_token: string
      token_type: 'Bearer'
      expires_in: number
      user: {
        id: string
        role: string
        status: string
        is_new: boolean
        onboarding_step: number
      }
    }

function assertAccountAllowedToLogin(user: UserDoc): void {
  if (user.deleted_at) {
    throw new AppError('AUTH_ACCOUNT_DELETED', 403, 'This account has been deactivated')
  }
  if (user.status === 'suspended') {
    throw new AppError('AUTH_ACCOUNT_SUSPENDED', 403, 'Account is suspended')
  }
  if (user.status === 'banned') {
    throw new AppError('AUTH_ACCOUNT_BANNED', 403, 'Account is banned')
  }
}

async function issueLoginAfterVerifiedUser(user: UserDoc, is_new: boolean): Promise<VerifyOtpResult> {
  const env = loadEnv()
  const userId = String(user._id)
  const role = user.role as 'worker' | 'employer' | 'admin'

  const platform = await platformSettingsRepo.getOrCreatePlatformSettings()
  const hasTotp =
    platform.admin_totp_required &&
    role === 'admin' &&
    user.totp_enabled === true &&
    typeof user.totp_secret === 'string' &&
    user.totp_secret.length > 0

  if (hasTotp) {
    const mfa_token = signMfaToken(userId, env.JWT_ACCESS_SECRET, MFA_TOKEN_TTL_SEC)
    return {
      mfa_required: true,
      mfa_token,
      token_type: 'Bearer',
      expires_in: MFA_TOKEN_TTL_SEC,
      user: {
        id: userId,
        role,
        status: user.status,
        is_new,
        onboarding_step: user.onboarding_step ?? 0,
      },
    }
  }

  const refreshRaw = newRefreshTokenRaw()
  const refreshHash = hashToken(refreshRaw, env.JWT_REFRESH_SECRET)
  const refreshExpires = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)
  await refreshTokenRepo.createRefreshToken(userId, refreshHash, refreshExpires)

  const access_token = signAccessToken(userId, role, env.JWT_ACCESS_SECRET, ACCESS_TOKEN_TTL_SEC)

  return {
    access_token,
    refresh_token: refreshRaw,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_SEC,
    user: {
      id: userId,
      role,
      status: user.status,
      is_new,
      onboarding_step: user.onboarding_step ?? 0,
    },
  }
}

/**
 * Password sign-in (when enabled by an admin). Same token / admin-TOTP behaviour as OTP success.
 */
export async function loginWithPassword(body: LoginPasswordBody): Promise<VerifyOtpResult> {
  const emailNorm = body.email?.toLowerCase()
  const user = body.phone
    ? await userRepo.findByPhone(body.phone)
    : await userRepo.findByEmail(emailNorm!)

  if (!user || !user.password_login_enabled || !user.password_hash) {
    throw new AppError('AUTH_INVALID_CREDENTIALS', 401, 'Invalid email or password')
  }

  const ok = await verifyPassword(body.password, user.password_hash)
  if (!ok) {
    throw new AppError('AUTH_INVALID_CREDENTIALS', 401, 'Invalid email or password')
  }

  assertAccountAllowedToLogin(user)

  return issueLoginAfterVerifiedUser(user, false)
}

/**
 * Step 2 of login: user sends the 6-digit code from SMS/email.
 * Loads the challenge that requestOtp stored; if the row is missing we say
 * the OTP is no longer valid (same message whether it expired, was already
 * used, or never existed — we do not tell attackers which case it was).
 * On success: may create a user, then issue tokens. See file header for
 * what “challenge” means.
 */
export async function verifyOtp(body: VerifyOtpBody): Promise<VerifyOtpResult> {
  const env = loadEnv()
  const target_key = buildTargetKey(body.phone, body.email)
  const emailNorm = body.email?.toLowerCase()

  // Load the challenge row for this login target + device (created in requestOtp).
  const challenge = await otpChallengeRepo.findChallenge(target_key, body.device_id)

  if (!challenge) {
    // No row: treat as “not valid anymore” (expired, used, or never requested).
    throw new AppError('AUTH_OTP_EXPIRED', 400, 'OTP has expired — request a new one')
  }

  // Check if the OTP challenge is locked
  const now = new Date()
  if (challenge.locked_until && challenge.locked_until > now) {
    throw new AppError('AUTH_OTP_MAX_ATTEMPTS', 429, 'Too many failed attempts — try again later')
  }

  // Check if the OTP challenge has expired
  if (challenge.expires_at < now) {
    throw new AppError('AUTH_OTP_EXPIRED', 400, 'OTP has expired — request a new one')
  }

  const valid = verifyOtpHash(body.otp, env.OTP_PEPPER, challenge.otp_hash)
  if (!valid) {
    const updated = await otpChallengeRepo.incrementAttempts(challenge._id)
    if (!updated) {
      throw new AppError('AUTH_OTP_INVALID', 400, 'OTP code is incorrect')
    }
    if (updated.attempts >= OTP_MAX_ATTEMPTS) {
      const locked_until = new Date(Date.now() + OTP_LOCK_MINUTES * 60 * 1000)
      await otpChallengeRepo.lockChallenge(challenge._id, locked_until)
      throw new AppError('AUTH_OTP_MAX_ATTEMPTS', 429, 'Too many failed attempts — try again later')
    }
    throw new AppError('AUTH_OTP_INVALID', 400, 'OTP code is incorrect')
  }

  let user = body.phone
    ? await userRepo.findByPhone(body.phone)
    : await userRepo.findByEmail(emailNorm!)
  let is_new = false
  if (!user) {
    user = await userRepo.create({
      phone: body.phone ?? null,
      email: emailNorm ?? null,
      role: 'worker',
    })
    is_new = true
  }

  user = await promoteUserIfBootstrapEmail(user, emailNorm)

  assertAccountAllowedToLogin(user)

  await otpChallengeRepo.deleteByTargetAndDevice(target_key, body.device_id)

  return issueLoginAfterVerifiedUser(user, is_new)
}

type VerifyAdminTotpResult = {
  access_token: string
  refresh_token: string
  token_type: 'Bearer'
  expires_in: number
  user: {
    id: string
    role: string
    status: string
    is_new: boolean
    onboarding_step: number
  }
}

/**
 * Second step for admins with TOTP enabled: completes login after email OTP + `mfa_token`.
 */
export async function verifyAdminTotp(body: VerifyAdminTotpBody): Promise<VerifyAdminTotpResult> {
  const env = loadEnv()
  let userId: string
  try {
    const payload = verifyMfaToken(body.mfa_token, env.JWT_ACCESS_SECRET)
    userId = payload.sub
  } catch {
    throw new AppError('AUTH_MFA_INVALID', 401, 'MFA token invalid or expired — start sign-in again')
  }

  const user = await userRepo.findById(userId)
  if (!user || user.role !== 'admin' || user.deleted_at) {
    throw new AppError('AUTH_MFA_INVALID', 401, 'Invalid MFA session')
  }
  if (!user.totp_enabled || !user.totp_secret) {
    throw new AppError('AUTH_TOTP_NOT_CONFIGURED', 400, 'Authenticator is not enabled for this account')
  }

  const check = await verifyTotp({ secret: user.totp_secret, token: body.totp })
  if (!check.valid) {
    throw new AppError('AUTH_TOTP_INVALID', 400, 'Invalid authenticator code')
  }

  assertAccountAllowedToLogin(user)

  const refreshRaw = newRefreshTokenRaw()
  const refreshHash = hashToken(refreshRaw, env.JWT_REFRESH_SECRET)
  const refreshExpires = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)
  const uid = String(user._id)
  const role = user.role as 'worker' | 'employer' | 'admin'
  await refreshTokenRepo.createRefreshToken(uid, refreshHash, refreshExpires)

  const access_token = signAccessToken(uid, role, env.JWT_ACCESS_SECRET, ACCESS_TOKEN_TTL_SEC)

  return {
    access_token,
    refresh_token: refreshRaw,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_SEC,
    user: {
      id: uid,
      role,
      status: user.status,
      is_new: false,
      onboarding_step: user.onboarding_step ?? 0,
    },
  }
}

type RefreshResult = {
  access_token: string
  expires_in: number
}

/**
 * Called when the app’s short JWT expired but the user still has a refresh token.
 * Returns a new access JWT only (refresh row stays valid until it expires).
 */
export async function refreshAccessToken(refresh_token: string): Promise<RefreshResult> {
  const env = loadEnv()
  const token_hash = hashToken(refresh_token, env.JWT_REFRESH_SECRET)
  const row = await refreshTokenRepo.findByTokenHash(token_hash)
  if (!row) {
    throw new AppError('AUTH_REFRESH_INVALID', 401, 'Refresh token is invalid or does not exist')
  }

  if (row.expires_at < new Date()) {
    await refreshTokenRepo.deleteByTokenHash(token_hash)
    throw new AppError('AUTH_REFRESH_EXPIRED', 401, 'Refresh token has expired — log in again')
  }

  const user = await userRepo.findById(row.user_id)
  if (!user) {
    throw new AppError('AUTH_REFRESH_INVALID', 401, 'Refresh token is invalid or does not exist')
  }
  if (user.deleted_at) {
    await refreshTokenRepo.deleteByTokenHash(token_hash)
    throw new AppError('AUTH_ACCOUNT_DELETED', 403, 'This account has been deactivated')
  }
  if (user.status === 'suspended') {
    await refreshTokenRepo.deleteByTokenHash(token_hash)
    throw new AppError('AUTH_ACCOUNT_SUSPENDED', 403, 'Account is suspended')
  }

  const access_token = signAccessToken(
    String(user._id),
    user.role as 'worker' | 'employer' | 'admin',
    env.JWT_ACCESS_SECRET,
    ACCESS_TOKEN_TTL_SEC,
  )

  return {
    access_token,
    expires_in: ACCESS_TOKEN_TTL_SEC,
  }
}
