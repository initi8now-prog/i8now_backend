/* ═══════════════════════════════════════════════════════════════════════════
 *  timesheet.controller — HTTP for worker timesheet clock-in/out and GET detail
 *
 *  Thin layer: Zod parse → timesheet.service → { status, message, data }.
 *
 *  Location fields (clock-in / optional clock-out body):
 *    • Request body `lat` / `lng` are always the WORKER’s position (device GPS
 *      at the moment of the request), not the shift venue.
 *    • The venue is stored on the Shift (`location_lat` / `location_lng`); the
 *      service compares worker vs venue for geofence checks. See timesheet.service.
 *    • `accuracy_m` (optional on clock-in) is GPS horizontal accuracy in metres;
 *      stored for audit only; geofence math uses lat/lng only.
 * ═══════════════════════════════════════════════════════════════════════════ */

import type { Request, Response } from 'express'
import { success } from '../../utils/apiResponse.js'
import * as timesheetService from './timesheet.service.js'
import { clockInBodySchema, clockOutBodySchema } from './timesheet.validator.js'

/** POST /api/v1/timesheets/:applicationId/clock-in — body: worker lat/lng (+ optional accuracy_m). */
export async function clockIn(req: Request, res: Response): Promise<void> {
  const body = clockInBodySchema.parse(req.body)
  const userId = req.user!.id
  const data = await timesheetService.clockIn(userId, req.params.applicationId, body)
  res.status(201).json(success(data, 'Clocked in'))
}

/** POST /api/v1/timesheets/:applicationId/clock-out — optional worker lat/lng (both or neither). */
export async function clockOut(req: Request, res: Response): Promise<void> {
  const body = clockOutBodySchema.parse(req.body ?? {})
  const userId = req.user!.id
  const data = await timesheetService.clockOut(userId, req.params.applicationId, body)
  res.status(200).json(success(data, 'Clocked out'))
}

/** GET /api/v1/timesheets/:id — timesheet id (`ts_…`), not application id. */
export async function getTimesheet(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id
  const data = await timesheetService.getTimesheetForWorker(userId, req.params.id)
  res.status(200).json(success(data, 'OK'))
}
