import { postgresPool } from '../config/database.js';

export interface ClinicaAtencion {
  id: number;
  nombre_clinica: string;
  direccion_clinica: string | null;
  /** WGS84; opcional. Con longitud permite enlace a mapas en correos. */
  latitud: number | null;
  longitud: number | null;
  logo_path: string | null;
  logo_path_recipe: string | null;
  activo: boolean;
  /** Médico de referencia / responsable de la sede (opcional en BD; el API puede exigirlo al crear). */
  medico_id: number | null;
  /** Solo en listados con JOIN a medicos. */
  medico_nombre?: string | null;
  fecha_creacion?: Date;
  fecha_actualizacion?: Date;
}

export interface CreateClinicaAtencionInput {
  nombre_clinica: string;
  direccion_clinica?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  logo_path?: string | null;
  logo_path_recipe?: string | null;
  activo?: boolean;
  medico_id?: number | null;
}

export class ClinicaAtencionService {
  async list(activosOnly: boolean = true): Promise<ClinicaAtencion[]> {
    const client = await postgresPool.connect();
    try {
      const sql = activosOnly
        ? `SELECT cap.id, cap.nombre_clinica, cap.direccion_clinica, cap.latitud, cap.longitud, cap.logo_path, cap.logo_path_recipe,
            cap.activo, cap.medico_id, cap.fecha_creacion, cap.fecha_actualizacion,
            TRIM(CONCAT(COALESCE(m.nombres, ''), ' ', COALESCE(m.apellidos, ''))) AS medico_nombre
           FROM clinica_atencion_pacientes cap
           LEFT JOIN medicos m ON m.id = cap.medico_id
           WHERE cap.activo = true ORDER BY cap.nombre_clinica`
        : `SELECT cap.id, cap.nombre_clinica, cap.direccion_clinica, cap.latitud, cap.longitud, cap.logo_path, cap.logo_path_recipe,
            cap.activo, cap.medico_id, cap.fecha_creacion, cap.fecha_actualizacion,
            TRIM(CONCAT(COALESCE(m.nombres, ''), ' ', COALESCE(m.apellidos, ''))) AS medico_nombre
           FROM clinica_atencion_pacientes cap
           LEFT JOIN medicos m ON m.id = cap.medico_id
           ORDER BY cap.nombre_clinica`;
      const result = await client.query(sql);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async getById(id: number): Promise<ClinicaAtencion | null> {
    const client = await postgresPool.connect();
    try {
      const result = await client.query(
        `SELECT cap.id, cap.nombre_clinica, cap.direccion_clinica, cap.latitud, cap.longitud, cap.logo_path, cap.logo_path_recipe,
            cap.activo, cap.medico_id, cap.fecha_creacion, cap.fecha_actualizacion,
            TRIM(CONCAT(COALESCE(m.nombres, ''), ' ', COALESCE(m.apellidos, ''))) AS medico_nombre
         FROM clinica_atencion_pacientes cap
         LEFT JOIN medicos m ON m.id = cap.medico_id
         WHERE cap.id = $1`,
        [id]
      );
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  /** Primera clínica activa (menor id). Fallback del logo de encabezado del récipe si no hay pies seleccionados. */
  async getFirstActiveId(): Promise<number | null> {
    const client = await postgresPool.connect();
    try {
      const result = await client.query(
        'SELECT id FROM clinica_atencion_pacientes WHERE activo = true ORDER BY id ASC LIMIT 1'
      );
      const id = result.rows[0]?.id;
      return id != null ? Number(id) : null;
    } finally {
      client.release();
    }
  }

  async create(data: CreateClinicaAtencionInput): Promise<ClinicaAtencion> {
    const client = await postgresPool.connect();
    try {
      const result = await client.query(
        `INSERT INTO clinica_atencion_pacientes (nombre_clinica, direccion_clinica, latitud, longitud, logo_path, logo_path_recipe, activo, medico_id, fecha_creacion, fecha_actualizacion)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING id, nombre_clinica, direccion_clinica, latitud, longitud, logo_path, logo_path_recipe, activo, medico_id, fecha_creacion, fecha_actualizacion`,
        [
          data.nombre_clinica,
          data.direccion_clinica ?? null,
          data.latitud ?? null,
          data.longitud ?? null,
          data.logo_path ?? null,
          data.logo_path_recipe ?? null,
          data.activo !== false,
          data.medico_id ?? null
        ]
      );
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async update(id: number, data: Partial<CreateClinicaAtencionInput>): Promise<ClinicaAtencion | null> {
    const client = await postgresPool.connect();
    try {
      const updates: string[] = [];
      const values: unknown[] = [];
      let i = 1;
      if (data.nombre_clinica !== undefined) { updates.push('nombre_clinica = $' + i++); values.push(data.nombre_clinica); }
      if (data.direccion_clinica !== undefined) { updates.push('direccion_clinica = $' + i++); values.push(data.direccion_clinica); }
      if (data.latitud !== undefined) { updates.push('latitud = $' + i++); values.push(data.latitud); }
      if (data.longitud !== undefined) { updates.push('longitud = $' + i++); values.push(data.longitud); }
      if (data.logo_path !== undefined) { updates.push('logo_path = $' + i++); values.push(data.logo_path); }
      if (data.logo_path_recipe !== undefined) { updates.push('logo_path_recipe = $' + i++); values.push(data.logo_path_recipe); }
      if (data.activo !== undefined) { updates.push('activo = $' + i++); values.push(data.activo); }
      if (data.medico_id !== undefined) { updates.push('medico_id = $' + i++); values.push(data.medico_id); }
      if (updates.length === 0) return this.getById(id);
      updates.push('fecha_actualizacion = CURRENT_TIMESTAMP');
      values.push(id);
      const result = await client.query(
        'UPDATE clinica_atencion_pacientes SET ' + updates.join(', ') + ' WHERE id = $' + i + ' RETURNING id, nombre_clinica, direccion_clinica, latitud, longitud, logo_path, logo_path_recipe, activo, medico_id, fecha_creacion, fecha_actualizacion',
        values
      );
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  async delete(id: number): Promise<boolean> {
    const client = await postgresPool.connect();
    try {
      const result = await client.query('DELETE FROM clinica_atencion_pacientes WHERE id = $1', [id]);
      return (result.rowCount ?? 0) > 0;
    } finally {
      client.release();
    }
  }
}

export default new ClinicaAtencionService();
