/* ═══════════════════════════════════════════════════════════════════════════
 *  admin.controller — HTTP layer for `/api/v1/admin/*`
 *
 *  Parses query/body with Zod, calls `admin.service`, returns `success` / `paginated`.
 *  Authentication and `admin` role are enforced by `admin.routes` before handlers run.
 * ═══════════════════════════════════════════════════════════════════════════ */
import type { Request, Response } from 'express'
import { paginated, success } from '../../utils/apiResponse.js'
import * as adminService from './admin.service.js'
import {
  adminAddWorkerDocumentSchema,
  adminAddWorkerQualificationSchema,
  adminDeleteWorkerUploadSchema,
  adminReviewWorkerDocumentSchema,
  adminPresignWorkerUploadSchema,
  adminRateWorkerSchema,
  adminRateEmployerSchema,
  adminEmployerListQuerySchema,
  adminShiftListQuerySchema,
  adminTimesheetListQuerySchema,
  patchAdminWorkerProfileSchema,
  adminUserListQuerySchema,
  adminWorkerListQuerySchema,
  createAdminWorkerSchema,
  createAdminUserSchema,
  patchAdminUserSchema,
  patchEmployerVerificationSchema,
  patchAdminEmployerProfileSchema,
  createAdminEmployerSchema,
  createAdminShiftSchema,
  deleteAdminEmployerSchema,
  adminDeleteEmployerUploadSchema,
  patchWorkerKycSchema,
  adminTotpConfirmSchema,
  patchPlatformSettingsSchema,
  patchAdminShiftSchema,
  patchAdminMeAccountSchema,
  timesheetRateWorkerSchema,
} from './admin.validator.js'

/**
 * GET /api/v1/admin/me — current operator’s user row (admin session / “who am I”).
 */
export async function getAdminMe(req: Request, res: Response): Promise<void> {
  const data = await adminService.getAdminSessionUser(req.user!.id)
  res.status(200).json(success(data, 'OK'))
}

/** PATCH /api/v1/admin/me/account — self-service account updates. */
export async function patchAdminMeAccount(req: Request, res: Response): Promise<void> {
  const body = patchAdminMeAccountSchema.parse(req.body)
  const data = await adminService.patchAdminMeAccount(req.user!.id, body)
  res.status(200).json(success(data, 'Account updated'))
}

export async function getOverviewDashboard(_req: Request, res: Response): Promise<void> {
  const data = await adminService.getOverviewDashboard()
  res.status(200).json(success(data, 'OK'))
}

/** POST /api/v1/admin/me/totp/setup — begin Google Authenticator enrollment (pending secret). */
export async function postAdminTotpSetup(req: Request, res: Response): Promise<void> {
  const data = await adminService.beginAdminTotpEnrollment(req.user!.id)
  res.status(200).json(success(data, 'Scan the URI with your authenticator app'))
}

/** POST /api/v1/admin/me/totp/confirm — confirm enrollment with a 6-digit TOTP code. */
export async function postAdminTotpConfirm(req: Request, res: Response): Promise<void> {
  const body = adminTotpConfirmSchema.parse(req.body)
  const data = await adminService.confirmAdminTotpEnrollment(req.user!.id, body.code)
  res.status(200).json(success(data, 'Two-factor authentication enabled'))
}

/**
 * GET /api/v1/admin/users — paginated user directory.
 */
export async function listUsers(req: Request, res: Response): Promise<void> {
  const q = adminUserListQuerySchema.parse(req.query)
  const result = await adminService.listUsers(q)
  res.status(200).json(
    paginated({ users: result.users }, result.total, result.page, result.limit, 'OK'),
  )
}

/**
 * POST /api/v1/admin/users — create a user (phone XOR email, role, status).
 */
export async function createUser(req: Request, res: Response): Promise<void> {
  const body = createAdminUserSchema.parse(req.body)
  const data = await adminService.createUser(body)
  res.status(201).json(success(data, 'User created'))
}

/** POST /api/v1/admin/users/:id/totp/setup — begin authenticator enrollment for another user. */
export async function postUserTotpSetup(req: Request, res: Response): Promise<void> {
  const data = await adminService.beginAdminTotpEnrollment(req.params.id)
  res.status(200).json(success(data, 'Scan the QR code or URI with an authenticator app'))
}

/** POST /api/v1/admin/users/:id/totp/confirm — confirm enrollment with a 6-digit code. */
export async function postUserTotpConfirm(req: Request, res: Response): Promise<void> {
  const body = adminTotpConfirmSchema.parse(req.body)
  const data = await adminService.confirmAdminTotpEnrollment(req.params.id, body.code)
  res.status(200).json(success(data, 'Two-factor authentication enabled'))
}

/**
 * GET /api/v1/admin/users/:id — one user including soft-delete state.
 */
export async function getUser(req: Request, res: Response): Promise<void> {
  const data = await adminService.getUserById(req.params.id)
  res.status(200).json(success(data, 'OK'))
}

/**
 * PATCH /api/v1/admin/users/:id — update role, status, or onboarding step.
 */
export async function patchUser(req: Request, res: Response): Promise<void> {
  const body = patchAdminUserSchema.parse(req.body)
  const data = await adminService.updateUser(req.params.id, body)
  res.status(200).json(success(data, 'User updated'))
}

/**
 * DELETE /api/v1/admin/users/:id — soft-delete and revoke refresh tokens.
 */
export async function softDeleteUser(req: Request, res: Response): Promise<void> {
  const data = await adminService.softDeleteUser(req.params.id)
  res.status(200).json(success(data, 'User deactivated'))
}

/**
 * POST /api/v1/admin/users/:id/restore — undo soft-delete.
 */
export async function restoreUser(req: Request, res: Response): Promise<void> {
  const data = await adminService.restoreUser(req.params.id)
  res.status(200).json(success(data, 'User restored'))
}

/**
 * GET /api/v1/admin/workers — paginated directory with optional `kyc_status` and `search`.
 */
export async function listWorkers(req: Request, res: Response): Promise<void> {
  const q = adminWorkerListQuerySchema.parse(req.query)
  const result = await adminService.listWorkers(q)
  res.status(200).json(
    paginated({ workers: result.workers }, result.total, result.page, result.limit, 'OK'),
  )
}

/** POST /api/v1/admin/workers — create user + worker profile in one admin action. */
export async function createWorker(req: Request, res: Response): Promise<void> {
  const body = createAdminWorkerSchema.parse(req.body)
  const data = await adminService.createWorker(body)
  res.status(201).json(success(data, 'Worker created'))
}

/**
 * GET /api/v1/admin/workers/:id — full profile + linked user for one `wp_…` id.
 */
export async function getWorker(req: Request, res: Response): Promise<void> {
  const data = await adminService.getWorkerDetail(req.params.id, req.user?.id)
  res.status(200).json(success(data, 'OK'))
}

/**
 * PATCH /api/v1/admin/workers/:id/kyc — set KYC status and optional review note.
 */
export async function patchWorkerKyc(req: Request, res: Response): Promise<void> {
  const body = patchWorkerKycSchema.parse(req.body)
  const data = await adminService.updateWorkerKyc(req.params.id, body)
  res.status(200).json(success(data, 'KYC status updated'))
}

/** PATCH /api/v1/admin/workers/:id/profile — admin worker profile management. */
export async function patchWorkerProfile(req: Request, res: Response): Promise<void> {
  const body = patchAdminWorkerProfileSchema.parse(req.body)
  const data = await adminService.updateWorkerProfile(req.params.id, body)
  res.status(200).json(success(data, 'Worker profile updated'))
}

/** POST /api/v1/admin/workers/:id/rating — admin stars toward worker average. */
export async function rateWorker(req: Request, res: Response): Promise<void> {
  const body = adminRateWorkerSchema.parse(req.body)
  const data = await adminService.rateWorker(req.params.id, body.stars, req.user!.id)
  res.status(200).json(success(data, 'Worker rating saved'))
}

/** POST /api/v1/admin/workers/:id/documents — admin submits worker KYC document URL. */
export async function postWorkerDocument(req: Request, res: Response): Promise<void> {
  const body = adminAddWorkerDocumentSchema.parse(req.body)
  const data = await adminService.addWorkerDocument(req.params.id, body)
  res.status(201).json(success(data, 'Document submitted for review'))
}

export async function listWorkerQualifications(req: Request, res: Response): Promise<void> {
  const data = await adminService.listWorkerQualifications(req.params.id)
  res.status(200).json(success({ qualifications: data }, 'OK'))
}

export async function postWorkerQualification(req: Request, res: Response): Promise<void> {
  const body = adminAddWorkerQualificationSchema.parse(req.body)
  const data = await adminService.addWorkerQualification(req.params.id, body)
  res.status(201).json(success(data, 'Qualification added'))
}

export async function deleteWorkerQualification(req: Request, res: Response): Promise<void> {
  const data = await adminService.deleteWorkerQualification(req.params.id, req.params.qualificationId)
  res.status(200).json(success(data, 'Qualification removed'))
}

/** POST /api/v1/admin/workers/:id/uploads/presign — temporary URL for direct S3 upload. */
export async function postWorkerUploadPresign(req: Request, res: Response): Promise<void> {
  const body = adminPresignWorkerUploadSchema.parse(req.body)
  const data = await adminService.presignWorkerUpload(req.params.id, body)
  res.status(200).json(success(data, 'Upload URL created'))
}

/** POST /api/v1/admin/workers/:id/uploads/file — backend-managed S3 upload (no browser CORS to S3). */
export async function postWorkerUploadFile(req: Request, res: Response): Promise<void> {
  const kindRaw = String(req.body?.kind ?? '')
  const kind = kindRaw === 'worker_avatar' ? 'worker_avatar' : kindRaw === 'worker_document' ? 'worker_document' : null
  if (!kind) {
    res.status(400).json({ status: 'error', code: 'VALIDATION_ERROR', message: 'Invalid upload kind' })
    return
  }
  if (!req.file) {
    res.status(400).json({ status: 'error', code: 'VALIDATION_ERROR', message: 'File is required' })
    return
  }
  const data = await adminService.uploadWorkerFile(
    req.params.id,
    kind,
    req.file.originalname,
    req.file.mimetype || 'application/octet-stream',
    req.file.buffer,
  )
  res.status(201).json(success(data, 'File uploaded'))
}

export async function deleteWorkerUpload(req: Request, res: Response): Promise<void> {
  const body = adminDeleteWorkerUploadSchema.parse(req.body)
  const data = await adminService.deleteWorkerUpload(req.params.id, body)
  res.status(200).json(success(data, 'File removed'))
}

export async function patchWorkerDocument(req: Request, res: Response): Promise<void> {
  const body = adminReviewWorkerDocumentSchema.parse(req.body)
  const data = await adminService.reviewWorkerDocument(req.params.id, req.params.documentId, body)
  res.status(200).json(success(data, 'Document status updated'))
}

export async function deleteWorkerDocument(req: Request, res: Response): Promise<void> {
  const data = await adminService.deleteWorkerDocument(req.params.id, req.params.documentId)
  res.status(200).json(success(data, 'Document removed'))
}

/**
 * GET /api/v1/admin/employers — paginated employer list.
 */
export async function listEmployers(req: Request, res: Response): Promise<void> {
  const q = adminEmployerListQuerySchema.parse(req.query)
  const result = await adminService.listEmployers(q)
  res.status(200).json(
    paginated({ employers: result.employers }, result.total, result.page, result.limit, 'OK'),
  )
}

export async function createEmployer(req: Request, res: Response): Promise<void> {
  const body = createAdminEmployerSchema.parse(req.body)
  const data = await adminService.createEmployer(body)
  res.status(201).json(success(data, 'Employer created'))
}

export async function postEmployersBulkUpload(req: Request, res: Response): Promise<void> {
  if (!req.file) {
    res.status(400).json({ status: 'error', code: 'VALIDATION_ERROR', message: 'Excel file is required' })
    return
  }
  const data = await adminService.bulkCreateEmployersFromExcel(req.file.buffer)
  res.status(201).json(success(data, 'Bulk upload processed'))
}

export async function getEmployersBulkUploadSample(_req: Request, res: Response): Promise<void> {
  const buffer = adminService.buildEmployersBulkUploadSampleXlsx()
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', 'attachment; filename="employers_bulk_sample.xlsx"')
  res.status(200).send(buffer)
}

/**
 * GET /api/v1/admin/employers/:id — one employer profile by `emp_…` id.
 */
export async function getEmployer(req: Request, res: Response): Promise<void> {
  const data = await adminService.getEmployerDetail(req.params.id, req.user?.id)
  res.status(200).json(success(data, 'OK'))
}

/**
 * PATCH /api/v1/admin/employers/:id/verification — set `verified` true/false.
 */
export async function patchEmployerVerification(req: Request, res: Response): Promise<void> {
  const body = patchEmployerVerificationSchema.parse(req.body)
  const data = await adminService.updateEmployerVerification(req.params.id, body)
  res.status(200).json(success(data, 'Employer verification updated'))
}

export async function rateEmployer(req: Request, res: Response): Promise<void> {
  const body = adminRateEmployerSchema.parse(req.body)
  const data = await adminService.rateEmployer(req.params.id, body, req.user!.id)
  res.status(200).json(success(data, 'Employer rating saved'))
}

export async function patchEmployerProfile(req: Request, res: Response): Promise<void> {
  const body = patchAdminEmployerProfileSchema.parse(req.body)
  const data = await adminService.updateEmployerProfile(req.params.id, body)
  res.status(200).json(success(data, 'Employer profile updated'))
}

export async function deleteEmployer(req: Request, res: Response): Promise<void> {
  const body = deleteAdminEmployerSchema.parse(req.body)
  const data = await adminService.deleteEmployer(req.params.id, body)
  res.status(200).json(success(data, 'Employer deleted'))
}

export async function postEmployerUploadFile(req: Request, res: Response): Promise<void> {
  if (!req.file) {
    res.status(400).json({ status: 'error', code: 'VALIDATION_ERROR', message: 'File is required' })
    return
  }
  const data = await adminService.uploadEmployerLogo(
    req.params.id,
    req.file.originalname,
    req.file.mimetype || 'application/octet-stream',
    req.file.buffer,
  )
  res.status(201).json(success(data, 'Logo uploaded'))
}

export async function deleteEmployerUpload(req: Request, res: Response): Promise<void> {
  const body = adminDeleteEmployerUploadSchema.parse(req.body)
  const data = await adminService.deleteEmployerUpload(req.params.id, body)
  res.status(200).json(success(data, 'Logo removed'))
}

export async function listShifts(req: Request, res: Response): Promise<void> {
  const q = adminShiftListQuerySchema.parse(req.query)
  const result = await adminService.listShifts(q)
  res.status(200).json(paginated({ shifts: result.shifts }, result.total, result.page, result.limit, 'OK'))
}

export async function createShift(req: Request, res: Response): Promise<void> {
  const body = createAdminShiftSchema.parse(req.body)
  const data = await adminService.createShift(body)
  res.status(201).json(success(data, 'Shift created'))
}

export async function getShift(req: Request, res: Response): Promise<void> {
  const data = await adminService.getShiftDetailByAdmin(req.params.id)
  res.status(200).json(success(data, 'OK'))
}

export async function patchShift(req: Request, res: Response): Promise<void> {
  const body = patchAdminShiftSchema.parse(req.body)
  const data = await adminService.updateShift(req.params.id, body)
  res.status(200).json(success(data, 'Shift updated'))
}

export async function deleteShift(req: Request, res: Response): Promise<void> {
  const data = await adminService.deleteShift(req.params.id)
  res.status(200).json(success(data, 'Shift deleted'))
}

export async function listWorkerShiftHistory(req: Request, res: Response): Promise<void> {
  const data = await adminService.getWorkerShiftHistory(req.params.id)
  res.status(200).json(success({ history: data }, 'OK'))
}

export async function getApplicationDetail(req: Request, res: Response): Promise<void> {
  const data = await adminService.getApplicationDetail(req.params.id)
  res.status(200).json(success(data, 'OK'))
}

export async function listAllApplications(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10))
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '40'), 10)))
  const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined
  const search = typeof req.query.search === 'string' && req.query.search ? req.query.search : undefined
  const data = await adminService.listAllApplications({ status, search, page, limit })
  res.status(200).json(paginated(data.items, data.total, page, limit, 'OK'))
}

export async function listShiftApplications(req: Request, res: Response): Promise<void> {
  const data = await adminService.getShiftApplications(req.params.id)
  res.status(200).json(success({ applications: data }, 'OK'))
}

export async function patchShiftApplicationStatus(req: Request, res: Response): Promise<void> {
  const { status } = req.body as { status: string }
  const data = await adminService.patchShiftApplicationStatus(req.params.applicationId, status)
  res.status(200).json(success(data, 'Application updated'))
}

export async function listShiftCategories(_req: Request, res: Response): Promise<void> {
  const data = await adminService.listShiftCategories()
  res.status(200).json(success({ categories: data }, 'OK'))
}

/**
 * GET /api/v1/admin/timesheets — paginated queue with optional filters.
 */
export async function listTimesheets(req: Request, res: Response): Promise<void> {
  const q = adminTimesheetListQuerySchema.parse(req.query)
  const result = await adminService.listTimesheets(q)
  res.status(200).json(
    paginated({ timesheets: result.timesheets }, result.total, result.page, result.limit, 'OK'),
  )
}

/**
 * GET /api/v1/admin/timesheets/:id — detail with shift/worker/employer context.
 */
export async function getTimesheet(req: Request, res: Response): Promise<void> {
  const data = await adminService.getTimesheetDetail(req.params.id)
  res.status(200).json(success(data, 'OK'))
}

/**
 * POST /api/v1/admin/timesheets/:id/approve — approve a pending timesheet.
 */
export async function approveTimesheet(req: Request, res: Response): Promise<void> {
  const data = await adminService.approveTimesheet(req.params.id)
  res.status(200).json(success(data, 'Timesheet approved'))
}

/**
 * POST /api/v1/admin/timesheets/:id/rate-worker — record employer→worker stars (updates worker average).
 */
export async function rateWorkerTimesheet(req: Request, res: Response): Promise<void> {
  const body = timesheetRateWorkerSchema.parse(req.body)
  const data = await adminService.rateWorkerOnTimesheet(req.params.id, body)
  res.status(200).json(success(data, 'Worker rating saved'))
}

/** GET /api/v1/admin/platform-settings */
export async function getPlatformSettings(_req: Request, res: Response): Promise<void> {
  const data = await adminService.getPlatformSettings()
  res.status(200).json(success(data, 'OK'))
}

/** PATCH /api/v1/admin/platform-settings */
export async function patchPlatformSettings(req: Request, res: Response): Promise<void> {
  const body = patchPlatformSettingsSchema.parse(req.body)
  const data = await adminService.patchPlatformSettings(body)
  res.status(200).json(success(data, 'Settings saved'))
}
