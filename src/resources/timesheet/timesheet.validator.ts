/* ═══════════════════════════════════════════════════════════════════════════
 *  timesheet.validator — Zod schemas for clock-in / clock-out JSON bodies
 *
 *  ── Clock-in (required) ────────────────────────────────────────────────────
 *  lat, lng
 *    The WORKER’s current position (WGS84), from the device at the instant the
 *    worker taps “Clock in”. This is not the shift venue. The venue lives on
 *    the Shift model (`location_lat` / `location_lng`); the service compares
 *    distance(worker ↔ venue) to `geofence_radius_m`.
 *
 *  accuracy_m (optional)
 *    Horizontal GPS accuracy in metres (same idea as Geolocation API
 *    `coords.accuracy` / native “accuracy”). Tells how fuzzy the point is;
 *    we persist it for audit. Geofence pass/fail uses lat/lng only.
 *
 *  ── Clock-out (optional) ────────────────────────────────────────────────────
 *  lat, lng together or omitted — worker position when clocking out, if you
 *  want to record it; not used for geofence in the current service logic.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { z } from 'zod'

export const clockInBodySchema = z.object({
  /** Worker latitude at clock-in (not the venue). */
  lat: z.number().min(-90).max(90),
  /** Worker longitude at clock-in (not the venue). */
  lng: z.number().min(-180).max(180),
  /** Optional GPS horizontal accuracy in metres — audit only. */
  accuracy_m: z.number().min(0).optional(),
})

export type ClockInBody = z.infer<typeof clockInBodySchema>

export const clockOutBodySchema = z
  .object({
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  })
  .refine(
    (d) =>
      (d.lat === undefined && d.lng === undefined) ||
      (d.lat !== undefined && d.lng !== undefined),
    { message: 'Provide both lat and lng, or omit both', path: ['lat'] },
  )

export type ClockOutBody = z.infer<typeof clockOutBodySchema>
