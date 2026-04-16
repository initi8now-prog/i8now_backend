/* ═══════════════════════════════════════════════════════════════════════════
 *  admin.routes — mounts at `/api/v1/admin`
 *
 *  Every route runs `requireAuth` then `requireRole('admin')` once via `router.use`.
 *  Register `/timesheets/:id/approve` before `/timesheets/:id` so `approve` is not
 *  parsed as an id.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { Router } from 'express'
import multer from 'multer'
import * as adminController from './admin.controller.js'
import { requireAuth, requireRole } from '../auth/auth.middleware.js'
import { asyncHandler } from '../../utils/asyncHandler.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

router.use(requireAuth, requireRole('admin'))

router.get('/me', asyncHandler(adminController.getAdminMe))
router.patch('/me/account', asyncHandler(adminController.patchAdminMeAccount))
router.get('/overview', asyncHandler(adminController.getOverviewDashboard))
router.post('/me/totp/setup', asyncHandler(adminController.postAdminTotpSetup))
router.post('/me/totp/confirm', asyncHandler(adminController.postAdminTotpConfirm))

router.get('/platform-settings', asyncHandler(adminController.getPlatformSettings))
router.patch('/platform-settings', asyncHandler(adminController.patchPlatformSettings))

router.get('/users', asyncHandler(adminController.listUsers))
router.post('/users', asyncHandler(adminController.createUser))
router.post('/users/:id/totp/setup', asyncHandler(adminController.postUserTotpSetup))
router.post('/users/:id/totp/confirm', asyncHandler(adminController.postUserTotpConfirm))
router.post('/users/:id/restore', asyncHandler(adminController.restoreUser))
router.get('/users/:id', asyncHandler(adminController.getUser))
router.patch('/users/:id', asyncHandler(adminController.patchUser))
router.delete('/users/:id', asyncHandler(adminController.softDeleteUser))

router.get('/workers', asyncHandler(adminController.listWorkers))
router.post('/workers', asyncHandler(adminController.createWorker))
router.get('/workers/:id/shift-history', asyncHandler(adminController.listWorkerShiftHistory))
router.get('/workers/:id', asyncHandler(adminController.getWorker))
router.patch('/workers/:id/profile', asyncHandler(adminController.patchWorkerProfile))
router.patch('/workers/:id/kyc', asyncHandler(adminController.patchWorkerKyc))
router.post('/workers/:id/rating', asyncHandler(adminController.rateWorker))
router.get('/workers/:id/qualifications', asyncHandler(adminController.listWorkerQualifications))
router.post('/workers/:id/qualifications', asyncHandler(adminController.postWorkerQualification))
router.delete('/workers/:id/qualifications/:qualificationId', asyncHandler(adminController.deleteWorkerQualification))
router.post('/workers/:id/documents', asyncHandler(adminController.postWorkerDocument))
router.post('/workers/:id/uploads/presign', asyncHandler(adminController.postWorkerUploadPresign))
router.post('/workers/:id/uploads/file', upload.single('file'), asyncHandler(adminController.postWorkerUploadFile))
router.delete('/workers/:id/uploads/file', asyncHandler(adminController.deleteWorkerUpload))
router.patch('/workers/:id/documents/:documentId', asyncHandler(adminController.patchWorkerDocument))
router.delete('/workers/:id/documents/:documentId', asyncHandler(adminController.deleteWorkerDocument))

router.get('/employers', asyncHandler(adminController.listEmployers))
router.post('/employers', asyncHandler(adminController.createEmployer))
router.post('/employers/bulk-upload', upload.single('file'), asyncHandler(adminController.postEmployersBulkUpload))
router.get('/employers/bulk-upload/sample', asyncHandler(adminController.getEmployersBulkUploadSample))
router.get('/employers/:id', asyncHandler(adminController.getEmployer))
router.patch('/employers/:id/verification', asyncHandler(adminController.patchEmployerVerification))
router.post('/employers/:id/rating', asyncHandler(adminController.rateEmployer))
router.patch('/employers/:id/profile', asyncHandler(adminController.patchEmployerProfile))
router.post('/employers/:id/uploads/logo', upload.single('file'), asyncHandler(adminController.postEmployerUploadFile))
router.delete('/employers/:id/uploads/logo', asyncHandler(adminController.deleteEmployerUpload))
router.delete('/employers/:id', asyncHandler(adminController.deleteEmployer))

router.get('/applications', asyncHandler(adminController.listAllApplications))
router.get('/applications/:id', asyncHandler(adminController.getApplicationDetail))

router.get('/shifts', asyncHandler(adminController.listShifts))
router.get('/shifts-categories', asyncHandler(adminController.listShiftCategories))
router.post('/shifts', asyncHandler(adminController.createShift))
router.get('/shifts/:id/applications', asyncHandler(adminController.listShiftApplications))
router.patch('/shifts/:id/applications/:applicationId', asyncHandler(adminController.patchShiftApplicationStatus))
router.get('/shifts/:id', asyncHandler(adminController.getShift))
router.patch('/shifts/:id', asyncHandler(adminController.patchShift))
router.delete('/shifts/:id', asyncHandler(adminController.deleteShift))

router.get('/timesheets', asyncHandler(adminController.listTimesheets))
router.post('/timesheets/:id/approve', asyncHandler(adminController.approveTimesheet))
router.post('/timesheets/:id/rate-worker', asyncHandler(adminController.rateWorkerTimesheet))
router.get('/timesheets/:id', asyncHandler(adminController.getTimesheet))

export { router as adminRouter }
