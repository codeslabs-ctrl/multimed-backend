import { Router } from 'express';
import { ClinicaController } from '../controllers/clinica.controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { rejectPlataformaEnOperativaClinica, requireRole } from '../middleware/security.js';

const router = Router();
const clinicaController = new ClinicaController();

/** Catálogo para formularios de alta de médico: admin de clínica o secretaría (no plataforma). */
const catalogoMiddleware = [
  authenticateToken,
  rejectPlataformaEnOperativaClinica,
  requireRole(['administrador_clinica', 'secretaria'])
];

router.get('/', ...catalogoMiddleware, (req, res) => clinicaController.listCatalogo(req, res));

/** Marca / logo de la clínica del usuario autenticado (navbar). */
router.get('/context', authenticateToken, (req, res) => clinicaController.getContextForUser(req, res));

export default router;
