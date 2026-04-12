/* ═══════════════════════════════════════════════════════════════════════════
 *  instrumentation/logger — tiny global holder for the Pino instance
 *
 *  server.ts calls initLogger() once; services that log (e.g. dev OTP debug)
 *  call getLogger(). Avoids passing logger through every function signature.
 * ═══════════════════════════════════════════════════════════════════════════ */

import type { Logger } from 'pino'

let instance: Logger | null = null

export function initLogger(logger: Logger): void {
  instance = logger
}

export function getLogger(): Logger {
  if (!instance) {
    throw new Error('Logger not initialized')
  }
  return instance
}
