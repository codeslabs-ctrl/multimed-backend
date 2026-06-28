import { Router } from 'express';
import { ContextualDataController } from '../controllers/contextual-data.controller';
import { authenticateToken } from '../middleware/auth';
import { verifyClinica } from '../middleware/clinica.middleware';

const router = Router();
const contextualDataController = new ContextualDataController();

// Aplicar middleware de autenticación y clínica a todas las rutas
router.use(authenticateToken);
router.use(verifyClinica);

/**
 * @route GET /api/v1/contextual-data/:pacienteId/:medicoId
 * @desc Obtiene datos contextuales completos para un informe médico
 * @access Private
 */
router.get('/:pacienteId/:medicoId', contextualDataController.obtenerDatosContextuales);

/**
 * @route GET /api/v1/contextual-data/basicos/:pacienteId/:medicoId
 * @desc Obtiene datos contextuales básicos (solo paciente y médico)
 * @access Private
 */
router.get('/basicos/:pacienteId/:medicoId', contextualDataController.obtenerDatosBasicos);

/**
 * @route GET /api/v1/contextual-data/historial/:pacienteId/:medicoId
 * @desc Obtiene historial de consultas entre paciente y médico
 * @access Private
 */
router.get('/historial/:pacienteId/:medicoId', contextualDataController.obtenerHistorialConsultas);

export default router;
