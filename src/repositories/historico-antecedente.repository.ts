import { postgresPool } from '../config/database.js';

/** Fila de antecedente_paciente (antecedentes asociados al paciente, no al histórico). */
export interface HistoricoAntecedenteRow {
  id: number;
  paciente_id: number;
  antecedente_tipo_id: number;
  presente: boolean;
  detalle: string | null;
  fecha_creacion?: string;
  fecha_actualizacion?: string;
}

export class HistoricoAntecedenteRepository {
  private tableName = 'antecedente_paciente';

  async getByPacienteId(pacienteId: number): Promise<HistoricoAntecedenteRow[]> {
    const client = await postgresPool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM ${this.tableName} WHERE paciente_id = $1 ORDER BY antecedente_tipo_id`,
        [pacienteId]
      );
      return result.rows as HistoricoAntecedenteRow[];
    } finally {
      client.release();
    }
  }

  async saveBulk(pacienteId: number, items: { antecedente_tipo_id: number; presente: boolean; detalle?: string | null }[]): Promise<HistoricoAntecedenteRow[]> {
    const client = await postgresPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM ${this.tableName} WHERE paciente_id = $1`, [pacienteId]);
      if (items.length === 0) {
        await client.query('COMMIT');
        return [];
      }
      const values: any[] = [];
      const placeholders: string[] = [];
      let i = 0;
      items.forEach((item) => {
        placeholders.push(`($${i + 1}, $${i + 2}, $${i + 3}, $${i + 4})`);
        values.push(pacienteId, item.antecedente_tipo_id, item.presente, item.detalle ?? null);
        i += 4;
      });
      const insertQuery = `INSERT INTO ${this.tableName} (paciente_id, antecedente_tipo_id, presente, detalle)
        VALUES ${placeholders.join(', ')}
        RETURNING *`;
      const result = await client.query(insertQuery, values);
      await client.query('COMMIT');
      return result.rows as HistoricoAntecedenteRow[];
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}
