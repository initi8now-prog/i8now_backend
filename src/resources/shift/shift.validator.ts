/* ═══════════════════════════════════════════════════════════════════════════
 *  shift.validator — Zod for GET /shifts query string + applications list query
 *
 *  Query params arrive as strings; we coerce numbers where needed.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { z } from 'zod'

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')

export const shiftListQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius_km: z.coerce.number().min(1).max(200).optional(),
  category_ids: z.string().optional(),
  date: isoDay.optional(),
  date_from: isoDay.optional(),
  date_to: isoDay.optional(),
  min_rate: z.coerce.number().min(0).optional(),
  max_rate: z.coerce.number().min(0).optional(),
  sort: z.enum(['distance', 'rate_high', 'date_soon']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
})

export type ShiftListQuery = z.infer<typeof shiftListQuerySchema>

export const myApplicationsQuerySchema = z.object({
  status: z.enum(['applied', 'confirmed', 'rejected', 'completed', 'cancelled']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
})

export type MyApplicationsQuery = z.infer<typeof myApplicationsQuerySchema>
