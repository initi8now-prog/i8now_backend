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
    /** E.164 phone if they signed in with phone; null if email-only. */
    phone: { type: String, sparse: true, unique: true, default: null },
    /** Lowercased email if they signed in with email; null if phone-only. */
    email: { type: String, sparse: true, unique: true, default: null },
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
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
)

export type UserDoc = mongoose.InferSchemaType<typeof userSchema> & { _id: string }

export const UserModel = mongoose.model('User', userSchema)
