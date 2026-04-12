/* ═══════════════════════════════════════════════════════════════════════════
 *  worker.validator — Zod schemas for POST/PUT /workers/profile
 *
 *  Request body shapes are defined once here; services import inferred types.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { z } from 'zod'
import { parseDobString } from './workerProfileRules.js'

export const createWorkerProfileSchema = z
  .object({
    full_name: z.string().min(2).max(100),
    dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
    avatar_url: z.string().url().optional(),
    bio: z.string().max(500).optional(),
    location_lat: z.number().min(-90).max(90),
    location_lng: z.number().min(-180).max(180),
    city: z.string().min(2).max(100),
    radius_km: z.number().min(1).max(100).default(10),
  })
  .superRefine((data, ctx) => {
    const dobDate = parseDobString(data.dob)
    if (Number.isNaN(dobDate.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid date of birth',
        path: ['dob'],
      })
    }
  })

export type CreateWorkerProfileBody = z.infer<typeof createWorkerProfileSchema>

export const updateWorkerProfileSchema = z
  .object({
    full_name: z.string().min(2).max(100).optional(),
    avatar_url: z.string().url().nullable().optional(),
    bio: z.string().max(500).nullable().optional(),
    location_lat: z.number().min(-90).max(90).optional(),
    location_lng: z.number().min(-180).max(180).optional(),
    city: z.string().min(2).max(100).optional(),
    radius_km: z.number().min(1).max(100).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  })

export type UpdateWorkerProfileBody = z.infer<typeof updateWorkerProfileSchema>
