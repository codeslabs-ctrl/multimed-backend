import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { verifyClinica } from '../middleware/clinica.middleware';
import { 
  verificarFirmaDigital, 
  noRequerirFirmaDigital,
  verificarIntegridadFirma,
  registrarAuditoriaFirma,
  validarCertificadoDigital,
  verificarPermisosFirma
} from '../middleware/firma-digital.middleware';
import { 
  medicoSecretariaMiddleware,
  adminSecurityMiddleware,
  validateInforme,
  validateInformeUpdate
} from '../middleware/security';
import informeMedicoController from '../controllers/informe-medico.controller';

const router = Router();

// Aplicar middleware de autenticación y clínica a todas las rutas
router.use(authenticateToken);
router.use(verifyClinica);

// =====================================================
// INFORMES MÉDICOS
// =====================================================

// Crear nuevo informe médico (solo médicos y admins)
router.post('/', medicoSecretariaMiddleware, validateInforme, informeMedicoController.crearInforme);

// Obtener lista de informes médicos (médicos y admins)
router.get('/', medicoSecretariaMiddleware, informeMedicoController.obtenerInformes);

// Obtener informe médico por ID (médicos y admins)
router.get('/:id', medicoSecretariaMiddleware, verificarFirmaDigital, informeMedicoController.obtenerInformePorId);

// Actualizar informe médico (solo si no está firmado) (médicos y admins)
router.put('/:id', medicoSecretariaMiddleware, verificarFirmaDigital, noRequerirFirmaDigital, validateInformeUpdate, informeMedicoController.actualizarInforme);

// Eliminar informe médico (solo admins)
router.delete('/:id', adminSecurityMiddleware, informeMedicoController.eliminarInforme);

// =====================================================
// TEMPLATES DE INFORMES
// =====================================================

// Obtener templates de informes (médicos y admins)
router.get('/templates/list', medicoSecretariaMiddleware, informeMedicoController.obtenerTemplates);

// Crear nuevo template de informe (solo admins)
router.post('/templates', adminSecurityMiddleware, informeMedicoController.crearTemplate);

// Obtener template por ID (médicos y admins)
router.get('/templates/:id', medicoSecretariaMiddleware, informeMedicoController.obtenerTemplate);

// Actualizar template (solo admins)
router.put('/templates/:id', adminSecurityMiddleware, informeMedicoController.actualizarTemplate);

// Eliminar template (solo admins)
router.delete('/templates/:id', adminSecurityMiddleware, informeMedicoController.eliminarTemplate);

// =====================================================
// ANEXOS
// =====================================================

// Obtener anexos de un informe (médicos y admins)
router.get('/:informeId/anexos', medicoSecretariaMiddleware, informeMedicoController.obtenerAnexosPorInforme);

// Agregar anexo a un informe (médicos y admins)
router.post('/:informeId/anexos', medicoSecretariaMiddleware, informeMedicoController.agregarAnexo);

// Eliminar anexo de un informe (médicos y admins)
router.delete('/anexos/:anexoId', medicoSecretariaMiddleware, informeMedicoController.eliminarAnexo);

// =====================================================
// ENVÍOS
// =====================================================

// Obtener envíos de un informe (médicos y admins)
router.get('/:informeId/envios', medicoSecretariaMiddleware, informeMedicoController.obtenerEnviosPorInforme);

// Enviar informe a paciente (médicos y admins)
router.post('/:informeId/enviar', medicoSecretariaMiddleware, informeMedicoController.enviarInforme);

// =====================================================
// FIRMA DIGITAL
// =====================================================

// Firmar informe digitalmente
router.post('/:id/firmar', 
  verificarFirmaDigital, 
  noRequerirFirmaDigital, 
  validarCertificadoDigital, 
  verificarPermisosFirma, 
  informeMedicoController.firmarInforme
);

// Verificar firma digital de un informe
router.get('/:id/verificar-firma', 
  verificarFirmaDigital, 
  verificarIntegridadFirma, 
  registrarAuditoriaFirma, 
  informeMedicoController.verificarFirmaDigital
);

// =====================================================
// ESTADÍSTICAS
// =====================================================

// Obtener estadísticas de informes
router.get('/estadisticas/general', informeMedicoController.obtenerEstadisticas);

// Obtener estadísticas por médico
router.get('/estadisticas/medico', informeMedicoController.obtenerEstadisticasPorMedico);

// Obtener estadísticas de todos los médicos
router.get('/estadisticas/medicos', informeMedicoController.obtenerEstadisticasTodosMedicos);

export default router;
