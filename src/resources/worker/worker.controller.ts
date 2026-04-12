/* ═══════════════════════════════════════════════════════════════════════════
 *  worker.controller — HTTP layer for /workers/* (thin)
 *
 *  Parse body with Zod → call worker.service → return standard success JSON.
 *  No DB calls; req.user is set by requireAuth before these run.
 * ═══════════════════════════════════════════════════════════════════════════ */

import type { Request, Response } from 'express'
import * as workerService from './worker.service.js'
import { success } from '../../utils/apiResponse.js'
import {
  createWorkerProfileSchema,
  updateWorkerProfileSchema,
} from './worker.validator.js'

/** POST /api/v1/workers/profile — first-time profile + location (onboarding steps 2–3). */
export async function createProfile(req: Request, res: Response): Promise<void> {
  const body = createWorkerProfileSchema.parse(req.body)
  const userId = req.user!.id
  const data = await workerService.createProfile(userId, body)
  res.status(201).json(success(data, 'Profile created'))
}

/** PUT /api/v1/workers/profile — change any allowed fields on the existing profile. */
export async function updateProfile(req: Request, res: Response): Promise<void> {
  const body = updateWorkerProfileSchema.parse(req.body)
  const userId = req.user!.id
  const data = await workerService.updateProfile(userId, body)
  res.status(200).json(success(data, 'Profile updated'))
}

/** GET /api/v1/workers/me — full worker card for the logged-in worker. */
export async function getMe(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id
  const data = await workerService.getMyProfile(userId)
  res.status(200).json(success(data, 'OK'))
}
