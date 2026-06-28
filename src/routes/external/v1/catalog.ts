import express from 'express';
import { requireExternalApiKey } from '../../../middleware/external-api-key.js';
import { EspecialidadController } from '../../../controllers/especialidad.controller.js';
import { MedicoController } from '../../../controllers/medico.controller.js';

const router = express.Router();

// API Key para la app externa de pacientes (server-to-server por ahora)
router.use(requireExternalApiKey('EXTERNAL_PATIENT_APP_API_KEYS'));

const especialidadController = new EspecialidadController();
const medicoController = new MedicoController();

// Catálogos (solo lectura)
router.get('/especialidades', (req, res) => especialidadController.getAllEspecialidades(req, res));

router.get('/medicos', (req, res) => medicoController.getAllMedicos(req, res));
router.get('/medicos/:id', (req, res) => medicoController.getMedicoById(req, res));
router.get('/medicos/by-especialidad/:especialidadId', (req, res) => medicoController.getMedicosByEspecialidad(req, res));

export default router;


