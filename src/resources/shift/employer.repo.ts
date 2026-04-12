/* ═══════════════════════════════════════════════════════════════════════════
 *  employer.repo — read employer profile rows for shift cards
 *
 *  DB only — no business rules.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { EmployerProfileModel, type EmployerProfileDoc } from './employerProfile.model.js'

export async function findById(id: string): Promise<EmployerProfileDoc | null> {
  return EmployerProfileModel.findById(id).exec()
}

export async function findByIds(ids: string[]): Promise<EmployerProfileDoc[]> {
  if (ids.length === 0) return []
  return EmployerProfileModel.find({ _id: { $in: ids } }).exec()
}
