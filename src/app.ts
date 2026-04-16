/* ═══════════════════════════════════════════════════════════════════════════
 *  app — builds the Express application (middleware + routes + error handler)
 *
 *  Order matters: JSON parser → request logging → routes → errorHandler last.
 *  Routes: /auth, /shifts, /timesheets, /workers, /admin (Bearer + role).
 * ═══════════════════════════════════════════════════════════════════════════ */

import express from 'express'
import type { Logger } from 'pino'
import { API_PREFIX } from './config/constants.js'
import { loadEnv } from './config/env.js'
import { errorHandler } from './middlewares/error.middleware.js'
import { authRouter } from './resources/auth/auth.routes.js'
import { shiftRouter } from './resources/shift/shift.routes.js'
import { adminRouter } from './resources/admin/admin.routes.js'
import { timesheetRouter } from './resources/timesheet/timesheet.routes.js'
import { workerRouter } from './resources/worker/worker.routes.js'

export function createApp(logger: Logger) {
  const app = express()

  const env = loadEnv()
  const corsOrigins = (env.CORS_ORIGINS ?? 'http://localhost:5174,http://127.0.0.1:5174')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  app.use((req, res, next) => {
    const origin = req.headers.origin
    if (typeof origin === 'string' && corsOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Access-Control-Allow-Credentials', 'true')
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }
    next()
  })

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
  app.use(`${API_PREFIX}/shifts`, shiftRouter)
  // Worker clock-in/out: body lat/lng = device at request time; venue on Shift — see timesheet.service.
  app.use(`${API_PREFIX}/timesheets`, timesheetRouter)
  app.use(`${API_PREFIX}/workers`, workerRouter)
  app.use(`${API_PREFIX}/admin`, adminRouter)

  app.use(errorHandler)

  return app
}
