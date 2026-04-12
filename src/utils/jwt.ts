/* ═══════════════════════════════════════════════════════════════════════════
 *  jwt — sign and verify short-lived access tokens (HS256)
 *
 *  Payload keeps it tiny: who (`sub`) and what role. Refresh tokens are NOT JWTs.
 * ═══════════════════════════════════════════════════════════════════════════ */

import jwt from 'jsonwebtoken'
import type { UserRole } from '../resources/user/user.types.js'

type AccessPayload = {
  sub: string
  role: UserRole
}

export function signAccessToken(
  userId: string,
  role: UserRole,
  secret: string,
  expiresInSec: number,
): string {
  const payload: AccessPayload = { sub: userId, role }
  return jwt.sign(payload, secret, { expiresIn: expiresInSec, algorithm: 'HS256' })
}

export function verifyAccessToken(token: string, secret: string): AccessPayload {
  const decoded = jwt.verify(token, secret)
  if (typeof decoded !== 'object' || decoded === null) {
    throw new Error('Invalid token payload')
  }
  const sub = (decoded as { sub?: unknown }).sub
  const role = (decoded as { role?: unknown }).role
  if (typeof sub !== 'string' || typeof role !== 'string') {
    throw new Error('Invalid token payload')
  }
  if (role !== 'worker' && role !== 'employer' && role !== 'admin') {
    throw new Error('Invalid token role')
  }
  return { sub, role }
}
