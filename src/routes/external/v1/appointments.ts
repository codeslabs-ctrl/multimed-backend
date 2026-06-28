import express, { Request, Response } from 'express';
import { ApiResponse } from '../../../types/index.js';
import { requireExternalApiKey } from '../../../middleware/external-api-key.js';
import { ExternalRequestsService } from '../../../services/external-requests.service.js';

const router = express.Router();

router.use(requireExternalApiKey('EXTERNAL_PATIENT_APP_API_KEYS'));

// POST /api/v1/external/v1/appointments/requests
router.post('/requests', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const body = (req.body || {}) as any;

    const paciente_id = Number(body.paciente_id);
    const medico_id = Number(body.medico_id);
    const motivo_consulta = String(body.motivo_consulta ?? '').trim();
    const tipo_consulta = body.tipo_consulta ? String(body.tipo_consulta).trim() : undefined;
    const prioridad = body.prioridad ? String(body.prioridad).trim() : undefined;
    const observaciones = body.observaciones ? String(body.observaciones).trim() : undefined;

    if (!paciente_id || paciente_id <= 0 || Number.isNaN(paciente_id)) {
      res.status(400).json({ success: false, error: { message: 'paciente_id inválido' } });
      return;
    }
    if (!medico_id || medico_id <= 0 || Number.isNaN(medico_id)) {
      res.status(400).json({ success: false, error: { message: 'medico_id inválido' } });
      return;
    }
    if (!motivo_consulta) {
      res.status(400).json({ success: false, error: { message: 'motivo_consulta es requerido' } });
      return;
    }

    const created = await ExternalRequestsService.createAppointmentRequest({
      paciente_id,
      medico_id,
      motivo_consulta,
      ...(tipo_consulta ? { tipo_consulta } : {}),
      ...(prioridad ? { prioridad } : {}),
      ...(observaciones ? { observaciones } : {})
    });

    res.status(201).json({ success: true, data: created });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: (error as Error).message } });
  }
});

// GET /api/v1/external/v1/appointments?paciente_id=123
router.get('/', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const pacienteId = Number((req.query as any)?.paciente_id);
    if (!pacienteId || pacienteId <= 0 || Number.isNaN(pacienteId)) {
      res.status(400).json({ success: false, error: { message: 'paciente_id es requerido (query)' } });
      return;
    }

    const items = await ExternalRequestsService.listAppointmentsByPaciente(pacienteId);
    res.json({ success: true, data: items });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: (error as Error).message } });
  }
});

export default router;


