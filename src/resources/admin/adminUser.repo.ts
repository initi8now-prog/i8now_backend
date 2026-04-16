/* ═══════════════════════════════════════════════════════════════════════════
 *  adminUser.repo — Mongo access for admin user management (User collection)
 *
 *  Normal login and profile code keep using `user/user.repo.ts`. Only operator
 *  flows that list, create, or deactivate accounts live here.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { UserModel, type UserDoc } from '../user/user.model.js'
import type { UserRole } from '../user/user.types.js'

/** Filters for GET /admin/users (directory + search). */
export type AdminUserListFilter = {
  role?: UserRole
  status?: 'pending' | 'active' | 'suspended' | 'banned'
  search?: string
  /** When true, include soft-deleted rows (`deleted_at` set). Default: exclude them. */
  include_deleted?: boolean
}

function buildDirectoryQuery(f: AdminUserListFilter): Record<string, unknown> {
  const q: Record<string, unknown> = {}
  if (!f.include_deleted) {
    q.deleted_at = null
  }
  if (f.role !== undefined) q.role = f.role
  if (f.status !== undefined) q.status = f.status
  if (f.search !== undefined && f.search.trim() !== '') {
    const escaped = f.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    q.$or = [
      { email: { $regex: escaped, $options: 'i' } },
      { phone: { $regex: escaped, $options: 'i' } },
    ]
  }
  return q
}

/**
 * Counts users matching the directory filter (for pagination `meta.total`).
 */
export async function countForDirectory(f: AdminUserListFilter): Promise<number> {
  return UserModel.countDocuments(buildDirectoryQuery(f)).exec()
}

/**
 * One page of users, newest accounts first.
 */
export async function listForDirectory(
  f: AdminUserListFilter,
  skip: number,
  limit: number,
): Promise<UserDoc[]> {
  return UserModel.find(buildDirectoryQuery(f))
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(limit)
    .exec()
}

/** Payload for POST /admin/users (provisioned account; OTP and/or password login). */
export type AdminCreateUserInput = {
  phone: string | null
  email: string | null
  role: UserRole
  status: 'pending' | 'active' | 'suspended' | 'banned'
  onboarding_step: number
  password_hash?: string | null
  password_login_enabled?: boolean
}

/**
 * Inserts a new user row. Exactly one of phone or email must be set by the caller.
 */
export async function insertUser(input: AdminCreateUserInput): Promise<UserDoc> {
  const doc: Record<string, unknown> = {
    ...(input.phone != null && input.phone !== '' ? { phone: input.phone } : {}),
    ...(input.email != null && input.email !== '' ? { email: input.email } : {}),
    role: input.role,
    status: input.status,
    onboarding_step: input.onboarding_step,
    deleted_at: null,
  }
  if (input.password_hash) {
    doc.password_hash = input.password_hash
    doc.password_login_enabled = input.password_login_enabled !== false
  } else {
    doc.password_login_enabled = false
  }
  return UserModel.create(doc)
}

/** Partial update for PATCH /admin/users/:id (role, status, onboarding). */
export type AdminUserPatch = {
  role?: UserRole
  status?: 'pending' | 'active' | 'suspended' | 'banned'
  onboarding_step?: number
}

/**
 * Updates editable fields on a user. Returns null if the id does not exist.
 */
export async function updateById(id: string, patch: AdminUserPatch): Promise<UserDoc | null> {
  return UserModel.findByIdAndUpdate(id, { $set: patch }, { new: true }).exec()
}

/**
 * Applies `$set` / `$unset` in one write (e.g. clearing `phone` with sparse unique index — omit field, do not set null).
 */
export async function applyAdminPatch(
  id: string,
  ops: { $set: Record<string, unknown>; $unset: Record<string, true> },
): Promise<UserDoc | null> {
  const update: Record<string, unknown> = {}
  if (Object.keys(ops.$set).length > 0) update.$set = ops.$set
  if (Object.keys(ops.$unset).length > 0) update.$unset = ops.$unset
  if (!update.$set && !update.$unset) {
    return UserModel.findById(id).exec()
  }
  return UserModel.findByIdAndUpdate(id, update, { new: true }).exec()
}

/**
 * Soft-delete: sets `deleted_at` to now. Caller should revoke refresh tokens.
 */
export async function softDelete(id: string): Promise<UserDoc | null> {
  return UserModel.findByIdAndUpdate(id, { $set: { deleted_at: new Date() } }, { new: true }).exec()
}

/**
 * Clears `deleted_at` so the user can log in again.
 */
export async function restore(id: string): Promise<UserDoc | null> {
  return UserModel.findByIdAndUpdate(id, { $set: { deleted_at: null } }, { new: true }).exec()
}
