import express from 'express';
import Joi from 'joi';
import { authenticateToken } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';
import { UserPreferencesController } from '../controllers/user-preferences.controller.js';

const router = express.Router();
const controller = new UserPreferencesController();

// Todas las rutas bajo /users requieren autenticación
router.use(authenticateToken);

const schemas = {
  updatePreference: Joi.object({
    key: Joi.string().trim().max(100).required(),
    value: Joi.any().required()
  })
};

// GET /api/v1/users/me/preferences
router.get('/me/preferences', (req, res) => controller.getMyPreferences(req, res));

// PUT /api/v1/users/me/preferences
router.put('/me/preferences', validateRequest(schemas.updatePreference), (req, res) => controller.updateMyPreference(req, res));

export default router;


