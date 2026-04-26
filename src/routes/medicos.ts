import express, { Request, Response } from 'express';
import { MedicoController } from '../controllers/medico.controller.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  eliminarMedicoSecurityMiddleware,
  gestionMedicosSecurityMiddleware,
  rejectPlataformaEnOperativaClinica
} from '../middleware/security.js';

const router = express.Router();
const medicoController = new MedicoController();

// Operativa de clínica: el superadmin de plataforma no usa estas rutas
router.get('/', authenticateToken, rejectPlataformaEnOperativaClinica, (req, res) =>
  medicoController.getAllMedicos(req, res)
);
router.get('/search', authenticateToken, rejectPlataformaEnOperativaClinica, (req, res) =>
  medicoController.searchMedicos(req, res)
);
router.get('/check-email', authenticateToken, rejectPlataformaEnOperativaClinica, (req, res) =>
  medicoController.checkEmailParaMedico(req, res)
);
router.get(
  '/by-especialidad/:especialidadId',
  authenticateToken,
  rejectPlataformaEnOperativaClinica,
  (req: Request<{ especialidadId: string }>, res: Response) =>
    medicoController.getMedicosByEspecialidad(req, res)
);
router.get('/:id', authenticateToken, rejectPlataformaEnOperativaClinica, (req: Request<{ id: string }>, res: Response) =>
  medicoController.getMedicoById(req, res)
);
router.post('/', gestionMedicosSecurityMiddleware, (req: Request, res: Response) =>
  medicoController.createMedico(req, res)
);
router.put('/:id', gestionMedicosSecurityMiddleware, (req: Request<{ id: string }>, res: Response) =>
  medicoController.updateMedico(req, res)
);
router.delete('/:id', eliminarMedicoSecurityMiddleware, (req: Request<{ id: string }>, res: Response) =>
  medicoController.deleteMedico(req, res)
);

export default router;
