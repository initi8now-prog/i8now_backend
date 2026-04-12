/* ═══════════════════════════════════════════════════════════════════════════
 *  app — builds the Express application (middleware + routes + error handler)
 *
 *  Order matters: JSON parser → request logging → routes → errorHandler last.
 *  Routes: /auth (public), /workers (Bearer + worker role for profile + me).
 * ═══════════════════════════════════════════════════════════════════════════ */

import express from 'express'
import type { Logger } from 'pino'
import { API_PREFIX } from './config/constants.js'
import { errorHandler } from './middlewares/error.middleware.js'
import { authRouter } from './resources/auth/auth.routes.js'
import { workerRouter } from './resources/worker/worker.routes.js'

export function createApp(logger: Logger) {
  const app = express()

  app.use(express.json({ limit: '1mb' }))

  // One line per finished request (method, url, status, time) — skips /health noise.
  app.use((req, res, next) => {
    if (req.url === '/health') {
      next()
      return
    }
    const start = Date.now()
    res.on('finish', () => {
      logger.info({
        method: req.method,
        url: req.url,
        status: res.statusCode,
        ms: Date.now() - start,
      })
    })
    next()
  })

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' })
  })

  app.use(`${API_PREFIX}/auth`, authRouter)
  app.use(`${API_PREFIX}/workers`, workerRouter)

  app.use(errorHandler)

  return app
}
