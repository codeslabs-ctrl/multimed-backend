import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { requireAdminRole } from '../middleware/roleAuth.js';
import menuController from '../controllers/menu.controller.js';

const router = express.Router();

// Rutas públicas (para obtener menú según perfil del usuario autenticado)
router.get('/perfil/:perfilNombre', authenticateToken, (req, res) => 
  menuController.getMenuByPerfil(req, res)
);

// Rutas de administración (solo admin)
router.get('/items', authenticateToken, requireAdminRole, (req, res) => 
  menuController.getMenuItems(req, res)
);

router.get('/perfiles', authenticateToken, requireAdminRole, (req, res) => 
  menuController.getPerfiles(req, res)
);

router.get('/perfiles/:perfilId/permisos', authenticateToken, requireAdminRole, (req, res) => 
  menuController.getPermisosByPerfil(req, res)
);

router.put('/perfiles/:perfilId/permisos/:menuItemId', authenticateToken, requireAdminRole, (req, res) => 
  menuController.updatePermisos(req, res)
);

router.put('/perfiles/:perfilId/permisos', authenticateToken, requireAdminRole, (req, res) => 
  menuController.updatePermisosBulk(req, res)
);

export default router;

