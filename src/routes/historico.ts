import express from 'express';
import { HistoricoController } from '../controllers/historico.controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleAuth.js';

const router = express.Router();
const historicoController = new HistoricoController();

// Requiere autenticación para todo el módulo
router.use(authenticateToken);

// Historico routes
router.get('/', (req, res) => historicoController.getHistoricoCompleto(req, res));
router.get('/by-paciente/:paciente_id', (req, res) => historicoController.getHistoricoByPaciente(req, res));
router.get('/by-paciente/:paciente_id/latest', (req, res) => historicoController.getLatestHistoricoByPaciente(req, res));
router.get('/by-paciente/:paciente_id/medicos', (req, res) => historicoController.getMedicosConHistoriaByPaciente(req, res));
router.get('/by-paciente/:paciente_id/medico/:medico_id', (req, res) => historicoController.getHistoricoByPacienteAndMedico(req, res));
router.get('/by-paciente/:paciente_id/verificar-especialidad', (req: any, res: any) => historicoController.verificarHistoriaPorEspecialidad(req, res));
router.get('/by-medico/:medico_id', (req, res) => historicoController.getHistoricoByMedico(req, res));
router.get('/filtrado', (req, res) => historicoController.getHistoricoFiltrado(req, res));
router.get('/:id/antecedentes', (req: any, res) => historicoController.getAntecedentesByHistoricoId(req, res));
router.get('/:id', (req, res) => historicoController.getHistoricoById(req, res));

// Escritura solo para médicos
router.post('/', requireRole(['medico']), (req, res) => historicoController.createHistorico(req, res));
router.put('/:id/antecedentes', requireRole(['medico']), (req: any, res) => historicoController.saveAntecedentesBulk(req, res));
router.put('/:id', requireRole(['medico']), (req, res) => historicoController.updateHistorico(req, res));

export default router;
