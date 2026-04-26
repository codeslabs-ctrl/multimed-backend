import { AppointmentRepository, AppointmentData } from '../repositories/appointment.repository.js';
import { PaginationInfo } from '../types/index.js';

export class AppointmentService {
  private appointmentRepository: AppointmentRepository;

  constructor() {
    this.appointmentRepository = new AppointmentRepository();
  }

  async getAllAppointments(
    filters: Record<string, any> = {},
    pagination: { page: number; limit: number } = { page: 1, limit: 10 }
  ): Promise<{ data: AppointmentData[]; pagination: PaginationInfo }> {
    try {
      return await this.appointmentRepository.findAll(filters, pagination);
    } catch (error) {
      throw new Error(`Failed to get appointments: ${(error as Error).message}`);
    }
  }

  async getAppointmentById(id: string): Promise<AppointmentData | null> {
    try {
      return await this.appointmentRepository.findById(id);
    } catch (error) {
      throw new Error(`Failed to get appointment: ${(error as Error).message}`);
    }
  }

  async getAppointmentsByPatient(patientId: string): Promise<AppointmentData[]> {
    try {
      return await this.appointmentRepository.findByPatientId(patientId);
    } catch (error) {
      throw new Error(`Failed to get patient appointments: ${(error as Error).message}`);
    }
  }

  async getAppointmentsByDoctor(doctorId: string): Promise<AppointmentData[]> {
    try {
      return await this.appointmentRepository.findByDoctorId(doctorId);
    } catch (error) {
      throw new Error(`Failed to get doctor appointments: ${(error as Error).message}`);
    }
  }

  async createAppointment(appointmentData: Omit<AppointmentData, 'id' | 'created_at' | 'updated_at'>): Promise<AppointmentData> {
    try {
      // Validate required fields
      if (!appointmentData.patient_id || !appointmentData.doctor_id || !appointmentData.appointment_date || !appointmentData.appointment_time) {
        throw new Error('Missing required fields: patient_id, doctor_id, appointment_date, appointment_time');
      }

      // Validate appointment date and time
      const appointmentDateTime = new Date(`${appointmentData.appointment_date}T${appointmentData.appointment_time}`);
      const now = new Date();
      
      if (appointmentDateTime <= now) {
        throw new Error('Appointment date and time must be in the future');
      }

      // Check for conflicts
      await this.checkForConflicts(appointmentData.doctor_id, appointmentData.appointment_date, appointmentData.appointment_time);

      return await this.appointmentRepository.create(appointmentData);
    } catch (error) {
      throw new Error(`Failed to create appointment: ${(error as Error).message}`);
    }
  }

  async updateAppointment(id: string, appointmentData: Partial<AppointmentData>): Promise<AppointmentData> {
    try {
      // If updating date/time, check for conflicts
      if (appointmentData.appointment_date || appointmentData.appointment_time || appointmentData.doctor_id) {
        const existingAppointment = await this.appointmentRepository.findById(id);
        if (!existingAppointment) {
          throw new Error('Appointment not found');
        }

        const doctorId = appointmentData.doctor_id || existingAppointment.doctor_id;
        const appointmentDate = appointmentData.appointment_date || existingAppointment.appointment_date;
        const appointmentTime = appointmentData.appointment_time || existingAppointment.appointment_time;

        await this.checkForConflicts(doctorId, appointmentDate, appointmentTime, id);
      }

      return await this.appointmentRepository.update(id, appointmentData);
    } catch (error) {
      throw new Error(`Failed to update appointment: ${(error as Error).message}`);
    }
  }

  async cancelAppointment(id: string, reason?: string): Promise<AppointmentData> {
    try {
      return await this.appointmentRepository.update(id, {
        status: 'cancelled',
        notes: reason ? `Cancelled: ${reason}` : 'Cancelled'
      });
    } catch (error) {
      throw new Error(`Failed to cancel appointment: ${(error as Error).message}`);
    }
  }

  async completeAppointment(id: string, notes?: string): Promise<AppointmentData> {
    try {
      const updateData: Partial<AppointmentData> = {
        status: 'completed'
      };
      
      if (notes) {
        updateData.notes = notes;
      }
      
      return await this.appointmentRepository.update(id, updateData);
    } catch (error) {
      throw new Error(`Failed to complete appointment: ${(error as Error).message}`);
    }
  }

  async deleteAppointment(id: string): Promise<boolean> {
    try {
      return await this.appointmentRepository.delete(id);
    } catch (error) {
      throw new Error(`Failed to delete appointment: ${(error as Error).message}`);
    }
  }

  async getUpcomingAppointments(doctorId?: string): Promise<AppointmentData[]> {
    try {
      return await this.appointmentRepository.getUpcomingAppointments(doctorId);
    } catch (error) {
      throw new Error(`Failed to get upcoming appointments: ${(error as Error).message}`);
    }
  }

  async getAppointmentsByDateRange(startDate: string, endDate: string): Promise<AppointmentData[]> {
    try {
      if (new Date(startDate) > new Date(endDate)) {
        throw new Error('Start date must be before end date');
      }

      return await this.appointmentRepository.findByDateRange(startDate, endDate);
    } catch (error) {
      throw new Error(`Failed to get appointments by date range: ${(error as Error).message}`);
    }
  }

  async getAppointmentsByStatus(status: string): Promise<AppointmentData[]> {
    try {
      const validStatuses = ['scheduled', 'completed', 'cancelled', 'no_show'];
      if (!validStatuses.includes(status)) {
        throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
      }

      return await this.appointmentRepository.findByStatus(status);
    } catch (error) {
      throw new Error(`Failed to get appointments by status: ${(error as Error).message}`);
    }
  }

  async getAppointmentStatistics(): Promise<{
    total: number;
    byStatus: { [key: string]: number };
    upcoming: number;
    today: number;
  }> {
    try {
      const { data: allAppointments } = await this.appointmentRepository.findAll({}, { page: 1, limit: 1000 });
      const today = new Date().toISOString().split('T')[0];
      const now = new Date();

      const stats = {
        total: allAppointments.length,
        byStatus: {} as { [key: string]: number },
        upcoming: 0,
        today: 0
      };

      allAppointments.forEach(appointment => {
        // Count by status
        stats.byStatus[appointment.status] = (stats.byStatus[appointment.status] || 0) + 1;

        // Count upcoming appointments
        const appointmentDateTime = new Date(`${appointment.appointment_date}T${appointment.appointment_time}`);
        if (appointmentDateTime > now && appointment.status === 'scheduled') {
          stats.upcoming++;
        }

        // Count today's appointments
        if (appointment.appointment_date === today) {
          stats.today++;
        }
      });

      return stats;
    } catch (error) {
      throw new Error(`Failed to get appointment statistics: ${(error as Error).message}`);
    }
  }

  private async checkForConflicts(doctorId: string, appointmentDate: string, appointmentTime: string, excludeId?: string): Promise<void> {
    try {
      const existingAppointments = await this.appointmentRepository.findByDateRange(appointmentDate, appointmentDate);
      
      const conflictingAppointment = existingAppointments.find((appointment: AppointmentData) => {
        if (excludeId && appointment.id === excludeId) return false;
        return appointment.doctor_id === doctorId && 
               appointment.appointment_time === appointmentTime && 
               appointment.status === 'scheduled';
      });

      if (conflictingAppointment) {
        throw new Error('Doctor has a conflicting appointment at this time');
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('conflicting appointment')) {
        throw error;
      }
      throw new Error(`Failed to check for conflicts: ${(error as Error).message}`);
    }
  }
}
