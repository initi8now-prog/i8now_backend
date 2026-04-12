/* ═══════════════════════════════════════════════════════════════════════════
 *  db — opens one Mongoose connection for the whole Node process
 *
 *  Call once at startup. Repositories use the shared connection implicitly.
 * ═══════════════════════════════════════════════════════════════════════════ */

import mongoose from 'mongoose'
import type { Logger } from 'pino'

export async function connectMongo(uri: string, logger: Logger): Promise<void> {
  mongoose.set('strictQuery', true)
  await mongoose.connect(uri)
  logger.info('MongoDB connected')
}
