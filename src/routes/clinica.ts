import { Router } from 'express';
import { ClinicaController } from '../controllers/clinica.controller';
import { verifyClinica } from '../middleware/clinica.middleware';
import { authenticateToken } from '../middleware/auth';

const router = Router();
const clinicaController = new ClinicaController();

// Aplicar middleware de clínica a todas las rutas
router.use(verifyClinica);

// Rutas públicas (no requieren autenticación)
router.get('/info', clinicaController.getCurrentClinica);
router.get('/medicos', clinicaController.getMedicosByClinica);
router.get('/especialidades', clinicaController.getEspecialidadesByClinica);

// Rutas que requieren autenticación
router.get('/verify/medico/:medicoId', authenticateToken, clinicaController.verifyMedicoClinica);
router.get('/verify/especialidad/:especialidadId', authenticateToken, clinicaController.verifyEspecialidadClinica);

// Rutas de administración (solo para administradores)
router.post('/asignar/medico', authenticateToken, clinicaController.asignarMedicoClinica);
router.post('/asignar/especialidad', authenticateToken, clinicaController.asignarEspecialidadClinica);

export default router;
