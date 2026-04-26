import express from 'express';
import { EspecialidadController } from '../controllers/especialidad.controller.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const especialidadController = new EspecialidadController();

router.use(authenticateToken);

// Especialidad routes
router.get('/', (req, res) => especialidadController.getAllEspecialidades(req, res));
router.get('/search', (req, res) => especialidadController.searchEspecialidades(req, res));
router.get('/:id', (req, res) => especialidadController.getEspecialidadById(req, res));
router.post('/', (req, res) => especialidadController.createEspecialidad(req, res));
router.put('/:id', (req, res) => especialidadController.updateEspecialidad(req, res));
router.delete('/:id', (req, res) => especialidadController.deleteEspecialidad(req, res));

export default router;
