/* ═══════════════════════════════════════════════════════════════════════════
 *  asyncHandler — wraps async Express handlers so rejections become `next(err)`
 *
 *  Without this, a thrown error inside `async (req,res)` can crash the process.
 * ═══════════════════════════════════════════════════════════════════════════ */

import type { NextFunction, Request, Response } from 'express'

type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<unknown>

export function asyncHandler(fn: AsyncRoute) {
  return (req: Request, res: Response, next: NextFunction) => {
    void Promise.resolve(fn(req, res, next)).catch(next)
  }
}
