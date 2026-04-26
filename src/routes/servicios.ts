import express from 'express';
import { adminSecurityMiddleware } from '../middleware/security.js';
import serviciosController from '../controllers/servicios.controller.js';

const router = express.Router();

// =====================================================
// RUTAS DE SERVICIOS (Solo Administradores)
// =====================================================

// GET /api/v1/servicios - Listar servicios
router.get('/', adminSecurityMiddleware, (req: any, res: any) => 
  serviciosController.getServicios(req, res)
);

// GET /api/v1/servicios/:id - Obtener servicio por ID
router.get('/:id', adminSecurityMiddleware, (req: any, res: any) => 
  serviciosController.getServicioById(req, res)
);

// POST /api/v1/servicios - Crear servicio
router.post('/', adminSecurityMiddleware, (req: any, res: any) => 
  serviciosController.createServicio(req, res)
);

// PUT /api/v1/servicios/:id - Actualizar servicio
router.put('/:id', adminSecurityMiddleware, (req: any, res: any) => 
  serviciosController.updateServicio(req, res)
);

// DELETE /api/v1/servicios/:id - Eliminar servicio
router.delete('/:id', adminSecurityMiddleware, (req: any, res: any) => 
  serviciosController.deleteServicio(req, res)
);

// GET /api/v1/servicios/por-especialidad/:especialidad_id - Servicios por especialidad (Admin)
router.get('/por-especialidad/:especialidad_id', adminSecurityMiddleware, (req: any, res: any) => 
  serviciosController.getServiciosPorEspecialidad(req, res)
);

// GET /api/v1/servicios/especialidad/:especialidad_id - Servicios por especialidad (Secretaria/Admin)
router.get('/especialidad/:especialidad_id', (req: any, res: any) => 
  serviciosController.getServiciosPorEspecialidad(req, res)
);

export default router;
