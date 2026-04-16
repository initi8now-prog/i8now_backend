/* ═══════════════════════════════════════════════════════════════════════════
 *  error.middleware — last-resort error → JSON for the client
 *
 *  • AppError     → HTTP status from the error + { code, message, errors: [] }
 *  • ZodError     → 422 + field list (validation at the edge)
 *  • anything else → 500 (hide details from clients)
 * ═══════════════════════════════════════════════════════════════════════════ */

import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { AppError } from '../utils/errors.js'

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.httpStatus).json({
      status: 'error',
      message: err.message,
      code: err.code,
      errors: [],
    })
    return
  }

  if (err instanceof ZodError) {
    res.status(422).json({
      status: 'error',
      message: 'Validation failed',
      errors: err.errors.map((e) => ({
        field: e.path.join('.') || 'root',
        message: e.message,
      })),
    })
    return
  }

  if (process.env.NODE_ENV !== 'production') {
    console.error('[error]', err)
  }

  res.status(500).json({
    status: 'error',
    message: 'Internal server error',
    errors: [],
  })
}
