import express from 'express';
import { PlanesController } from '../controllers/planes.controller.js';
import { SolicitudesDemoController } from '../controllers/solicitudes-demo.controller.js';

const router = express.Router();

// Rutas públicas (sin autenticación) para la página de login
router.get('/comparativa', (req, res) => PlanesController.getPlanesComparativa(req, res));
router.get('/addons', (req, res) => PlanesController.getAddonsProgresivos(req, res));
router.post('/solicitud-demo', (req, res) => SolicitudesDemoController.create(req, res));

export default router;
