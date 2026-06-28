import express from 'express';
import { PatientController } from '../controllers/patient.controller.js';
// import { authenticateToken } from '../middleware/auth.js';
import { 
  medicoSecretariaMiddleware,
  adminSecurityMiddleware,
  validatePaciente,
  validatePacienteUpdate
} from '../middleware/security.js';

const router = express.Router();
const patientController = new PatientController();

// Patient routes con middlewares de seguridad
router.get('/', medicoSecretariaMiddleware, (req: any, res: any) => patientController.getAllPatients(req, res));
router.get('/statistics', medicoSecretariaMiddleware, (req: any, res: any) => patientController.getPatientStatistics(req, res));
router.get('/stats', medicoSecretariaMiddleware, (req: any, res: any) => patientController.getPatientsByMedicoForStats(req, res));
router.get('/stats-test', (req: any, res: any) => patientController.getPatientsByMedicoForStats(req, res));
router.get('/admin-stats', adminSecurityMiddleware, (req: any, res: any) => patientController.getAdminStats(req, res));
router.get('/search', medicoSecretariaMiddleware, (req: any, res: any) => patientController.searchPatients(req, res));
router.get('/search-cedula', medicoSecretariaMiddleware, (req: any, res: any) => patientController.searchPatientsByCedula(req, res));
router.get('/search-telefono', medicoSecretariaMiddleware, (req: any, res: any) => patientController.searchPatientsByTelefono(req, res));
router.get('/search-by-patologia', medicoSecretariaMiddleware, (req: any, res: any) => patientController.searchPatientsByPatologia(req, res));
router.get('/age-range', medicoSecretariaMiddleware, (req: any, res: any) => patientController.getPatientsByAgeRange(req, res));
router.get('/check-email', medicoSecretariaMiddleware, (req: any, res: any) => patientController.checkEmailAvailability(req, res));
router.get('/check-telefono', medicoSecretariaMiddleware, (req: any, res: any) => patientController.checkTelefonoAvailability(req, res));
router.get('/check-cedula', medicoSecretariaMiddleware, (req: any, res: any) => patientController.checkCedulaAvailability(req, res));
router.get('/email/:email', medicoSecretariaMiddleware, (req: any, res: any) => patientController.getPatientByEmail(req, res));
router.get(
  '/mi-activos-ultima-consulta',
  medicoSecretariaMiddleware,
  (req: any, res: any) => patientController.getMyActivePatientsLastConsulta(req as any, res)
);
router.get('/by-medico/:medicoId', medicoSecretariaMiddleware, (req: any, res: any) => patientController.getPatientsByMedico(req as any, res));
router.get('/by-medico/:medicoId/stats', medicoSecretariaMiddleware, (req: any, res: any) => patientController.getPatientsByMedicoForStats(req as any, res));
router.get('/test', (req: any, res: any) => patientController.testEndpoint(req, res));
router.get('/test-function/:medicoId', (req: any, res: any) => patientController.testFunction(req as any, res));
router.get('/test-historico/:medicoId', (req: any, res: any) => patientController.testHistorico(req as any, res));
router.get('/:id/antecedentes', medicoSecretariaMiddleware, (req: any, res: any) => patientController.getAntecedentes(req, res));
router.put('/:id/antecedentes', medicoSecretariaMiddleware, (req: any, res: any) => patientController.saveAntecedentes(req, res));
router.get('/:id', medicoSecretariaMiddleware, (req: any, res: any) => patientController.getPatientById(req, res));
router.post('/', medicoSecretariaMiddleware, validatePaciente, (req: any, res: any) => patientController.createPatient(req, res));
router.post('/:id/link-medico', medicoSecretariaMiddleware, (req: any, res: any) =>
  patientController.linkPatientToMedicoHistorial(req, res)
);
router.put('/:id', medicoSecretariaMiddleware, validatePacienteUpdate, (req: any, res: any) => patientController.updatePatient(req, res));
router.delete('/:id', adminSecurityMiddleware, (req: any, res: any) => patientController.deletePatient(req, res));

// Verificar si un paciente tiene consultas
router.get('/:id/has-consultations', medicoSecretariaMiddleware, (req: any, res: any) => patientController.hasConsultations(req, res));

// Cambiar estado activo/inactivo del paciente
router.patch('/:id/toggle-status', medicoSecretariaMiddleware, (req: any, res: any) => patientController.togglePatientStatus(req, res));

export default router;
