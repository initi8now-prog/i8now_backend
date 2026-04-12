/* ═══════════════════════════════════════════════════════════════════════════
 *  auth.validator — Zod schemas = “shape + rules” for incoming JSON
 *
 *  • Phone must look like E.164 (+country…).
 *  • Exactly one of phone OR email (not both, not neither).
 *  • OTP is exactly six digits; device_id is required where the API says so.
 *
 *  Types exported with `z.infer` are reused in services — single source of truth.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { z } from 'zod'

const e164 = z.string().regex(/^\+[1-9]\d{1,14}$/, 'Invalid E.164 phone')

export const requestOtpSchema = z
  .object({
    phone: e164.optional(),
    email: z.string().email().optional(),
    device_id: z.string().min(1, 'device_id is required'),
  })
  .superRefine((data, ctx) => {
    const hasPhone = data.phone !== undefined
    const hasEmail = data.email !== undefined
    if (hasPhone === hasEmail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide exactly one of phone or email',
        path: ['phone'],
      })
    }
  })

export type RequestOtpBody = z.infer<typeof requestOtpSchema>

export const verifyOtpSchema = z
  .object({
    phone: e164.optional(),
    email: z.string().email().optional(),
    otp: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits'),
    device_id: z.string().min(1, 'device_id is required'),
  })
  .superRefine((data, ctx) => {
    const hasPhone = data.phone !== undefined
    const hasEmail = data.email !== undefined
    if (hasPhone === hasEmail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide exactly one of phone or email',
        path: ['phone'],
      })
    }
  })

export type VerifyOtpBody = z.infer<typeof verifyOtpSchema>

export const refreshTokenSchema = z.object({
  refresh_token: z.string().min(1, 'refresh_token is required'),
})

export type RefreshTokenBody = z.infer<typeof refreshTokenSchema>
