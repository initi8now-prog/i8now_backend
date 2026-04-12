/* ═══════════════════════════════════════════════════════════════════════════
 *  refreshToken.repo — persist hashed refresh tokens (never the raw string)
 *
 *  Lookup by hash when /refresh-token runs; delete when expired or revoked.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { RefreshTokenModel, type RefreshTokenDoc } from './refreshToken.model.js'

export async function createRefreshToken(
  user_id: string,
  token_hash: string,
  expires_at: Date,
): Promise<RefreshTokenDoc> {
  return RefreshTokenModel.create({ user_id, token_hash, expires_at })
}

export async function findByTokenHash(token_hash: string): Promise<RefreshTokenDoc | null> {
  return RefreshTokenModel.findOne({ token_hash }).exec()
}

export async function deleteByTokenHash(token_hash: string): Promise<void> {
  await RefreshTokenModel.deleteOne({ token_hash }).exec()
}
