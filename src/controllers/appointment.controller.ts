import { Request, Response } from 'express';
import { AppointmentService } from '../services/appointment.service.js';
import { ApiResponse } from '../types/index.js';

export class AppointmentController {
  private appointmentService: AppointmentService;

  constructor() {
    this.appointmentService = new AppointmentService();
  }

  async getAllAppointments(req: Request<{}, ApiResponse, {}, any>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { page = 1, limit = 10, ...filters } = req.query;
      
      const result = await this.appointmentService.getAllAppointments(
        filters,
        { page: Number(page), limit: Number(limit) }
      );

      const response: ApiResponse = {
        success: true,
        data: result.data,
        pagination: result.pagination
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

  async getAppointmentById(req: Request<{ id: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { id } = req.params;
      
      const appointment = await this.appointmentService.getAppointmentById(id);

      if (!appointment) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Appointment not found' }
        };
        res.status(404).json(response);
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: appointment
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

  async getAppointmentsByPatient(req: Request<{ patientId: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { patientId } = req.params;
      
      const appointments = await this.appointmentService.getAppointmentsByPatient(patientId);

      const response: ApiResponse = {
        success: true,
        data: appointments
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

  async getAppointmentsByDoctor(req: Request<{ doctorId: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { doctorId } = req.params;
      
      const appointments = await this.appointmentService.getAppointmentsByDoctor(doctorId);

      const response: ApiResponse = {
        success: true,
        data: appointments
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

  async createAppointment(req: Request<{}, ApiResponse, any>, res: Response<ApiResponse>): Promise<void> {
    try {
      const appointmentData = req.body;
      
      const appointment = await this.appointmentService.createAppointment(appointmentData);

      const response: ApiResponse = {
        success: true,
        data: {
          message: 'Appointment created successfully',
          ...appointment
        }
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

  async updateAppointment(req: Request<{ id: string }, ApiResponse, any>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { id } = req.params;
      const appointmentData = req.body;
      
      const appointment = await this.appointmentService.updateAppointment(id, appointmentData);

      const response: ApiResponse = {
        success: true,
        data: {
          message: 'Appointment updated successfully',
          ...appointment
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

  async cancelAppointment(req: Request<{ id: string }, ApiResponse, any>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      
      const appointment = await this.appointmentService.cancelAppointment(id, reason);

      const response: ApiResponse = {
        success: true,
        data: {
          message: 'Appointment cancelled successfully',
          ...appointment
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

  async completeAppointment(req: Request<{ id: string }, ApiResponse, any>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { id } = req.params;
      const { notes } = req.body;
      
      const appointment = await this.appointmentService.completeAppointment(id, notes);

      const response: ApiResponse = {
        success: true,
        data: {
          message: 'Appointment completed successfully',
          ...appointment
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

  async deleteAppointment(req: Request<{ id: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { id } = req.params;
      
      const success = await this.appointmentService.deleteAppointment(id);

      if (!success) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Failed to delete appointment' }
        };
        res.status(400).json(response);
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: { message: 'Appointment deleted successfully' }
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

  async getUpcomingAppointments(req: Request<{}, ApiResponse, {}, { doctorId?: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { doctorId } = req.query;
      
      const appointments = await this.appointmentService.getUpcomingAppointments(doctorId as string);

      const response: ApiResponse = {
        success: true,
        data: appointments
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

  async getAppointmentsByDateRange(req: Request<{}, ApiResponse, {}, { startDate?: string; endDate?: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { startDate, endDate } = req.query;
      
      if (!startDate || !endDate) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'startDate and endDate parameters are required' }
        };
        res.status(400).json(response);
        return;
      }

      const appointments = await this.appointmentService.getAppointmentsByDateRange(
        startDate as string,
        endDate as string
      );

      const response: ApiResponse = {
        success: true,
        data: appointments
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

  async getAppointmentsByStatus(req: Request<{}, ApiResponse, {}, { status?: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { status } = req.query;
      
      if (!status) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'status parameter is required' }
        };
        res.status(400).json(response);
        return;
      }

      const appointments = await this.appointmentService.getAppointmentsByStatus(status as string);

      const response: ApiResponse = {
        success: true,
        data: appointments
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

  async getAppointmentStatistics(_req: Request, res: Response<ApiResponse>): Promise<void> {
    try {
      const statistics = await this.appointmentService.getAppointmentStatistics();

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
