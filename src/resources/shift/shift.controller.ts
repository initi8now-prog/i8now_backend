/* ═══════════════════════════════════════════════════════════════════════════
 *  shift.controller — HTTP for /shifts (list, detail, apply)
 *
 *  Validates query/body with Zod → shift.service → success or paginated JSON.
 * ═══════════════════════════════════════════════════════════════════════════ */

import type { Request, Response } from 'express'
import { paginated, success } from '../../utils/apiResponse.js'
import * as shiftService from './shift.service.js'
import { shiftListQuerySchema } from './shift.validator.js'

/** GET /api/v1/shifts — discover open shifts (optional Bearer for `applied`). */
export async function listShifts(req: Request, res: Response): Promise<void> {
  const q = shiftListQuerySchema.parse(req.query)
  const workerUid = req.user?.role === 'worker' ? req.user.id : null
  const result = await shiftService.listShifts(q, workerUid)
  res
    .status(200)
    .json(paginated({ shifts: result.shifts }, result.total, result.page, result.limit, 'OK'))
}

/** GET /api/v1/shifts/:id — full shift card + optional application snippet. */
export async function getShiftDetail(req: Request, res: Response): Promise<void> {
  const workerUid = req.user?.role === 'worker' ? req.user.id : null
  const data = await shiftService.getShiftDetail(req.params.id, workerUid)
  res.status(200).json(success(data, 'OK'))
}

/** POST /api/v1/shifts/:id/apply — worker applies (KYC + payout gates). */
export async function apply(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id
  const data = await shiftService.applyToShift(userId, req.params.id)
  res.status(201).json(success(data, 'Application submitted'))
}
