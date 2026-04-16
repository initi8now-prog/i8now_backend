/* ═══════════════════════════════════════════════════════════════════════════
 *  shift.seed — one employer + sample shifts for local dev / empty databases
 *
 *  Runs once at startup when the Shift collection is empty. Uses stable ids from
 *  the API doc examples (emp_01, shft_…, cat_01).
 * ═══════════════════════════════════════════════════════════════════════════ */

import { EmployerProfileModel } from './employerProfile.model.js'
import { ShiftModel } from './shift.model.js'

function utcDay(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d))
}

/** Inserts demo employer + shifts when there are no shift documents. */
export async function ensureShiftSeed(): Promise<void> {
  const n = await ShiftModel.countDocuments().exec()
  if (n > 0) return

  await EmployerProfileModel.create({
    _id: 'emp_01',
    company_name: 'Regal Events Pvt Ltd',
    logo_url: 'https://cdn.gigwork.in/logos/emp_01.png',
    rating_avg: 4.3,
    rating_count: 1,
    verified: true,
    total_shifts_posted: 5,
  })

  await ShiftModel.insertMany([
    {
      _id: 'shft_01j2k3',
      employer_id: 'emp_01',
      category_id: 'cat_01',
      title: 'Event Staff — Wedding Reception',
      description: 'Guest coordination, light setup help, evening shift near Tonk Road.',
      date: utcDay(2026, 4, 18),
      start_time: '18:00',
      end_time: '23:00',
      hourly_rate: 180,
      currency: 'INR',
      slots_total: 5,
      slots_filled: 2,
      address: 'Hotel Clarks Amer, Jaipur',
      location_lat: 26.9,
      location_lng: 75.8,
      geofence_radius_m: 200,
      status: 'open',
    },
    {
      _id: 'shft_02demo',
      employer_id: 'emp_01',
      category_id: 'cat_02',
      title: 'Retail Support — Weekend',
      description: 'Stocking and checkout support Saturday–Sunday.',
      date: utcDay(2026, 4, 19),
      start_time: '10:00',
      end_time: '18:00',
      hourly_rate: 150,
      currency: 'INR',
      slots_total: 8,
      slots_filled: 0,
      address: 'MI Road, Jaipur',
      location_lat: 26.9124,
      location_lng: 75.7873,
      geofence_radius_m: 150,
      status: 'open',
    },
    {
      _id: 'shft_03demo',
      employer_id: 'emp_01',
      category_id: 'cat_01',
      title: 'Hospitality — Banquet Server',
      description: 'Serve tables for corporate dinner.',
      date: utcDay(2026, 4, 20),
      start_time: '19:00',
      end_time: '23:30',
      hourly_rate: 200,
      currency: 'INR',
      slots_total: 4,
      slots_filled: 4,
      address: 'Jaipur Convention Centre',
      location_lat: 26.88,
      location_lng: 75.82,
      geofence_radius_m: 200,
      status: 'filled',
    },
  ])
}
