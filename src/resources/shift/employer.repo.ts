/* ═══════════════════════════════════════════════════════════════════════════
 *  employer.repo — read employer profile rows for shift cards
 *
 *  DB only — no business rules.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { nextRunningAverage } from '../../utils/rating.js'
import { EmployerProfileModel, type EmployerProfileDoc } from './employerProfile.model.js'

export async function findById(id: string): Promise<EmployerProfileDoc | null> {
  return EmployerProfileModel.findById(id).exec()
}

export async function findByIds(ids: string[]): Promise<EmployerProfileDoc[]> {
  if (ids.length === 0) return []
  return EmployerProfileModel.find({ _id: { $in: ids } }).exec()
}

/**
 * Applies one worker→employer star rating (1–5) to the running average on the profile.
 */
export async function incrementRatingFromWorker(
  employerId: string,
  stars: number,
): Promise<EmployerProfileDoc | null> {
  const doc = await EmployerProfileModel.findById(employerId).exec()
  if (!doc) return null
  const oldC = doc.rating_count ?? 0
  const newAvg = nextRunningAverage(doc.rating_avg, oldC, stars)
  const newC = oldC + 1
  return EmployerProfileModel.findByIdAndUpdate(
    employerId,
    { $set: { rating_avg: newAvg, rating_count: newC } },
    { new: true },
  ).exec()
}

export async function incrementRatingFromAdminOnce(
  employerId: string,
  adminUserId: string,
  stars: number,
): Promise<{ doc: EmployerProfileDoc | null; alreadyRated: boolean }> {
  const doc = await EmployerProfileModel.findById(employerId).exec()
  if (!doc) return { doc: null, alreadyRated: false }
  if ((doc.admin_rater_user_ids ?? []).includes(adminUserId)) {
    return { doc, alreadyRated: true }
  }
  const oldC = doc.rating_count ?? 0
  const newAvg = nextRunningAverage(doc.rating_avg, oldC, stars)
  const newC = oldC + 1
  const updated = await EmployerProfileModel.findByIdAndUpdate(
    employerId,
    {
      $set: { rating_avg: newAvg, rating_count: newC },
      $addToSet: { admin_rater_user_ids: adminUserId },
    },
    { new: true },
  ).exec()
  return { doc: updated, alreadyRated: false }
}
