import express, { Request, Response, NextFunction } from 'express';
import { ClinicaAtencionController } from '../controllers/clinica-atencion.controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { adminSecurityMiddleware } from '../middleware/security.js';
import {
  uploadClinicaAtencionLogoInformes,
  uploadClinicaAtencionLogoReceta
} from '../middleware/upload.middleware.js';

const router = express.Router();
const controller = new ClinicaAtencionController();

const runMulter = (uploader: { single: (field: string) => (req: Request, res: Response, next: NextFunction) => void }, field: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    uploader.single(field)(req, res, (err) => {
      if (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(400).json({ success: false, error: { message: message || 'Error al subir archivo' } });
        return;
      }
      next();
    });
  };
};

// Listado (para dropdown): cualquier usuario autenticado
router.get('/', authenticateToken, (req: Request, res: Response) => controller.list(req, res));

// Logos: guardan en assets/logo/clinica/{id}/ y actualizan la fila (antes de GET :id genérico por claridad)
router.post(
  '/:id/logos/informes',
  ...adminSecurityMiddleware,
  runMulter(uploadClinicaAtencionLogoInformes, 'archivo'),
  (req: Request, res: Response) => {
    void controller.uploadLogoInformes(req, res);
  }
);
router.post(
  '/:id/logos/recetas',
  ...adminSecurityMiddleware,
  runMulter(uploadClinicaAtencionLogoReceta, 'archivo'),
  (req: Request, res: Response) => {
    void controller.uploadLogoReceta(req, res);
  }
);

router.get('/:id', authenticateToken, (req: Request, res: Response) => controller.getById(req, res));

// CRUD completo: solo administrador
router.post('/', ...adminSecurityMiddleware, (req: Request, res: Response) => controller.create(req, res));
router.put('/:id', ...adminSecurityMiddleware, (req: Request, res: Response) => controller.update(req, res));
router.delete('/:id', ...adminSecurityMiddleware, (req: Request, res: Response) => controller.delete(req, res));

export default router;
