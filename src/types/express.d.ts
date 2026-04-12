/* ═══════════════════════════════════════════════════════════════════════════
 *  express.d.ts — teach TypeScript about `req.user` after auth middleware
 *
 *  Populated by `requireAuth` on protected routes (see resources/auth/auth.middleware.ts).
 * ═══════════════════════════════════════════════════════════════════════════ */

import type { UserRole } from '../resources/user/user.types.js'

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: UserRole }
    }
  }
}

export {}
