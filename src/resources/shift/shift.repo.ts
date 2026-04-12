/* ═══════════════════════════════════════════════════════════════════════════
 *  shift.repo — queries for Shift documents
 *
 *  DB only — filtering by distance happens in the service layer.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { ShiftModel, type ShiftDoc } from './shift.model.js'

export type ShiftListDbFilter = {
  status?: string
  categoryIds?: string[]
  /** Exact calendar day (UTC midnight stored in DB). */
  dateEq?: Date
  dateFrom?: Date
  dateTo?: Date
  minRate?: number
  maxRate?: number
}

/** Returns shifts matching filters (status defaults to open in caller). */
export async function findWithFilters(f: ShiftListDbFilter): Promise<ShiftDoc[]> {
  const q: Record<string, unknown> = {}
  if (f.status !== undefined) {
    q.status = f.status
  } else {
    q.status = 'open'
  }
  if (f.categoryIds && f.categoryIds.length > 0) {
    q.category_id = { $in: f.categoryIds }
  }

  if (f.dateEq) {
    const start = new Date(f.dateEq)
    const end = new Date(start)
    end.setUTCDate(end.getUTCDate() + 1)
    q.date = { $gte: start, $lt: end }
  } else {
    const range: { $gte?: Date; $lte?: Date } = {}
    if (f.dateFrom) range.$gte = f.dateFrom
    if (f.dateTo) range.$lte = f.dateTo
    if (Object.keys(range).length > 0) {
      q.date = range
    }
  }

  if (f.minRate !== undefined || f.maxRate !== undefined) {
    const hr: { $gte?: number; $lte?: number } = {}
    if (f.minRate !== undefined) hr.$gte = f.minRate
    if (f.maxRate !== undefined) hr.$lte = f.maxRate
    q.hourly_rate = hr
  }

  return ShiftModel.find(q).sort({ date: 1, start_time: 1 }).exec()
}

export async function findById(id: string): Promise<ShiftDoc | null> {
  return ShiftModel.findById(id).exec()
}
