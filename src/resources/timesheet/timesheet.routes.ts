/* ═══════════════════════════════════════════════════════════════════════════
 *  timesheet.routes — /api/v1/timesheets (worker only)
 *
 *  Endpoints:
 *    POST …/:applicationId/clock-in  — JSON body: worker’s lat/lng at clock-in
 *                                      (see timesheet.validator / timesheet.service).
 *    POST …/:applicationId/clock-out — optional worker lat/lng when leaving.
 *    GET  …/:id                      — timesheet document id (`ts_…`).
 *
 *  Order: literal segments `clock-in` and `clock-out` are registered before
 *  GET /:id so they are not mistaken for a timesheet id.
 *
 *  All routes: Bearer token + role worker.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { Router } from 'express'
import * as timesheetController from './timesheet.controller.js'
import { requireAuth, requireRole } from '../auth/auth.middleware.js'
import { asyncHandler } from '../../utils/asyncHandler.js'
const router = Router()

router.post(
  '/:applicationId/clock-in',
  requireAuth,
  requireRole('worker'),
  asyncHandler(timesheetController.clockIn),
)
router.post(
  '/:applicationId/clock-out',
  requireAuth,
  requireRole('worker'),
  asyncHandler(timesheetController.clockOut),
)
router.get(
  '/:id',
  requireAuth,
  requireRole('worker'),
  asyncHandler(timesheetController.getTimesheet),
)

export { router as timesheetRouter }
