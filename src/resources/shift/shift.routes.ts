/* ═══════════════════════════════════════════════════════════════════════════
 *  shift.routes — /api/v1/shifts (discovery + apply)
 *
 *  POST /:id/apply is registered before GET /:id so "apply" is not captured as id.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { Router } from 'express'
import * as shiftController from './shift.controller.js'
import { optionalAuth, requireAuth, requireRole } from '../auth/auth.middleware.js'
import { asyncHandler } from '../../utils/asyncHandler.js'

const router = Router()

router.get('/', optionalAuth, asyncHandler(shiftController.listShifts))
router.post(
  '/:id/apply',
  requireAuth,
  requireRole('worker'),
  asyncHandler(shiftController.apply),
)
router.get('/:id', optionalAuth, asyncHandler(shiftController.getShiftDetail))

export { router as shiftRouter }
