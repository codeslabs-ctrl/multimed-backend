import { PostgresRepository } from './postgres.repository.js';

export interface AppointmentData {
  id?: string;
  patient_id: string;
  doctor_id: string;
  appointment_date: string;
  appointment_time: string;
  duration_minutes: number;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  reason?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export class AppointmentRepository extends PostgresRepository<AppointmentData> {
  constructor() {
    super('appointments');
  }

  async findByPatientId(patientId: string): Promise<AppointmentData[]> {
    try {
      const result = await this.query(
        `SELECT * FROM ${this.tableName} WHERE patient_id = $1 ORDER BY appointment_date ASC`,
        [patientId]
      );
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to find appointments by patient ID: ${(error as Error).message}`);
    }
  }

  async findByDoctorId(doctorId: string): Promise<AppointmentData[]> {
    try {
      const result = await this.query(
        `SELECT * FROM ${this.tableName} WHERE doctor_id = $1 ORDER BY appointment_date ASC`,
        [doctorId]
      );
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to find appointments by doctor ID: ${(error as Error).message}`);
    }
  }

  async findByDateRange(startDate: string, endDate: string): Promise<AppointmentData[]> {
    try {
      const result = await this.query(
        `SELECT * FROM ${this.tableName} WHERE appointment_date >= $1 AND appointment_date <= $2 ORDER BY appointment_date ASC`,
        [startDate, endDate]
      );
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to find appointments by date range: ${(error as Error).message}`);
    }
  }

  async findByStatus(status: string): Promise<AppointmentData[]> {
    try {
      const result = await this.query(
        `SELECT * FROM ${this.tableName} WHERE status = $1 ORDER BY appointment_date ASC`,
        [status]
      );
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to find appointments by status: ${(error as Error).message}`);
    }
  }

  async getUpcomingAppointments(doctorId?: string): Promise<AppointmentData[]> {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      let query = `SELECT * FROM ${this.tableName} WHERE appointment_date >= $1 AND status = $2`;
      const params: any[] = [today, 'scheduled'];
      
      if (doctorId) {
        query += ` AND doctor_id = $3`;
        params.push(doctorId);
      }
      
      query += ` ORDER BY appointment_date ASC`;
      
      const result = await this.query(query, params);
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to get upcoming appointments: ${(error as Error).message}`);
    }
  }
}

