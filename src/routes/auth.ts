import express from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { validateRequest } from '../middleware/validation.js';
import { authenticateToken } from '../middleware/auth.js';
import { 
  authSecurityMiddleware,
  validateLogin
} from '../middleware/security.js';
import Joi from 'joi';

const router = express.Router();
const authController = new AuthController();

// Validation schemas for auth endpoints
const authSchemas = {
  login: Joi.object({
    username: Joi.string().required(),
    password: Joi.string().required()
  }),
  
  regenerateOTP: Joi.object({
    email: Joi.string().email().required()
  }),
  
  changePassword: Joi.object({
    currentPassword: Joi.string().optional().allow(''),
    newPassword: Joi.string().min(6).required(),
    isFirstLogin: Joi.boolean().optional()
  })
};

// Auth routes con middlewares de seguridad
router.post('/login', (req, _res, next) => {
  console.log('📥 Petición de login recibida');
  console.log('📋 Headers:', JSON.stringify(req.headers, null, 2));
  console.log('📋 Body:', JSON.stringify(req.body, null, 2));
  next();
}, validateLogin, (req, res) => authController.login(req, res));

router.get('/mis-clinicas', authenticateToken, (req, res) => authController.listMisClinicas(req, res));
router.post('/switch-clinica', authenticateToken, (req, res) => authController.switchClinica(req, res));

router.post('/regenerate-otp', validateRequest(authSchemas.regenerateOTP), (req, res) => authController.regenerateOTP(req, res));
router.post('/change-password', authSecurityMiddleware, validateRequest(authSchemas.changePassword), (req: any, res: any) => authController.changePassword(req, res));

// Debug endpoint to check current user role
router.get('/debug-user', authSecurityMiddleware, (req: any, res: any) => {
  res.json({
    success: true,
    data: {
      user: req.user,
      role: req.user?.rol,
      userId: req.user?.userId,
      medico_id: req.user?.medico_id
    }
  });
});

export default router;
