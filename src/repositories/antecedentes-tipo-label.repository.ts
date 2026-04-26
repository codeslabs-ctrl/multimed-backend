import { postgresPool } from '../config/database.js';

export interface AntecedenteTipoLabelRow {
  id: number;
  codigo: string;
  etiqueta: string;
  orden: number;
  activo: boolean;
}

export class AntecedentesTipoLabelRepository {
  async findActivosOrdenados(): Promise<AntecedenteTipoLabelRow[]> {
    const result = await postgresPool.query<AntecedenteTipoLabelRow>(
      `SELECT id, codigo, etiqueta, orden, activo
       FROM antecedentes_tipo_label
       WHERE activo = true
       ORDER BY orden ASC, id ASC`
    );
    return result.rows;
  }

  async findAllOrdenados(): Promise<AntecedenteTipoLabelRow[]> {
    const result = await postgresPool.query<AntecedenteTipoLabelRow>(
      `SELECT id, codigo, etiqueta, orden, activo
       FROM antecedentes_tipo_label
       ORDER BY orden ASC, id ASC`
    );
    return result.rows;
  }

  async findById(id: number): Promise<AntecedenteTipoLabelRow | null> {
    const result = await postgresPool.query<AntecedenteTipoLabelRow>(
      `SELECT id, codigo, etiqueta, orden, activo FROM antecedentes_tipo_label WHERE id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  async countUsoByCodigo(codigo: string): Promise<number> {
    const result = await postgresPool.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM antecedente_medico_tipo WHERE tipo = $1`,
      [codigo]
    );
    const c = result.rows[0]?.c;
    return typeof c === 'number' ? c : parseInt(String(c ?? 0), 10);
  }

  async create(row: { codigo: string; etiqueta: string; orden: number; activo: boolean }): Promise<AntecedenteTipoLabelRow> {
    const result = await postgresPool.query<AntecedenteTipoLabelRow>(
      `INSERT INTO antecedentes_tipo_label (codigo, etiqueta, orden, activo)
       VALUES ($1, $2, $3, $4)
       RETURNING id, codigo, etiqueta, orden, activo`,
      [row.codigo, row.etiqueta, row.orden, row.activo]
    );
    return result.rows[0]!;
  }

  async update(
    id: number,
    patch: { etiqueta?: string; orden?: number; activo?: boolean }
  ): Promise<AntecedenteTipoLabelRow> {
    const cur = await this.findById(id);
    if (!cur) {
      throw new Error('NOT_FOUND');
    }
    const etiqueta = patch.etiqueta !== undefined ? patch.etiqueta : cur.etiqueta;
    const orden = patch.orden !== undefined ? patch.orden : cur.orden;
    const activo = patch.activo !== undefined ? patch.activo : cur.activo;
    const result = await postgresPool.query<AntecedenteTipoLabelRow>(
      `UPDATE antecedentes_tipo_label
       SET etiqueta = $1, orden = $2, activo = $3, fecha_actualizacion = NOW()
       WHERE id = $4
       RETURNING id, codigo, etiqueta, orden, activo`,
      [etiqueta, orden, activo, id]
    );
    return result.rows[0]!;
  }

  async deleteById(id: number): Promise<'deleted' | 'not_found'> {
    const row = await this.findById(id);
    if (!row) return 'not_found';
    const n = await this.countUsoByCodigo(row.codigo);
    if (n > 0) {
      throw new Error('ANTEC_TIPO_IN_USE');
    }
    await postgresPool.query(`DELETE FROM antecedentes_tipo_label WHERE id = $1`, [id]);
    return 'deleted';
  }
}
