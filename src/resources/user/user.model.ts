import mongoose from 'mongoose'
import { nanoid } from 'nanoid'

/* ═══════════════════════════════════════════════════════════════════════════
 *  user.model — Mongo schema for accounts after OTP (this resource folder)
 *
 *  Same schema as before the folder move; auth + worker services use user.repo.
 * ═══════════════════════════════════════════════════════════════════════════ */

const userSchema = new mongoose.Schema(
  {
    /** Public id like `usr_...` (string, not Mongo’s default ObjectId). */
    _id: { type: String, default: () => `usr_${nanoid(24)}` },
    /** E.164 phone if they signed in with phone; omit field if email-only (never store null — unique sparse index would reject a second null). */
    phone: { type: String, sparse: true, unique: true },
    /** Lowercased email if they signed in with email; omit field if phone-only. */
    email: { type: String, sparse: true, unique: true },
    role: {
      type: String,
      enum: ['worker', 'employer', 'admin'],
      default: 'worker',
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'suspended', 'banned'],
      default: 'pending',
    },
    /** Last completed onboarding step number (your product defines steps). */
    onboarding_step: { type: Number, default: 0 },
    /** When set, the account is soft-deleted and cannot log in until restored. */
    deleted_at: { type: Date, default: null, index: true },
    /** Google Authenticator–style TOTP; second factor after email OTP for admins. */
    totp_enabled: { type: Boolean, default: false },
    totp_secret: { type: String, default: null },
    /** Staging secret until user confirms with a valid code from the app. */
    totp_pending_secret: { type: String, default: null },
    /** Bcrypt hash; optional — OTP-only accounts omit this. */
    password_hash: { type: String, default: null },
    /** When true, `POST /auth/login-password` is allowed for this account. */
    password_login_enabled: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
)

export type UserDoc = mongoose.InferSchemaType<typeof userSchema> & { _id: string }

export const UserModel = mongoose.model('User', userSchema)
