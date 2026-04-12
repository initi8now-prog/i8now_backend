import mongoose from 'mongoose'

/* ═══════════════════════════════════════════════════════════════════════════
 *  RefreshToken — long-lived “remember this login” token (stored hashed)
 *
 *  Why it exists:
 *    Access JWTs are short (minutes). The client keeps a refresh token for
 *    weeks and calls POST /auth/refresh-token to get a new access token.
 *
 *  We never save the raw refresh string in the DB — only `token_hash`, so a
 *  DB leak does not leak usable refresh tokens.
 *
 *  When `expires_at` passes, the row is invalid; the client must verify-otp
 *  again (full login).
 * ═══════════════════════════════════════════════════════════════════════════ */

const refreshTokenSchema = new mongoose.Schema({
  /** Which user this refresh belongs to (same id as User._id). */
  user_id: { type: String, required: true, index: true },
  /** One-way hash of the real refresh token (server never stores the raw token). */
  token_hash: { type: String, required: true, unique: true },
  /** After this instant the refresh token is dead. */
  expires_at: { type: Date, required: true },
})

export type RefreshTokenDoc = mongoose.InferSchemaType<typeof refreshTokenSchema> & {
  _id: mongoose.Types.ObjectId
}

export const RefreshTokenModel = mongoose.model('RefreshToken', refreshTokenSchema)
