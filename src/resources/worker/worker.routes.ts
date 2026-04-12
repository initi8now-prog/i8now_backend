/* ═══════════════════════════════════════════════════════════════════════════
 *  worker.routes — /api/v1/workers/* URLs for the worker mobile/web app
 *
 *  All routes need a valid access token and the worker role. Order: auth → role → handler.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { Router } from 'express'
import * as workerController from './worker.controller.js'
import { requireAuth, requireRole } from '../auth/auth.middleware.js'
import { asyncHandler } from '../../utils/asyncHandler.js'

const router = Router()

router.post(
  '/profile',
  requireAuth,
  requireRole('worker'),
  asyncHandler(workerController.createProfile),
)

router.put(
  '/profile',
  requireAuth,
  requireRole('worker'),
  asyncHandler(workerController.updateProfile),
)

router.get('/me', requireAuth, requireRole('worker'), asyncHandler(workerController.getMe))

router.put(
  '/categories',
  requireAuth,
  requireRole('worker'),
  asyncHandler(workerController.setCategories),
)

router.post(
  '/qualifications',
  requireAuth,
  requireRole('worker'),
  asyncHandler(workerController.addQualification),
)

router.post(
  '/documents',
  requireAuth,
  requireRole('worker'),
  asyncHandler(workerController.addDocument),
)

export { router as workerRouter }
