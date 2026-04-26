import express, { Request, Response } from 'express';
import { ApiResponse } from '../../../types/index.js';
import { requireExternalApiKey } from '../../../middleware/external-api-key.js';
import { ExternalRequestsService } from '../../../services/external-requests.service.js';

const router = express.Router();

router.use(requireExternalApiKey('EXTERNAL_PATIENT_APP_API_KEYS'));

// POST /api/v1/external/v1/reports/requests
router.post('/requests', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const body = (req.body || {}) as any;

    const paciente_id = Number(body.paciente_id);
    const medico_id = body.medico_id !== undefined ? Number(body.medico_id) : undefined;
    const tipo_informe = String(body.tipo_informe ?? '').trim();
    const motivo = String(body.motivo ?? '').trim();

    if (!paciente_id || paciente_id <= 0 || Number.isNaN(paciente_id)) {
      res.status(400).json({ success: false, error: { message: 'paciente_id inválido' } });
      return;
    }
    if (body.medico_id !== undefined && (!medico_id || medico_id <= 0 || Number.isNaN(medico_id))) {
      res.status(400).json({ success: false, error: { message: 'medico_id inválido' } });
      return;
    }
    if (!tipo_informe) {
      res.status(400).json({ success: false, error: { message: 'tipo_informe es requerido' } });
      return;
    }
    if (!motivo) {
      res.status(400).json({ success: false, error: { message: 'motivo es requerido' } });
      return;
    }

    const created = await ExternalRequestsService.createReportRequest({
      paciente_id,
      ...(medico_id ? { medico_id } : {}),
      tipo_informe,
      motivo
    });

    res.status(201).json({ success: true, data: created });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: (error as Error).message } });
  }
});

// GET /api/v1/external/v1/reports?paciente_id=123
router.get('/', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const pacienteId = Number((req.query as any)?.paciente_id);
    if (!pacienteId || pacienteId <= 0 || Number.isNaN(pacienteId)) {
      res.status(400).json({ success: false, error: { message: 'paciente_id es requerido (query)' } });
      return;
    }

    const items = await ExternalRequestsService.listReportsByPaciente(pacienteId);
    res.json({ success: true, data: items });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: (error as Error).message } });
  }
});

// GET /api/v1/external/v1/reports/pdf?paciente_id=123&informe_id=456
// Descarga PDF de un informe emitido (solo si pertenece al paciente).
router.get('/pdf', async (req: Request, res: Response) => {
  try {
    const pacienteId = Number((req.query as any)?.paciente_id);
    const informeId = Number((req.query as any)?.informe_id);

    if (!pacienteId || pacienteId <= 0 || Number.isNaN(pacienteId)) {
      res.status(400).json({ success: false, error: { message: 'paciente_id es requerido (query)' } });
      return;
    }
    if (!informeId || informeId <= 0 || Number.isNaN(informeId)) {
      res.status(400).json({ success: false, error: { message: 'informe_id es requerido (query)' } });
      return;
    }

    const { pdf, numero_informe } = await ExternalRequestsService.generateReportPdfForPaciente(pacienteId, informeId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="informe-${numero_informe ?? informeId}.pdf"`);
    res.setHeader('Content-Length', pdf.length);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.status(200).send(pdf);
  } catch (error) {
    const msg = (error as Error).message || 'Error generando el PDF del informe';
    res.status(404).json({ success: false, error: { message: msg } });
  }
});

export default router;


