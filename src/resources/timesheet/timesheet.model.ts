import mongoose from 'mongoose'
import { nanoid } from 'nanoid'

/* ═══════════════════════════════════════════════════════════════════════════
 *  Timesheet — one document per shift application after clock-in
 *
 *  Status flow: open → pending (after clock-out) → approved / … (employer).
 *
 *  Stored coordinates:
 *    • clock_in_lat / clock_in_lng — worker position sent at clock-in (not the
 *      venue). The shift’s venue is on Shift.location_lat / location_lng.
 *    • clock_in_accuracy_m — optional GPS accuracy (metres) at clock-in; audit.
 *    • distance_from_venue_m — straight-line distance from worker point to
 *      venue at clock-in (computed server-side).
 *    • clock_out_lat / clock_out_lng — optional worker position at clock-out.
 * ═══════════════════════════════════════════════════════════════════════════ */

const timesheetSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => `ts_${nanoid(20)}` },
    application_id: { type: String, required: true, unique: true, index: true },
    shift_id: { type: String, required: true, index: true },
    worker_profile_id: { type: String, required: true, index: true },
    clock_in: { type: Date, required: true },
    /** Worker latitude at clock-in (from request body). */
    clock_in_lat: { type: Number, required: true },
    /** Worker longitude at clock-in (from request body). */
    clock_in_lng: { type: Number, required: true },
    /** GPS horizontal accuracy in metres at clock-in; optional, audit trail. */
    clock_in_accuracy_m: { type: Number, default: null },
    /** Haversine distance from (clock_in_lat, clock_in_lng) to shift venue. */
    distance_from_venue_m: { type: Number, required: true },
    clock_out: { type: Date, default: null },
    /** Optional worker latitude at clock-out. */
    clock_out_lat: { type: Number, default: null },
    /** Optional worker longitude at clock-out. */
    clock_out_lng: { type: Number, default: null },
    total_hours: { type: Number, default: null },
    gross_amount: { type: Number, default: null },
    platform_fee: { type: Number, default: 0 },
    net_to_worker: { type: Number, default: null },
    status: {
      type: String,
      enum: ['open', 'pending', 'approved', 'disputed', 'paid'],
      default: 'open',
      index: true,
    },
    approved_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
)

export type TimesheetDoc = mongoose.InferSchemaType<typeof timesheetSchema> & { _id: string }

export const TimesheetModel = mongoose.model('Timesheet', timesheetSchema)
