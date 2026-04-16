/* ═══════════════════════════════════════════════════════════════════════════
 *  adminEmployer.repo — Mongo access for admin actions on EmployerProfile
 *
 *  Shift code keeps using `shift/employer.repo.ts` for reads by id; listing and
 *  verification toggles live here so admin concerns stay in one folder.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { EmployerProfileModel, type EmployerProfileDoc } from '../shift/employerProfile.model.js'

/**
 * Total number of employer profiles (for paginated list `meta.total`).
 */
/** Optional `verified` flag narrows the employer directory (same index as unfiltered list). */
export type AdminEmployerListFilter = {
  verified?: boolean
  search?: string
}

function buildListQuery(filter: AdminEmployerListFilter): Record<string, unknown> {
  const q: Record<string, unknown> = {}
  if (filter.verified !== undefined) q.verified = filter.verified
  if (filter.search) q.company_name = { $regex: filter.search, $options: 'i' }
  return q
}

export async function countForList(filter: AdminEmployerListFilter): Promise<number> {
  return EmployerProfileModel.countDocuments(buildListQuery(filter)).exec()
}

/**
 * One page of employers, most recently created first.
 */
export async function listForList(
  filter: AdminEmployerListFilter,
  skip: number,
  limit: number,
): Promise<EmployerProfileDoc[]> {
  return EmployerProfileModel.find(buildListQuery(filter))
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(limit)
    .exec()
}

/**
 * Sets the platform verification flag on an employer (`emp_…`).
 * Returns the updated row, or null if id does not exist.
 */
export async function setVerified(id: string, verified: boolean): Promise<EmployerProfileDoc | null> {
  return EmployerProfileModel.findByIdAndUpdate(id, { $set: { verified } }, { new: true }).exec()
}

export async function patchById(
  id: string,
  patch: Partial<
    Pick<
      EmployerProfileDoc,
      | 'company_name'
      | 'logo_url'
      | 'logo_fit'
      | 'verified'
      | 'industry'
      | 'company_size'
      | 'website_url'
      | 'contact_name'
      | 'contact_email'
      | 'contact_phone'
      | 'city'
      | 'address_line1'
      | 'address_line2'
      | 'notes'
      | 'status'
    >
  >,
): Promise<EmployerProfileDoc | null> {
  return EmployerProfileModel.findByIdAndUpdate(id, { $set: patch }, { new: true }).exec()
}

export async function createEmployer(
  input: Partial<
    Pick<
      EmployerProfileDoc,
      | 'company_name'
      | 'logo_url'
      | 'logo_fit'
      | 'verified'
      | 'industry'
      | 'company_size'
      | 'website_url'
      | 'contact_name'
      | 'contact_email'
      | 'contact_phone'
      | 'city'
      | 'address_line1'
      | 'address_line2'
      | 'notes'
      | 'status'
    >
  >,
): Promise<EmployerProfileDoc> {
  const row = await EmployerProfileModel.create(input)
  return row
}

export async function deleteById(id: string): Promise<boolean> {
  const res = await EmployerProfileModel.deleteOne({ _id: id }).exec()
  return res.deletedCount > 0
}
