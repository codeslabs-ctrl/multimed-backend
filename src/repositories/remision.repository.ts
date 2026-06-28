import { PostgresRepository } from './postgres.repository.js';
import { RemisionData, RemisionWithDetails } from '../models/remision.model.js';

// Implementación con PostgreSQL
export class RemisionRepository extends PostgresRepository<RemisionData> {
  constructor() {
    super('remisiones');
  }

  async createRemision(remisionData: Omit<RemisionData, 'id' | 'fecha_creacion' | 'fecha_actualizacion'>): Promise<RemisionData> {
    try {
      const client = await this.getClient();
      try {
        await client.query('BEGIN');
        
        const insertQuery = `
          INSERT INTO remisiones (
            paciente_id, medico_remitente_id, medico_remitido_id, 
            motivo_remision, observaciones, estado_remision, fecha_remision
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `;
        
        const result = await client.query(insertQuery, [
          remisionData.paciente_id,
          remisionData.medico_remitente_id,
          remisionData.medico_remitido_id,
          remisionData.motivo_remision,
          remisionData.observaciones || null,
          remisionData.estado_remision || 'Pendiente',
          remisionData.fecha_remision || new Date().toISOString()
        ]);
        
        await client.query('COMMIT');
        return result.rows[0];
      } catch (error: any) {
        await client.query('ROLLBACK');
        if (error.code === '23505') {
          throw new Error('Ya existe una remisión con estos datos');
        }
        if (error.code === '23503') {
          throw new Error('Referencia inválida: paciente o médico no existe');
        }
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      throw new Error(`Failed to create remision: ${(error as Error).message}`);
    }
  }

  async updateRemisionStatus(id: number, estado: string, observaciones?: string): Promise<RemisionData> {
    try {
      const updateQuery = `
        UPDATE remisiones 
        SET estado_remision = $1, 
            observaciones = COALESCE($2, observaciones),
            fecha_respuesta = CASE WHEN $1 != 'Pendiente' THEN NOW() ELSE fecha_respuesta END,
            fecha_actualizacion = NOW()
        WHERE id = $3
        RETURNING *
      `;
      
      const result = await this.query(updateQuery, [estado, observaciones || null, id]);
      
      if (result.rows.length === 0) {
        throw new Error('Remisión no encontrada');
      }
      
      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to update remision status: ${(error as Error).message}`);
    }
  }

  async getRemisionesByMedico(medicoId: number, tipo: 'remitente' | 'remitido'): Promise<RemisionWithDetails[]> {
    try {
      const columnName = tipo === 'remitente' ? 'medico_remitente_id' : 'medico_remitido_id';
      const query = `
        SELECT 
          r.*,
          p.nombres as paciente_nombre,
          p.apellidos as paciente_apellidos,
          m1.nombres as medico_remitente_nombre,
          m1.apellidos as medico_remitente_apellidos,
          m2.nombres as medico_remitido_nombre,
          m2.apellidos as medico_remitido_apellidos
        FROM remisiones r
        LEFT JOIN pacientes p ON r.paciente_id = p.id
        LEFT JOIN medicos m1 ON r.medico_remitente_id = m1.id
        LEFT JOIN medicos m2 ON r.medico_remitido_id = m2.id
        WHERE r.${columnName} = $1
        ORDER BY r.fecha_creacion DESC
      `;
      
      const result = await this.query(query, [medicoId]);
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to get remisiones by medico: ${(error as Error).message}`);
    }
  }

  async getRemisionesByPaciente(pacienteId: number): Promise<RemisionWithDetails[]> {
    try {
      const query = `
        SELECT 
          r.*,
          p.nombres as paciente_nombre,
          p.apellidos as paciente_apellidos,
          m1.nombres as medico_remitente_nombre,
          m1.apellidos as medico_remitente_apellidos,
          m2.nombres as medico_remitido_nombre,
          m2.apellidos as medico_remitido_apellidos
        FROM remisiones r
        LEFT JOIN pacientes p ON r.paciente_id = p.id
        LEFT JOIN medicos m1 ON r.medico_remitente_id = m1.id
        LEFT JOIN medicos m2 ON r.medico_remitido_id = m2.id
        WHERE r.paciente_id = $1
        ORDER BY r.fecha_creacion DESC
      `;
      
      const result = await this.query(query, [pacienteId]);
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to get remisiones by paciente: ${(error as Error).message}`);
    }
  }

  async getRemisionById(id: number): Promise<RemisionWithDetails | null> {
    try {
      const query = `
        SELECT 
          r.*,
          p.nombres as paciente_nombre,
          p.apellidos as paciente_apellidos,
          m1.nombres as medico_remitente_nombre,
          m1.apellidos as medico_remitente_apellidos,
          m2.nombres as medico_remitido_nombre,
          m2.apellidos as medico_remitido_apellidos
        FROM remisiones r
        LEFT JOIN pacientes p ON r.paciente_id = p.id
        LEFT JOIN medicos m1 ON r.medico_remitente_id = m1.id
        LEFT JOIN medicos m2 ON r.medico_remitido_id = m2.id
        WHERE r.id = $1
      `;
      
      const result = await this.query(query, [id]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to get remision by id: ${(error as Error).message}`);
    }
  }
}

// Exportar el tipo para uso en TypeScript
export type RemisionRepositoryType = typeof RemisionRepository;
