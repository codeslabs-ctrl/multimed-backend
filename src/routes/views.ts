import { Router } from 'express';
import { ViewsController } from '../controllers/views.controller.js';

const router = Router();

// Rutas para estadísticas y vistas
router.get('/estadisticas-especialidad', ViewsController.getEstadisticasEspecialidad);
router.get('/medicos-completa', ViewsController.getMedicosCompleta);

export default router;
