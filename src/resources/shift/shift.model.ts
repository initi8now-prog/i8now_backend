import mongoose from 'mongoose'
import { nanoid } from 'nanoid'

/* ═══════════════════════════════════════════════════════════════════════════
 *  Shift — one job slot posted by an employer (discovery + apply flow)
 *
 *  `slots_filled` is employer-side; `slots_left` in API = slots_total − slots_filled.
 * ═══════════════════════════════════════════════════════════════════════════ */

const shiftSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => `shft_${nanoid(20)}` },
    employer_id: { type: String, required: true, index: true },
    category_id: { type: String, required: true, index: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    /** Calendar day (UTC midnight). */
    date: { type: Date, required: true, index: true },
    /** 24h "HH:mm" local wall time strings. */
    start_time: { type: String, required: true },
    end_time: { type: String, required: true },
    hourly_rate: { type: Number, required: true },
    currency: { type: String, required: true, default: 'INR' },
    slots_total: { type: Number, required: true },
    slots_filled: { type: Number, default: 0 },
    address: { type: String, required: true },
    location_lat: { type: Number, required: true },
    location_lng: { type: Number, required: true },
    geofence_radius_m: { type: Number, required: true, default: 200 },
    status: {
      type: String,
      enum: ['open', 'filled', 'cancelled'],
      default: 'open',
      index: true,
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
)

export type ShiftDoc = mongoose.InferSchemaType<typeof shiftSchema> & { _id: string }

export const ShiftModel = mongoose.model('Shift', shiftSchema)
