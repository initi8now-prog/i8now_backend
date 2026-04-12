/* ═══════════════════════════════════════════════════════════════════════════
 *  auth.controller — HTTP layer for /auth/* (thin)
 *
 *  Each function:
 *    1) Parses + validates the JSON body with Zod (throws → global error handler)
 *    2) Calls the matching service function
 *    3) Wraps the result in the standard { status, message, data } success shape
 *
 *  No business rules here — only “wire request → service → response”.
 * ═══════════════════════════════════════════════════════════════════════════ */

import type { Request, Response } from 'express'
import * as authService from './auth.service.js'
import { success } from '../../utils/apiResponse.js'
import { refreshTokenSchema, requestOtpSchema, verifyOtpSchema } from './auth.validator.js'

/** POST /api/v1/auth/request-otp */
export async function requestOtp(req: Request, res: Response): Promise<void> {
  const body = requestOtpSchema.parse(req.body)
  const data = await authService.requestOtp(body)
  res.status(200).json(success(data, 'OTP sent successfully'))
}

/** POST /api/v1/auth/verify-otp */
export async function verifyOtp(req: Request, res: Response): Promise<void> {
  const body = verifyOtpSchema.parse(req.body)
  const data = await authService.verifyOtp(body)
  res.status(200).json(success(data, 'Login successful'))
}

/** POST /api/v1/auth/refresh-token */
export async function refreshToken(req: Request, res: Response): Promise<void> {
  const body = refreshTokenSchema.parse(req.body)
  const data = await authService.refreshAccessToken(body.refresh_token)
  res.status(200).json(success(data, 'Token refreshed'))
}
