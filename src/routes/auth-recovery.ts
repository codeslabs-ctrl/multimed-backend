import { Router } from 'express';
import { AuthRecoveryController } from '../controllers/auth-recovery.controller.js';

const router = Router();

// Solicitar recuperación de contraseña
router.post('/password-recovery', AuthRecoveryController.requestPasswordRecovery);

// Verificar OTP y cambiar contraseña
router.post('/verify-otp', AuthRecoveryController.verifyOTPAndResetPassword);

// Enviar OTP de verificación para usuario nuevo
router.post('/send-verification', AuthRecoveryController.sendUserVerificationOTP);

// Verificar OTP de usuario nuevo
router.post('/verify-user', AuthRecoveryController.verifyUserOTP);

// Resetear contraseña con OTP
router.post('/reset-password', AuthRecoveryController.resetPassword);

export default router;
