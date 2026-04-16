/**
 * Seed a realistic timesheet for worker wp_6V26WuAKKgFBKecfYzKxmv4M
 * Run once:  node scripts/seed-timesheet.mjs
 */
import mongoose from 'mongoose'
import { nanoid } from 'nanoid'

const MONGO_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/i8now'
const WORKER_PROFILE_ID = 'wp_6V26WuAKKgFBKecfYzKxmv4M'

await mongoose.connect(MONGO_URI)
console.log('Connected to', MONGO_URI)

// ── Find the worker's application ──────────────────────────────────────────
const app = await mongoose.connection.db
  .collection('shiftapplications')
  .findOne({ worker_profile_id: WORKER_PROFILE_ID })

if (!app) {
  console.error('No application found for worker', WORKER_PROFILE_ID)
  process.exit(1)
}

// ── Check if a timesheet already exists ───────────────────────────────────
const existing = await mongoose.connection.db
  .collection('timesheets')
  .findOne({ application_id: app._id })

if (existing) {
  console.log('Timesheet already exists:', existing._id)
  console.log('Nothing inserted. Delete it first if you want to re-seed.')
  await mongoose.disconnect()
  process.exit(0)
}

// ── Build realistic clock-in / out times ──────────────────────────────────
//    Shift is 16:00–23:00. Worker clocked in at 16:02, out at 23:05.
const shift = await mongoose.connection.db
  .collection('shifts')
  .findOne({ _id: app.shift_id })

const shiftDate = shift?.date ? new Date(shift.date) : new Date('2026-04-15')
const baseDate = shiftDate.toISOString().slice(0, 10) // e.g. "2026-04-15"

const clockIn  = new Date(`${baseDate}T10:32:00.000Z`) // 16:02 IST = 10:32 UTC
const clockOut = new Date(`${baseDate}T17:35:00.000Z`) // 23:05 IST = 17:35 UTC

const totalHours   = parseFloat(((clockOut - clockIn) / 3600000).toFixed(2))  // 7.05
const hourlyRate   = shift?.hourly_rate ?? 180
const gross        = parseFloat((totalHours * hourlyRate).toFixed(2))
const platformFee  = parseFloat((gross * 0.10).toFixed(2))   // 10 % platform cut
const netToWorker  = parseFloat((gross - platformFee).toFixed(2))

const doc = {
  _id:                    `ts_${nanoid(20)}`,
  application_id:         app._id,
  shift_id:               app.shift_id,
  worker_profile_id:      WORKER_PROFILE_ID,
  clock_in:               clockIn,
  clock_in_lat:           -37.9143,   // near Pakenham, VIC (shift venue area)
  clock_in_lng:           145.4919,
  clock_in_accuracy_m:    8,
  distance_from_venue_m:  42,          // 42 m from venue — well within geofence
  clock_out:              clockOut,
  clock_out_lat:          -37.9146,
  clock_out_lng:          145.4921,
  total_hours:            totalHours,
  gross_amount:           gross,
  platform_fee:           platformFee,
  net_to_worker:          netToWorker,
  status:                 'approved',
  approved_at:            new Date(`${baseDate}T18:00:00.000Z`),
  worker_rating_employer: 4,           // worker gave employer 4 stars
  employer_rating_worker: null,        // employer hasn't rated yet → admin can rate
  created_at:             clockIn,
  updated_at:             new Date(),
}

await mongoose.connection.db.collection('timesheets').insertOne(doc)

console.log('\n✅ Timesheet created:', doc._id)
console.log('   Application:     ', doc.application_id)
console.log('   Shift:           ', doc.shift_id)
console.log('   Clock in:        ', clockIn.toISOString())
console.log('   Clock out:       ', clockOut.toISOString())
console.log(`   Hours:           ${totalHours} hrs`)
console.log(`   Gross:           ₹${gross}`)
console.log(`   Platform fee:    ₹${platformFee}`)
console.log(`   Net to worker:   ₹${netToWorker}`)
console.log('   Status:          approved')
console.log('   Worker → employer rating: 4 ⭐')
console.log('   Employer → worker rating: null (pending — admin can rate)')

await mongoose.disconnect()
