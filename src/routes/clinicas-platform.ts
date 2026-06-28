import { Router, Request, Response } from 'express';
import { ClinicasPlatformController } from '../controllers/clinicas-platform.controller.js';
import { ParametrosClinicasPlatformController } from '../controllers/parametros-clinicas-platform.controller.js';
import { platformAdminSecurityMiddleware } from '../middleware/security.js';

const router = Router();
const ctrl = new ClinicasPlatformController();
const paramCtrl = new ParametrosClinicasPlatformController();

router.get('/planes-catalogo', ...platformAdminSecurityMiddleware, (req: Request, res: Response) =>
  ctrl.planesCatalogo(req, res)
);
router.get('/dashboard-stats', ...platformAdminSecurityMiddleware, (req: Request, res: Response) =>
  ctrl.dashboardStats(req, res)
);
router.post('/planes', ...platformAdminSecurityMiddleware, (req: Request, res: Response) =>
  ctrl.createPlanComparativo(req, res)
);
router.put('/planes/:planId', ...platformAdminSecurityMiddleware, (req: Request<{ planId: string }>, res: Response) =>
  ctrl.updatePlanComparativo(req, res)
);
router.delete('/planes/:planId', ...platformAdminSecurityMiddleware, (req: Request<{ planId: string }>, res: Response) =>
  ctrl.deletePlanComparativo(req, res)
);

/** Límites contractuales por clínica (`parametros_clinicas`). Rutas específicas antes de `/:id`. */
router.get('/parametros-clinicas', ...platformAdminSecurityMiddleware, (req: Request, res: Response) =>
  paramCtrl.list(req, res)
);
router.get('/parametros-clinicas/:id', ...platformAdminSecurityMiddleware, (req: Request<{ id: string }>, res: Response) =>
  paramCtrl.getById(req, res)
);
router.post('/parametros-clinicas', ...platformAdminSecurityMiddleware, (req: Request, res: Response) =>
  paramCtrl.create(req, res)
);
router.put('/parametros-clinicas/:id', ...platformAdminSecurityMiddleware, (req: Request<{ id: string }>, res: Response) =>
  paramCtrl.update(req, res)
);
router.delete('/parametros-clinicas/:id', ...platformAdminSecurityMiddleware, (req: Request<{ id: string }>, res: Response) =>
  paramCtrl.remove(req, res)
);

router.get('/:id/usuarios', ...platformAdminSecurityMiddleware, (req: Request<{ id: string }>, res: Response) =>
  ctrl.usuariosByClinica(req, res)
);
router.post('/:id/usuarios', ...platformAdminSecurityMiddleware, (req: Request<{ id: string }>, res: Response) =>
  ctrl.createUsuarioClinica(req, res)
);
router.patch(
  '/:clinicaId/usuarios/:userId',
  ...platformAdminSecurityMiddleware,
  (req: Request<{ clinicaId: string; userId: string }>, res: Response) => ctrl.patchUsuarioClinica(req, res)
);
router.put(
  '/:clinicaId/usuarios/:userId/password',
  ...platformAdminSecurityMiddleware,
  (req: Request<{ clinicaId: string; userId: string }>, res: Response) => ctrl.putUsuarioPassword(req, res)
);
router.get('/', ...platformAdminSecurityMiddleware, (req: Request, res: Response) => ctrl.list(req, res));
router.post('/', ...platformAdminSecurityMiddleware, (req: Request, res: Response) => ctrl.create(req, res));
router.put('/:id', ...platformAdminSecurityMiddleware, (req: Request<{ id: string }>, res: Response) =>
  ctrl.update(req, res)
);

export default router;
