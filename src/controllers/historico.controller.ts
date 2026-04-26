import { Request, Response } from 'express';
import { HistoricoService } from '../services/historico.service.js';
import { ApiResponse } from '../types/index.js';

export class HistoricoController {
  private historicoService: HistoricoService;

  constructor() {
    this.historicoService = new HistoricoService();
  }

  async getHistoricoByPaciente(req: Request<{ paciente_id: string }, ApiResponse>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { paciente_id } = req.params;

      const pacienteId = parseInt(paciente_id);
      if (isNaN(pacienteId)) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Invalid paciente_id' }
        };
        res.status(400).json(response);
        return;
      }

      const historico = await this.historicoService.getHistoricoByPaciente(pacienteId);

      const response: ApiResponse = {
        success: true,
        data: historico
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(400).json(response);
    }
  }

  async getLatestHistoricoByPaciente(req: Request<{ paciente_id: string }, ApiResponse>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { paciente_id } = req.params;

      const pacienteId = parseInt(paciente_id);
      if (isNaN(pacienteId)) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Invalid paciente_id' }
        };
        res.status(400).json(response);
        return;
      }

      const historico = await this.historicoService.getLatestHistoricoByPaciente(pacienteId);

      const response: ApiResponse = {
        success: true,
        data: historico
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(400).json(response);
    }
  }

  // Obtener médicos que han creado historias para un paciente
  async getMedicosConHistoriaByPaciente(req: Request<{ paciente_id: string }, ApiResponse>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { paciente_id } = req.params;

      const pacienteId = parseInt(paciente_id);
      if (isNaN(pacienteId)) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Invalid paciente_id' }
        };
        res.status(400).json(response);
        return;
      }

      const medicos = await this.historicoService.getMedicosConHistoriaByPaciente(pacienteId);

      const response: ApiResponse = {
        success: true,
        data: medicos
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(400).json(response);
    }
  }

  // Obtener historia específica de un médico para un paciente
  async getHistoricoByPacienteAndMedico(req: Request<{ paciente_id: string, medico_id: string }, ApiResponse>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { paciente_id, medico_id } = req.params;

      const pacienteId = parseInt(paciente_id);
      const medicoId = parseInt(medico_id);
      
      if (isNaN(pacienteId) || isNaN(medicoId)) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Invalid paciente_id or medico_id' }
        };
        res.status(400).json(response);
        return;
      }

      const historico = await this.historicoService.getHistoricoByPacienteAndMedico(pacienteId, medicoId);

      const response: ApiResponse = {
        success: true,
        data: historico
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(400).json(response);
    }
  }

  async getHistoricoByMedico(req: Request<{ medico_id: string }, ApiResponse>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { medico_id } = req.params;

      const medicoId = parseInt(medico_id);
      if (isNaN(medicoId)) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Invalid medico_id' }
        };
        res.status(400).json(response);
        return;
      }

      const historico = await this.historicoService.getHistoricoByMedico(medicoId);

      const response: ApiResponse = {
        success: true,
        data: historico
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(400).json(response);
    }
  }

  async getHistoricoCompleto(_req: Request, res: Response<ApiResponse>): Promise<void> {
    try {
      const historico = await this.historicoService.getHistoricoCompleto();

      const response: ApiResponse = {
        success: true,
        data: historico
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(500).json(response);
    }
  }

  async getHistoricoFiltrado(req: Request<{}, ApiResponse, {}, { paciente_id?: string; medico_id?: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { paciente_id, medico_id } = req.query;

      const pacienteId = paciente_id ? parseInt(paciente_id) : undefined;
      const medicoId = medico_id ? parseInt(medico_id) : undefined;

      if (pacienteId && isNaN(pacienteId)) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Invalid paciente_id' }
        };
        res.status(400).json(response);
        return;
      }

      if (medicoId && isNaN(medicoId)) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Invalid medico_id' }
        };
        res.status(400).json(response);
        return;
      }

      const historico = await this.historicoService.getHistoricoFiltrado(pacienteId, medicoId);

      const response: ApiResponse = {
        success: true,
        data: historico
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(400).json(response);
    }
  }

  async createHistorico(req: Request, res: Response<ApiResponse>): Promise<void> {
    try {
      const historicoData = req.body || {};
      const user = (req as any).user;
      const medicoId = Number(user?.medico_id || 0);
      if (!medicoId) {
        res.status(403).json({ success: false, error: { message: 'No se pudo identificar el médico autenticado' } });
        return;
      }

      const payload = {
        ...historicoData,
        medico_id: medicoId,
        ...(historicoData.fecha_consulta ? null : { fecha_consulta: new Date().toISOString() })
      };

      console.log('🔍 Backend - Creando historial médico:', payload);

      const historico = await this.historicoService.createHistorico(payload);

      const response: ApiResponse = {
        success: true,
        data: historico
      };
      res.status(201).json(response);
    } catch (error) {
      console.error('❌ Backend - Error creando historial:', error);
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(400).json(response);
    }
  }

  async getHistoricoById(req: Request, res: Response<ApiResponse>): Promise<void> {
    try {
      const historicoId = parseInt((req.params as any).id);
      if (!historicoId || Number.isNaN(historicoId)) {
        res.status(400).json({ success: false, error: { message: 'ID de historia médica inválido' } });
        return;
      }

      const historico = await this.historicoService.getHistoricoById(historicoId);
      res.json({ success: true, data: historico });
    } catch (error) {
      res.status(404).json({ success: false, error: { message: (error as Error).message } });
    }
  }

  // Verificar si un paciente tiene historia médica para una especialidad
  async verificarHistoriaPorEspecialidad(req: Request<{ paciente_id: string }, ApiResponse, {}, { especialidad_id?: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { paciente_id } = req.params;
      const { especialidad_id } = req.query;

      const pacienteId = parseInt(paciente_id);
      const especialidadId = especialidad_id ? parseInt(especialidad_id) : undefined;
      
      if (isNaN(pacienteId)) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Invalid paciente_id' }
        };
        res.status(400).json(response);
        return;
      }

      if (!especialidadId || isNaN(especialidadId)) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Invalid especialidad_id' }
        };
        res.status(400).json(response);
        return;
      }

      const tieneHistoria = await this.historicoService.tieneHistoriaPorEspecialidad(pacienteId, especialidadId);

      const response: ApiResponse = {
        success: true,
        data: {
          tiene_historia: tieneHistoria,
          paciente_id: pacienteId,
          especialidad_id: especialidadId
        }
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(400).json(response);
    }
  }

  async updateHistorico(req: Request, res: Response<ApiResponse>): Promise<void> {
    try {
      const { id } = req.params as any;
      const updateData = req.body;

      console.log('🔍 HistoricoController.updateHistorico - ID:', id);
      console.log('🔍 HistoricoController.updateHistorico - updateData:', updateData);

      const historicoId = parseInt(id);
      if (isNaN(historicoId)) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'ID de historia médica inválido' }
        };
        res.status(400).json(response);
        return;
      }

      // Validar que hay datos para actualizar
      if (!updateData || Object.keys(updateData).length === 0) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'No se proporcionaron datos para actualizar' }
        };
        res.status(400).json(response);
        return;
      }

      const user = (req as any).user;
      const medicoId = Number(user?.medico_id || 0);
      if (!medicoId) {
        res.status(403).json({ success: false, error: { message: 'No se pudo identificar el médico autenticado' } });
        return;
      }

      const existing = await this.historicoService.getHistoricoById(historicoId);
      if (Number(existing.medico_id) !== medicoId) {
        res.status(403).json({ success: false, error: { message: 'Solo puede editar controles creados por usted' } });
        return;
      }

      const historico = await this.historicoService.updateHistorico(historicoId, updateData);

      const response: ApiResponse = {
        success: true,
        data: historico
      };
      res.json(response);
    } catch (error) {
      console.error('❌ HistoricoController.updateHistorico - Error:', error);
      const errorMessage = (error as Error).message;
      const response: ApiResponse = {
        success: false,
        error: { message: errorMessage || 'Error al actualizar la historia médica' }
      };
      res.status(400).json(response);
    }
  }

  async getAntecedentesByHistoricoId(req: Request<{ id: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ success: false, error: { message: 'ID de historial inválido.' } });
        return;
      }
      const data = await this.historicoService.getAntecedentesByHistoricoId(id);
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, error: { message: (error as Error).message } });
    }
  }

  async saveAntecedentesBulk(req: Request<{ id: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ success: false, error: { message: 'ID de historial inválido.' } });
        return;
      }
      const body = req.body as {
        antecedentes?: { antecedente_tipo_id: number; presente: boolean; detalle?: string | null }[];
        antecedentes_otros?: string | null;
      };
      const items = Array.isArray(body?.antecedentes) ? body.antecedentes : [];
      const data = await this.historicoService.saveAntecedentesBulk(id, items, body?.antecedentes_otros);
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, error: { message: (error as Error).message } });
    }
  }
}
