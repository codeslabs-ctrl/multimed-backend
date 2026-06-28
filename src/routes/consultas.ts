import express from 'express';
import { ConsultaController } from '../controllers/consulta.controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { medicoSecretariaMiddleware } from '../middleware/security.js';
import finalizarConsultaController from '../controllers/finalizar-consulta.controller.js';

const router = express.Router();

// Rutas para consultas con middlewares de seguridad
router.get('/', medicoSecretariaMiddleware, ConsultaController.getConsultas);
router.get('/hoy', medicoSecretariaMiddleware, ConsultaController.getConsultasHoy);
router.get('/del-dia', medicoSecretariaMiddleware, ConsultaController.getConsultasDelDia);
router.get('/pendientes', authenticateToken, ConsultaController.getConsultasPendientes);
router.get('/search', authenticateToken, ConsultaController.searchConsultas);
router.get('/estadisticas', authenticateToken, ConsultaController.getEstadisticasConsultas);
router.get('/estadisticas-por-periodo', authenticateToken, ConsultaController.getEstadisticasPorPeriodo);
router.get('/estadisticas-por-especialidad', authenticateToken, ConsultaController.getEstadisticasPorEspecialidad);
router.get('/estadisticas-por-medico', authenticateToken, ConsultaController.getEstadisticasPorMedico);
router.get('/by-paciente/:pacienteId', authenticateToken, ConsultaController.getConsultasByPaciente);
router.get('/by-medico/:medicoId', authenticateToken, ConsultaController.getConsultasByMedico);

// Endpoint de prueba simple (debe ir antes de /:id)
router.get('/test', (_req, res) => {
  res.json({ success: true, message: 'Test endpoint funcionando' });
});

// Permiso para finalizar consultas (según perfil del usuario)
router.get('/permiso-finalizar', authenticateToken, ConsultaController.getPermisoFinalizar);

// =====================================================
// RUTAS DE FINALIZACIÓN CON SERVICIOS (permiso puede_finalizar del perfil)
// Estas rutas deben ir ANTES de las rutas genéricas /:id
// =====================================================

// POST /api/v1/consultas/:id/finalizar-con-servicios - Finalizar consulta con servicios
router.post('/:id/finalizar-con-servicios', medicoSecretariaMiddleware, (req: any, res: any) =>
  finalizarConsultaController.finalizarConsulta(req, res)
);

// GET /api/v1/consultas/:id/servicios - Obtener servicios de una consulta
router.get('/:id/servicios', medicoSecretariaMiddleware, (req: any, res: any) =>
  finalizarConsultaController.getServiciosConsulta(req, res)
);

// GET /api/v1/consultas/:id/totales - Obtener totales de una consulta
router.get('/:id/totales', medicoSecretariaMiddleware, (req: any, res: any) =>
  finalizarConsultaController.getTotalesConsulta(req, res)
);

// GET /api/v1/consultas/:id/detalle-finalizacion - Obtener detalle completo de finalización
router.get('/:id/detalle-finalizacion', medicoSecretariaMiddleware, (req: any, res: any) =>
  finalizarConsultaController.getDetalleFinalizacion(req, res)
);

// Rutas genéricas (deben ir después de las rutas específicas)
router.get('/:id', authenticateToken, ConsultaController.getConsultaById);

router.post('/', authenticateToken, ConsultaController.createConsulta);

router.put('/:id', authenticateToken, ConsultaController.updateConsulta);
router.put('/:id/cancelar', authenticateToken, ConsultaController.cancelarConsulta);
// Finalizar: permitir medico/secretaria/admin; el controlador verifica permiso puede_finalizar del perfil
router.put('/:id/finalizar', medicoSecretariaMiddleware, ConsultaController.finalizarConsulta);
router.put('/:id/reagendar', authenticateToken, ConsultaController.reagendarConsulta);

router.delete('/:id', authenticateToken, ConsultaController.deleteConsulta);

export default router;
