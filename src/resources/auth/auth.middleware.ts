/* ═══════════════════════════════════════════════════════════════════════════
 *  auth.middleware — attach req.user from Bearer JWT; optional role gate
 *
 *  Used on worker/employer routes. Verifies HS256 access token from env secret;
 *  does not touch the database. Role helpers return 403 when the role mismatches.
 * ═══════════════════════════════════════════════════════════════════════════ */

import type { NextFunction, Request, Response } from 'express'
import { loadEnv } from '../../config/env.js'
import type { UserRole } from '../user/user.types.js'
import { verifyAccessToken } from '../../utils/jwt.js'

/**
 * Requires `Authorization: Bearer <access_token>`. Sets `req.user` with id + role.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const raw = req.headers.authorization
  const token = typeof raw === 'string' ? raw.replace(/^Bearer\s+/i, '').trim() : ''
  if (!token) {
    res.status(401).json({ status: 'error', message: 'Unauthorized', errors: [] })
    return
  }

  const env = loadEnv()
  try {
    const payload = verifyAccessToken(token, env.JWT_ACCESS_SECRET)
    req.user = { id: payload.sub, role: payload.role }
    next()
  } catch {
    res.status(401).json({ status: 'error', message: 'Invalid or expired token', errors: [] })
  }
}

/**
 * After requireAuth: only allows the given role (e.g. workers hitting /workers/*).
 */
export function requireRole(role: UserRole) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ status: 'error', message: 'Unauthorized', errors: [] })
      return
    }
    if (req.user.role !== role) {
      res.status(403).json({ status: 'error', message: 'Forbidden', errors: [] })
      return
    }
    next()
  }
}
