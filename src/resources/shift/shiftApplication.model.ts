import mongoose from 'mongoose'
import { nanoid } from 'nanoid'

/* ═══════════════════════════════════════════════════════════════════════════
 *  ShiftApplication — worker (profile wp_…) applied to a shift (shft_…)
 *
 *  Status progresses toward timesheets later (confirmed → completed, etc.).
 * ═══════════════════════════════════════════════════════════════════════════ */

const shiftApplicationSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => `app_${nanoid(20)}` },
    shift_id: { type: String, required: true, index: true },
    worker_profile_id: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['applied', 'confirmed', 'rejected', 'completed', 'cancelled'],
      default: 'applied',
    },
    applied_at: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: false },
)

shiftApplicationSchema.index({ shift_id: 1, worker_profile_id: 1 }, { unique: true })

export type ShiftApplicationDoc = mongoose.InferSchemaType<typeof shiftApplicationSchema> & { _id: string }

export const ShiftApplicationModel = mongoose.model('ShiftApplication', shiftApplicationSchema)
