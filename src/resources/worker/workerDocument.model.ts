import mongoose from 'mongoose'
import { nanoid } from 'nanoid'

/* ═══════════════════════════════════════════════════════════════════════════
 *  WorkerDocument — KYC file metadata (actual file lives at file_url / CDN)
 *
 *  Duplicate rule: at most one pending or approved row per (profile, type).
 * ═══════════════════════════════════════════════════════════════════════════ */

const workerDocumentSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => `doc_${nanoid(20)}` },
    worker_profile_id: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: ['govt_id', 'right_to_work', 'background_check'],
      required: true,
    },
    file_url: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    reviewed_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } },
)

export type WorkerDocumentDoc = mongoose.InferSchemaType<typeof workerDocumentSchema> & { _id: string }

export const WorkerDocumentModel = mongoose.model('WorkerDocument', workerDocumentSchema)
