/* ═══════════════════════════════════════════════════════════════════════════
 *  admin.validator — Zod schemas for admin query strings and JSON bodies
 *
 *  Single source of truth for request shapes; services import inferred types.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { z } from 'zod'

/** Shared `page` / `limit` for list endpoints (max 100 rows per page). */
export const adminPaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

/** GET /admin/workers — optional KYC filter and case-insensitive name `search`. */
export const adminWorkerListQuerySchema = adminPaginationQuerySchema.extend({
  kyc_status: z.enum(['unverified', 'pending', 'approved', 'rejected']).optional(),
  search: z.string().optional(),
})

export type AdminWorkerListQuery = z.infer<typeof adminWorkerListQuerySchema>
const adminE164 = z.string().regex(/^\+[1-9]\d{1,14}$/, 'Invalid E.164 phone')

/** POST /admin/workers — create worker login + worker profile in one action. */
export const createAdminWorkerSchema = z
  .object({
    phone: adminE164.optional(),
    email: z.string().email().optional(),
    full_name: z.string().min(2).max(100),
    dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
    city: z.string().min(2).max(100),
    location_lat: z.number().min(-90).max(90),
    location_lng: z.number().min(-180).max(180),
    radius_km: z.number().min(1).max(100).default(10),
    bio: z.string().max(500).optional(),
    avatar_url: z.string().url().optional(),
    status: z.enum(['pending', 'active', 'suspended', 'banned']).default('active'),
    password: z.string().min(8).max(200).optional(),
    password_login_enabled: z.boolean().optional(),
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
    if (data.password_login_enabled === true && !data.password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide a password when enabling password sign-in',
        path: ['password'],
      })
    }
  })

export type CreateAdminWorkerBody = z.infer<typeof createAdminWorkerSchema>

/** PATCH /admin/workers/:id/profile — admin updates worker profile + linked login contact/status. */
export const patchAdminWorkerProfileSchema = z
  .object({
    full_name: z.string().min(2).max(100).optional(),
    dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional(),
    city: z.string().min(2).max(100).optional(),
    location_lat: z.number().min(-90).max(90).optional(),
    location_lng: z.number().min(-180).max(180).optional(),
    radius_km: z.number().min(1).max(100).optional(),
    bio: z.string().max(500).nullable().optional(),
    avatar_url: z.string().url().nullable().optional(),
    email: z.union([z.string().email(), z.literal('')]).optional(),
    phone: z.union([adminE164, z.literal('')]).optional(),
    status: z.enum(['pending', 'active', 'suspended', 'banned']).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Provide at least one field' })

export type PatchAdminWorkerProfileBody = z.infer<typeof patchAdminWorkerProfileSchema>

/** POST /admin/workers/:id/rating — admin adds stars toward worker profile average. */
export const adminRateWorkerSchema = z.object({
  stars: z.number().int().min(1).max(5),
})

export type AdminRateWorkerBody = z.infer<typeof adminRateWorkerSchema>

export const adminRateEmployerSchema = z.object({
  stars: z.number().int().min(1).max(5),
})

export type AdminRateEmployerBody = z.infer<typeof adminRateEmployerSchema>

/** POST /admin/workers/:id/documents — admin uploads KYC proof URL for worker. */
export const adminAddWorkerDocumentSchema = z.object({
  type: z.enum(['govt_id', 'right_to_work', 'background_check']),
  file_url: z.string().url('file_url must be a valid URL'),
})

export type AdminAddWorkerDocumentBody = z.infer<typeof adminAddWorkerDocumentSchema>

/** POST /admin/workers/:id/uploads/presign — return temporary S3 PUT URL. */
export const adminPresignWorkerUploadSchema = z.object({
  kind: z.enum(['worker_document', 'worker_avatar']),
  filename: z.string().min(1).max(180),
  content_type: z.string().min(3).max(120),
})

export type AdminPresignWorkerUploadBody = z.infer<typeof adminPresignWorkerUploadSchema>

export const adminDeleteWorkerUploadSchema = z.object({
  file_url: z.string().url('file_url must be a valid URL'),
})

export type AdminDeleteWorkerUploadBody = z.infer<typeof adminDeleteWorkerUploadSchema>

export const adminReviewWorkerDocumentSchema = z.object({
  status: z.enum(['approved', 'rejected', 'pending']),
})

export type AdminReviewWorkerDocumentBody = z.infer<typeof adminReviewWorkerDocumentSchema>

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')

export const adminAddWorkerQualificationSchema = z.object({
  type: z.enum(['education', 'work_experience', 'certification']),
  title: z.string().min(1).max(200),
  institution: z.string().min(1).max(200),
  from_date: isoDate,
  to_date: z.union([isoDate, z.null()]).optional(),
  description: z.string().max(500).optional(),
})

export type AdminAddWorkerQualificationBody = z.infer<typeof adminAddWorkerQualificationSchema>

/** PATCH /admin/workers/:id/kyc — new status plus optional note stored on profile. */
export const patchWorkerKycSchema = z.object({
  kyc_status: z.enum(['approved', 'rejected', 'pending', 'unverified']),
  note: z.string().max(500).optional(),
})

export type PatchWorkerKycBody = z.infer<typeof patchWorkerKycSchema>

/** PATCH /admin/employers/:id/verification — platform verification flag. */
export const patchEmployerVerificationSchema = z.object({
  verified: z.boolean(),
})

export type PatchEmployerVerificationBody = z.infer<typeof patchEmployerVerificationSchema>

export const patchAdminEmployerProfileSchema = z
  .object({
    company_name: z.string().min(2).max(160).optional(),
    logo_url: z.string().url().nullable().optional(),
    logo_fit: z.enum(['contain', 'cover']).optional(),
    verified: z.boolean().optional(),
    industry: z.string().min(2).max(80).nullable().optional(),
    company_size: z.string().min(1).max(40).nullable().optional(),
    website_url: z.string().url().nullable().optional(),
    contact_name: z.string().min(2).max(120).nullable().optional(),
    contact_email: z.string().email().nullable().optional(),
    contact_phone: z.union([adminE164, z.literal('')]).nullable().optional(),
    city: z.string().min(2).max(100).nullable().optional(),
    address_line1: z.string().min(3).max(180).nullable().optional(),
    address_line2: z.string().max(180).nullable().optional(),
    notes: z.string().max(1200).nullable().optional(),
    status: z.enum(['active', 'inactive']).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Provide at least one field' })

export type PatchAdminEmployerProfileBody = z.infer<typeof patchAdminEmployerProfileSchema>

export const createAdminEmployerSchema = z.object({
  company_name: z.string().min(2).max(160),
  logo_url: z.string().url().nullable().optional(),
  logo_fit: z.enum(['contain', 'cover']).optional(),
  verified: z.boolean().optional(),
  industry: z.string().min(2).max(80).nullable().optional(),
  company_size: z.string().min(1).max(40).nullable().optional(),
  website_url: z.string().url().nullable().optional(),
  contact_name: z.string().min(2).max(120).nullable().optional(),
  contact_email: z.string().email().nullable().optional(),
  contact_phone: z.union([adminE164, z.literal('')]).nullable().optional(),
  city: z.string().min(2).max(100).nullable().optional(),
  address_line1: z.string().min(3).max(180).nullable().optional(),
  address_line2: z.string().max(180).nullable().optional(),
  notes: z.string().max(1200).nullable().optional(),
  status: z.enum(['active', 'inactive']).optional(),
})

export type CreateAdminEmployerBody = z.infer<typeof createAdminEmployerSchema>

export const deleteAdminEmployerSchema = z.object({
  confirmation: z.string().min(2).max(160),
})

export type DeleteAdminEmployerBody = z.infer<typeof deleteAdminEmployerSchema>

export const adminDeleteEmployerUploadSchema = z.object({
  file_url: z.string().url('file_url must be a valid URL'),
})

export type AdminDeleteEmployerUploadBody = z.infer<typeof adminDeleteEmployerUploadSchema>

/** POST /admin/timesheets/:id/rate-worker — employer-side stars toward the worker (admin until employer app exists). */
export const timesheetRateWorkerSchema = z.object({
  stars: z.number().int().min(1).max(5),
})

export type TimesheetRateWorkerBody = z.infer<typeof timesheetRateWorkerSchema>

/** GET /admin/employers — optional filter by platform verification. */
export const adminEmployerListQuerySchema = adminPaginationQuerySchema.extend({
  search: z.string().optional(),
  verified: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
})

export type AdminEmployerListQuery = z.infer<typeof adminEmployerListQuerySchema>

export const adminShiftListQuerySchema = adminPaginationQuerySchema.extend({
  status: z.enum(['open', 'filled', 'cancelled']).optional(),
  employer_id: z.string().min(1).optional(),
  search: z.string().optional(),
})

export type AdminShiftListQuery = z.infer<typeof adminShiftListQuerySchema>

const shiftTimeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/
const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/

export const createAdminShiftSchema = z.object({
  employer_id: z.string().min(1),
  category_id: z.string().min(1),
  title: z.string().min(2).max(160),
  description: z.string().max(2000).optional(),
  date: z.string().regex(isoDateRegex, 'Use YYYY-MM-DD'),
  start_time: z.string().regex(shiftTimeRegex, 'Use HH:mm'),
  end_time: z.string().regex(shiftTimeRegex, 'Use HH:mm'),
  hourly_rate: z.number().positive(),
  currency: z.string().min(3).max(6).default('INR'),
  slots_total: z.number().int().min(1).max(500),
  address: z.string().min(3).max(250),
  location_lat: z.number().min(-90).max(90),
  location_lng: z.number().min(-180).max(180),
  geofence_radius_m: z.number().int().min(50).max(2000).default(200),
  status: z.enum(['open', 'filled', 'cancelled']).optional(),
})

export type CreateAdminShiftBody = z.infer<typeof createAdminShiftSchema>

export const patchAdminShiftSchema = z
  .object({
    employer_id: z.string().min(1).optional(),
    category_id: z.string().min(1).optional(),
    title: z.string().min(2).max(160).optional(),
    description: z.string().max(2000).nullable().optional(),
    date: z.string().regex(isoDateRegex, 'Use YYYY-MM-DD').optional(),
    start_time: z.string().regex(shiftTimeRegex, 'Use HH:mm').optional(),
    end_time: z.string().regex(shiftTimeRegex, 'Use HH:mm').optional(),
    hourly_rate: z.number().positive().optional(),
    currency: z.string().min(3).max(6).optional(),
    slots_total: z.number().int().min(1).max(500).optional(),
    slots_filled: z.number().int().min(0).max(500).optional(),
    address: z.string().min(3).max(250).optional(),
    location_lat: z.number().min(-90).max(90).optional(),
    location_lng: z.number().min(-180).max(180).optional(),
    geofence_radius_m: z.number().int().min(50).max(2000).optional(),
    status: z.enum(['open', 'filled', 'cancelled']).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Provide at least one field' })

export type PatchAdminShiftBody = z.infer<typeof patchAdminShiftSchema>

/** GET /admin/timesheets — optional queue filters. */
export const adminTimesheetListQuerySchema = adminPaginationQuerySchema.extend({
  status: z.enum(['open', 'pending', 'approved', 'disputed', 'paid']).optional(),
  worker_profile_id: z.string().min(1).optional(),
  shift_id: z.string().min(1).optional(),
  search: z.string().optional(),
})

export type AdminTimesheetListQuery = z.infer<typeof adminTimesheetListQuerySchema>

const e164 = z.string().regex(/^\+[1-9]\d{1,14}$/, 'Invalid E.164 phone')

/** GET /admin/users — directory filters and optional inclusion of soft-deleted rows. */
export const adminUserListQuerySchema = adminPaginationQuerySchema.extend({
  role: z.enum(['worker', 'employer', 'admin']).optional(),
  status: z.enum(['pending', 'active', 'suspended', 'banned']).optional(),
  search: z.string().optional(),
  include_deleted: z.coerce.boolean().optional(),
})

export type AdminUserListQuery = z.infer<typeof adminUserListQuerySchema>

/** POST /admin/users — provision user with exactly one login identifier. */
export const createAdminUserSchema = z
  .object({
    phone: e164.optional(),
    email: z.string().email().optional(),
    role: z.enum(['worker', 'employer', 'admin']),
    status: z.enum(['pending', 'active', 'suspended', 'banned']).default('active'),
    onboarding_step: z.coerce.number().int().min(0).max(20).optional(),
    /** Optional initial password; hashed server-side. */
    password: z.string().min(8).max(200).optional(),
    /** Allow password sign-in (default true when `password` is set). */
    password_login_enabled: z.boolean().optional(),
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
    if (data.password_login_enabled === true && !data.password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide a password when enabling password sign-in',
        path: ['password'],
      })
    }
  })

export type CreateAdminUserBody = z.infer<typeof createAdminUserSchema>

/** PATCH /admin/users/:id — role, status, onboarding, and optional email / phone (E.164). */
export const patchAdminUserSchema = z
  .object({
    role: z.enum(['worker', 'employer', 'admin']).optional(),
    status: z.enum(['pending', 'active', 'suspended', 'banned']).optional(),
    onboarding_step: z.coerce.number().int().min(0).max(20).optional(),
    /** Empty string clears the field if the other login method remains set. */
    email: z.union([z.string().email(), z.literal('')]).optional(),
    phone: z.union([e164, z.literal('')]).optional(),
    password: z.string().min(8).max(200).optional(),
    password_login_enabled: z.boolean().optional(),
    /** Removes stored password hash and disables password sign-in. */
    clear_password: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Provide at least one field' })
  .superRefine((d, ctx) => {
    if (d.clear_password === true && d.password !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Cannot set and clear password in the same request',
        path: ['password'],
      })
    }
  })

export type PatchAdminUserBody = z.infer<typeof patchAdminUserSchema>

/** POST /admin/me/totp/confirm — 6-digit code from authenticator after `/me/totp/setup`. */
export const adminTotpConfirmSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
})

export type AdminTotpConfirmBody = z.infer<typeof adminTotpConfirmSchema>

/** PATCH /admin/platform-settings — toggles for login channels and admin TOTP policy. */
export const patchPlatformSettingsSchema = z
  .object({
    login_email_enabled: z.boolean().optional(),
    login_phone_enabled: z.boolean().optional(),
    admin_totp_required: z.boolean().optional(),
    site_display_name: z.string().min(1).max(80).optional(),
    ui_settings: z
      .object({
        site_name: z.string().min(1).max(80).optional(),
        site_subtitle: z.string().max(80).optional(),
        logo_data_url: z.string().max(8_000_000).nullable().optional(),
        login_left_image_url: z.string().max(8_000_000).nullable().optional(),
        login_left_heading: z.string().min(1).max(120).optional(),
        login_left_caption: z.string().min(1).max(300).optional(),
        theme: z.enum(['light', 'dark', 'system']).optional(),
        accent: z.enum(['zinc', 'blue', 'violet', 'green', 'rose', 'amber', 'orange', 'cyan']).optional(),
        radius: z.enum(['none', 'sm', 'md', 'lg', 'xl']).optional(),
        font_family: z.enum(['geist', 'inter', 'dm-sans', 'system', 'mono']).optional(),
        font_size: z.enum(['sm', 'md', 'lg']).optional(),
        letter_spacing: z.enum(['tight', 'normal', 'wide']).optional(),
        nav_items: z
          .array(
            z.object({
              id: z.enum(['overview', 'users', 'workers', 'employers', 'shifts', 'timesheets', 'applications']),
              visible: z.boolean(),
            }),
          )
          .min(1)
          .optional(),
      })
      .optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Provide at least one field' })

export type PatchPlatformSettingsBody = z.infer<typeof patchPlatformSettingsSchema>

/** PATCH /admin/me/account — self-service contact + password update. */
export const patchAdminMeAccountSchema = z
  .object({
    email: z.union([z.string().email(), z.literal('')]).optional(),
    phone: z.union([adminE164, z.literal('')]).optional(),
    password: z.string().min(8).max(200).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Provide at least one field' })

export type PatchAdminMeAccountBody = z.infer<typeof patchAdminMeAccountSchema>
