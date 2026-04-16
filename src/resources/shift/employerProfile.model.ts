import mongoose from 'mongoose'
import { nanoid } from 'nanoid'

/* ═══════════════════════════════════════════════════════════════════════════
 *  EmployerProfile — minimal employer row for shift listings (company card)
 *
 *  Full employer onboarding lives elsewhere; shifts reference this by id (emp_…).
 * ═══════════════════════════════════════════════════════════════════════════ */

const employerProfileSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => `emp_${nanoid(20)}` },
    company_name: { type: String, required: true },
    logo_url: { type: String, default: null },
    logo_fit: { type: String, enum: ['contain', 'cover'], default: 'contain' },
    rating_avg: { type: Number, default: 0 },
    /** How many worker→employer star ratings contributed to `rating_avg`. */
    rating_count: { type: Number, default: 0 },
    /** Admin user ids that already gave direct admin rating for this employer profile. */
    admin_rater_user_ids: { type: [String], default: [] },
    verified: { type: Boolean, default: false },
    total_shifts_posted: { type: Number, default: 0 },
    industry: { type: String, default: null },
    company_size: { type: String, default: null },
    website_url: { type: String, default: null },
    contact_name: { type: String, default: null },
    contact_email: { type: String, default: null },
    contact_phone: { type: String, default: null },
    city: { type: String, default: null },
    address_line1: { type: String, default: null },
    address_line2: { type: String, default: null },
    notes: { type: String, default: null },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
)

export type EmployerProfileDoc = mongoose.InferSchemaType<typeof employerProfileSchema> & { _id: string }

export const EmployerProfileModel = mongoose.model('EmployerProfile', employerProfileSchema)
