import mongoose from 'mongoose'
import { nanoid } from 'nanoid'

/* ═══════════════════════════════════════════════════════════════════════════
 *  WorkerProfile — one document per worker user: name, location, KYC snapshot
 *
 *  Linked to User by user_id (string, same as User._id). Created at onboarding
 *  step 2–3 per API doc; User.onboarding_step is bumped to 3 when this exists.
 * ═══════════════════════════════════════════════════════════════════════════ */

const workerProfileSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => `wp_${nanoid(24)}` },
    /** Same id as User document (usr_...). */
    user_id: { type: String, required: true, unique: true, index: true },
    full_name: { type: String, required: true },
    /** Stored as UTC midnight for the calendar day from YYYY-MM-DD. */
    dob: { type: Date, required: true },
    avatar_url: { type: String, default: null },
    bio: { type: String, default: null },
    location_lat: { type: Number, required: true },
    location_lng: { type: Number, required: true },
    city: { type: String, required: true },
    radius_km: { type: Number, required: true },
    kyc_status: {
      type: String,
      enum: ['unverified', 'pending', 'approved', 'rejected'],
      default: 'unverified',
    },
    rating_avg: { type: Number, default: 0 },
    total_shifts: { type: Number, default: 0 },
    /** Ordered list of Category._id values the worker selected (PUT /workers/categories). */
    category_ids: { type: [String], default: [] },
  }, 
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
)

export type WorkerProfileDoc = mongoose.InferSchemaType<typeof workerProfileSchema> & {
  _id: string
}

export const WorkerProfileModel = mongoose.model('WorkerProfile', workerProfileSchema)
