/* ═══════════════════════════════════════════════════════════════════════════
 *  logger — creates the root Pino logger (JSON logs, level from NODE_ENV)
 *
 *  server.ts calls this once; other modules use getLogger() if they need it.
 * ═══════════════════════════════════════════════════════════════════════════ */

import pino from 'pino'
import type { Env } from '../config/env.js'

export function createLogger(env: Env) {
  return pino({
    level: env.NODE_ENV === 'development' ? 'debug' : 'info',
  })
}
