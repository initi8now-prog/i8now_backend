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
    rating_avg: { type: Number, default: 0 },
    verified: { type: Boolean, default: false },
    total_shifts_posted: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
)

export type EmployerProfileDoc = mongoose.InferSchemaType<typeof employerProfileSchema> & { _id: string }

export const EmployerProfileModel = mongoose.model('EmployerProfile', employerProfileSchema)
