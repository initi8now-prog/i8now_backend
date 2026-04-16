/* ═══════════════════════════════════════════════════════════════════════════
 *  auth.routes — maps URLs under /api/v1/auth to controller functions
 *
 *  asyncHandler = catches promise rejections and forwards them to error middleware
 *  so you never forget try/catch in every route.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { Router } from 'express'
import * as authController from './auth.controller.js'
import { asyncHandler } from '../../utils/asyncHandler.js'

const router = Router()

router.get('/login-ui', asyncHandler(authController.getLoginUiSettings))
router.post('/request-otp', asyncHandler(authController.requestOtp))
router.post('/login-password', asyncHandler(authController.loginPassword))
router.post('/verify-otp', asyncHandler(authController.verifyOtp))
router.post('/verify-admin-totp', asyncHandler(authController.verifyAdminTotp))
router.post('/refresh-token', asyncHandler(authController.refreshToken))

export { router as authRouter }
