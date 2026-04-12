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
    payout_account_holder: z.string().max(200).nullable().optional(),
    payout_masked_account: z.string().max(80).nullable().optional(),
    payout_upi_id: z.string().max(120).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  })

export type UpdateWorkerProfileBody = z.infer<typeof updateWorkerProfileSchema>

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')

export const setWorkerCategoriesSchema = z.object({
  category_ids: z.array(z.string().min(1)).min(1, 'At least one category must be selected').max(10),
})

export type SetWorkerCategoriesBody = z.infer<typeof setWorkerCategoriesSchema>

export const addWorkerQualificationSchema = z.object({
  type: z.enum(['education', 'work_experience', 'certification']),
  title: z.string().min(1).max(200),
  institution: z.string().min(1).max(200),
  from_date: isoDate,
  to_date: z.union([isoDate, z.null()]).optional(),
  description: z.string().max(500).optional(),
})

export type AddWorkerQualificationBody = z.infer<typeof addWorkerQualificationSchema>

export const addWorkerDocumentSchema = z.object({
  type: z.enum(['govt_id', 'right_to_work', 'background_check']),
  file_url: z.string().url('file_url must be a valid URL'),
})

export type AddWorkerDocumentBody = z.infer<typeof addWorkerDocumentSchema>
