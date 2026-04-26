import express from 'express';
import { PlantillaHistoriaController } from '../controllers/plantilla-historia.controller.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const plantillaHistoriaController = new PlantillaHistoriaController();

// Aplicar middleware de autenticación a todas las rutas
router.use(authenticateToken);

/**
 * @route GET /api/v1/plantillas-historias
 * @desc Obtiene todas las plantillas del médico autenticado
 * @access Private (Médico)
 */
router.get('/', (req, res) => plantillaHistoriaController.obtenerPlantillas(req, res));

/**
 * @route GET /api/v1/plantillas-historias/:id
 * @desc Obtiene una plantilla por su ID
 * @access Private (Médico)
 */
router.get('/:id', (req, res) => plantillaHistoriaController.obtenerPlantillaPorId(req, res));

/**
 * @route POST /api/v1/plantillas-historias
 * @desc Crea una nueva plantilla
 * @access Private (Médico)
 */
router.post('/', (req, res) => plantillaHistoriaController.crearPlantilla(req, res));

/**
 * @route PUT /api/v1/plantillas-historias/:id
 * @desc Actualiza una plantilla existente
 * @access Private (Médico)
 */
router.put('/:id', (req, res) => plantillaHistoriaController.actualizarPlantilla(req, res));

/**
 * @route DELETE /api/v1/plantillas-historias/:id
 * @desc Elimina una plantilla (soft delete)
 * @access Private (Médico)
 */
router.delete('/:id', (req, res) => plantillaHistoriaController.eliminarPlantilla(req, res));

export default router;

