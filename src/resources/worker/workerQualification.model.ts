import mongoose from 'mongoose'
import { nanoid } from 'nanoid'

/* ═══════════════════════════════════════════════════════════════════════════
 *  WorkerQualification — one education / job / cert row for a worker profile
 *
 *  worker_profile_id points at WorkerProfile._id (wp_…). Admin sets verified later.
 * ═══════════════════════════════════════════════════════════════════════════ */

const workerQualificationSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => `qual_${nanoid(20)}` },
    worker_profile_id: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: ['education', 'work_experience', 'certification'],
      required: true,
    },
    title: { type: String, required: true, maxlength: 200 },
    institution: { type: String, required: true, maxlength: 200 },
    from_date: { type: Date, required: true },
    to_date: { type: Date, default: null },
    description: { type: String, default: null, maxlength: 500 },
    verified: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } },
)

export type WorkerQualificationDoc = mongoose.InferSchemaType<typeof workerQualificationSchema> & {
  _id: string
}

export const WorkerQualificationModel = mongoose.model('WorkerQualification', workerQualificationSchema)
