import { Request, Response } from 'express';
import { RemisionService } from '../services/remision.service.js';
import { ApiResponse } from '../types/index.js';
import { 
  CreateRemisionRequest, 
  UpdateRemisionStatusRequest 
} from '../models/remision.model.js';

export class RemisionController {
  private remisionService: RemisionService;

  constructor() {
    this.remisionService = new RemisionService();
  }

  async createRemision(req: Request<{}, ApiResponse, CreateRemisionRequest>, res: Response<ApiResponse>): Promise<void> {
    try {
      const remisionData = req.body;

      const newRemision = await this.remisionService.createRemision(remisionData);

      const response: ApiResponse = {
        success: true,
        data: newRemision
      };
      res.status(201).json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(400).json(response);
    }
  }

  async updateRemisionStatus(req: Request<{ id: string }, ApiResponse, UpdateRemisionStatusRequest>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { id } = req.params;
      const statusData = req.body;

      const remisionId = parseInt(id);
      if (isNaN(remisionId)) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Invalid remision ID' }
        };
        res.status(400).json(response);
        return;
      }

      const updatedRemision = await this.remisionService.updateRemisionStatus(remisionId, statusData);

      const response: ApiResponse = {
        success: true,
        data: updatedRemision
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

  async getRemisionesByMedico(req: Request<{}, ApiResponse, {}, { medico_id?: string; tipo?: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { medico_id, tipo } = req.query;

      if (!medico_id) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'medico_id parameter is required' }
        };
        res.status(400).json(response);
        return;
      }

      const medicoId = parseInt(medico_id);
      if (isNaN(medicoId)) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Invalid medico_id' }
        };
        res.status(400).json(response);
        return;
      }

      const tipoRemision = (tipo as 'remitente' | 'remitido') || 'remitente';
      const remisiones = await this.remisionService.getRemisionesByMedico(medicoId, tipoRemision);

      const response: ApiResponse = {
        success: true,
        data: remisiones
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

  async getRemisionesByPaciente(req: Request<{ paciente_id: string }, ApiResponse>, res: Response<ApiResponse>): Promise<void> {
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

      const remisiones = await this.remisionService.getRemisionesByPaciente(pacienteId);

      const response: ApiResponse = {
        success: true,
        data: remisiones
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

  async getRemisionById(req: Request<{ id: string }, ApiResponse>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { id } = req.params;

      const remisionId = parseInt(id);
      if (isNaN(remisionId)) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Invalid remision ID' }
        };
        res.status(400).json(response);
        return;
      }

      const remision = await this.remisionService.getRemisionById(remisionId);

      if (!remision) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Remisión no encontrada' }
        };
        res.status(404).json(response);
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: remision
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

  async getAllRemisiones(_req: Request, res: Response<ApiResponse>): Promise<void> {
    try {
      const remisiones = await this.remisionService.getAllRemisiones();

      const response: ApiResponse = {
        success: true,
        data: remisiones
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

  async getRemisionesByStatus(req: Request<{}, ApiResponse, {}, { estado?: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { estado } = req.query;

      if (!estado) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'estado parameter is required' }
        };
        res.status(400).json(response);
        return;
      }

      const remisiones = await this.remisionService.getRemisionesByStatus(estado as string);

      const response: ApiResponse = {
        success: true,
        data: remisiones
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

  async getRemisionesStatistics(_req: Request, res: Response<ApiResponse>): Promise<void> {
    try {
      const statistics = await this.remisionService.getRemisionesStatistics();

      const response: ApiResponse = {
        success: true,
        data: statistics
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
}
