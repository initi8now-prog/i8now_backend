/* ═══════════════════════════════════════════════════════════════════════════
 *  server — process entry: load env → logger → MongoDB → HTTP listen
 *
 *  Loads .env first (dotenv). Fatal startup errors go to stderr and exit 1.
 * ═══════════════════════════════════════════════════════════════════════════ */

import 'dotenv/config'
import { loadEnv } from './config/env.js'
import { connectMongo } from './config/db.js'
import { createLogger } from './utils/logger.js'
import { initLogger } from './instrumentation/logger.js'
import { createApp } from './app.js'
import { ensureDefaultCategories } from './resources/worker/category.repo.js'
import { promoteAdminFromEnv } from './resources/admin/admin.seed.js'
import { ensureShiftSeed } from './resources/shift/shift.seed.js'

async function main(): Promise<void> {
  const env = loadEnv()
  const logger = createLogger(env)
  initLogger(logger)

  await connectMongo(env.MONGODB_URI, logger)
  await ensureDefaultCategories()
  await ensureShiftSeed()
  await promoteAdminFromEnv()

  const app = createApp(logger)
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'Server listening')
  })
}

void main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
