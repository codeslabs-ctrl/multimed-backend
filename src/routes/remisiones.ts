import express from 'express';
import { RemisionController } from '../controllers/remision.controller.js';

const router = express.Router();
const remisionController = new RemisionController();

// Remisión routes
router.get('/', (req, res) => remisionController.getAllRemisiones(req, res));
router.get('/statistics', (req, res) => remisionController.getRemisionesStatistics(req, res));
router.get('/by-medico', (req, res) => remisionController.getRemisionesByMedico(req, res));
router.get('/by-paciente/:paciente_id', (req, res) => remisionController.getRemisionesByPaciente(req, res));
router.get('/by-status', (req, res) => remisionController.getRemisionesByStatus(req, res));
router.get('/:id', (req, res) => remisionController.getRemisionById(req, res));
router.post('/', (req, res) => remisionController.createRemision(req, res));
router.put('/:id/status', (req, res) => remisionController.updateRemisionStatus(req, res));

export default router;
