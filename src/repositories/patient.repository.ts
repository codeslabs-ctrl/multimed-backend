import { PostgresRepository } from './postgres.repository.js';
import { PaginationInfo } from '../types/index.js';

export interface PatientData {
  id?: number;
  nombres: string;
  apellidos: string;
  cedula?: string;
  edad: number;
  sexo: 'Masculino' | 'Femenino' | 'Otro';
  email?: string;
  telefono?: string;
  remitido_por?: string;
  medico_id?: number;
  motivo_consulta?: string;
  diagnostico?: string;
  conclusiones?: string;
  plan?: string;
  antecedentes_medicos?: string;
  medicamentos?: string;
  alergias?: string;
  observaciones?: string;
  antecedentes_otros?: string;
  fecha_creacion?: string;
  fecha_actualizacion?: string;
}

// Columnas permitidas para UPDATE en la tabla pacientes (evita enviar motivo_consulta, diagnostico, etc. que están en historico)
const PACIENTES_UPDATE_COLUMNS = [
  'nombres', 'apellidos', 'cedula', 'edad', 'sexo', 'email', 'telefono',
  'activo', 'antecedentes_otros', 'remitido_por'
];

// Implementación con PostgreSQL
export class PatientRepository extends PostgresRepository<PatientData> {
  constructor() {
    super('pacientes');
  }

  override async update(id: string | number, data: Partial<PatientData>): Promise<PatientData> {
    const filtered: Record<string, unknown> = {};
    for (const key of PACIENTES_UPDATE_COLUMNS) {
      if (data[key as keyof PatientData] !== undefined) {
        filtered[key] = data[key as keyof PatientData];
      }
    }
    return super.update(id, filtered as Partial<PatientData>);
  }

  async findByEmail(email: string): Promise<PatientData | null> {
    const result = await this.query(
      `SELECT * FROM ${this.tableName} WHERE email = $1 LIMIT 1`,
      [email]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async searchByName(name: string): Promise<PatientData[]> {
    const result = await this.query(
      `SELECT * FROM ${this.tableName} WHERE nombres ILIKE $1 OR apellidos ILIKE $1 ORDER BY id DESC`,
      [`%${name}%`]
    );
    return result.rows;
  }

  async searchByCedula(cedula: string): Promise<PatientData[]> {
    const result = await this.query(
      `SELECT * FROM ${this.tableName} WHERE cedula ILIKE $1 ORDER BY id DESC`,
      [`%${cedula}%`]
    );
    return result.rows;
  }

  /** Coincidencia exacta de cédula (tras trim), para evitar duplicar `pacientes`. */
  async findByCedulaExact(cedula: string): Promise<PatientData | null> {
    const c = (cedula || '').trim();
    if (!c) return null;
    const result = await this.query(
      `SELECT * FROM ${this.tableName} WHERE TRIM(cedula) = $1 LIMIT 1`,
      [c]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /** Busca pacientes por teléfono (solo dígitos; ignora espacios, guiones, puntos). */
  async searchByTelefono(telefono: string): Promise<PatientData[]> {
    const digits = (telefono || '').replace(/\D/g, '');
    if (digits.length < 10) return [];
    const result = await this.query(
      `SELECT * FROM ${this.tableName} WHERE REGEXP_REPLACE(COALESCE(telefono,''), '[^0-9]', '', 'g') = $1 ORDER BY id DESC`,
      [digits]
    );
    return result.rows;
  }

  async getPatientsByAgeRange(minAge: number, maxAge: number): Promise<PatientData[]> {
    const result = await this.query(
      `SELECT * FROM ${this.tableName} WHERE edad >= $1 AND edad <= $2 ORDER BY id DESC`,
      [minAge, maxAge]
    );
    return result.rows;
  }

  async getPatientsBySex(sexo: 'Masculino' | 'Femenino' | 'Otro'): Promise<PatientData[]> {
    const result = await this.query(
      `SELECT * FROM ${this.tableName} WHERE sexo = $1 ORDER BY id DESC`,
      [sexo]
    );
    return result.rows;
  }

  /**
   * Busca pacientes cuyo historial contenga el texto en:
   * - historico_pacientes: diagnostico, motivo_consulta, plan, examenes_medico, examenes_paraclinicos
   * - antecedente_paciente: detalle (antecedentes estandarizados + pacientes.antecedentes_otros)
   */
  async searchByPatologia(q: string, medicoId: number | null): Promise<PatientData[]> {
    const searchTerm = '%' + q.replace(/%/g, '\\%').replace(/_/g, '\\_') + '%';
    const result = await this.query(
      `SELECT DISTINCT p.*
       FROM pacientes p
       INNER JOIN historico_pacientes h ON h.paciente_id = p.id
       LEFT JOIN antecedente_paciente ap ON ap.paciente_id = p.id
       WHERE (
         (h.diagnostico IS NOT NULL AND h.diagnostico ILIKE $1)
         OR (h.motivo_consulta IS NOT NULL AND h.motivo_consulta ILIKE $1)
         OR (p.antecedentes_otros IS NOT NULL AND TRIM(p.antecedentes_otros) <> '' AND p.antecedentes_otros ILIKE $1)
         OR (h.plan IS NOT NULL AND h.plan ILIKE $1)
         OR (h.examenes_medico IS NOT NULL AND h.examenes_medico ILIKE $1)
         OR (h.examenes_paraclinicos IS NOT NULL AND h.examenes_paraclinicos ILIKE $1)
         OR (ap.detalle IS NOT NULL AND TRIM(ap.detalle) <> '' AND ap.detalle ILIKE $1)
       )
       AND ($2::int IS NULL OR h.medico_id = $2)
       ORDER BY p.apellidos, p.nombres`,
      [searchTerm, medicoId]
    );
    return result.rows as PatientData[];
  }

  // Sobrescribir findAll para manejar correctamente los filtros de edad
  override async findAll(
    filters: Record<string, any> = {},
    pagination: { page: number; limit: number } = { page: 1, limit: 10 }
  ): Promise<{ data: PatientData[]; pagination: PaginationInfo }> {
    const client = await this.getClient();
    try {
      const { page, limit } = pagination;
      const offset = (page - 1) * limit;

      // Separar filtros de edad de otros filtros
      const { edad_min, edad_max, ...otherFilters } = filters;
      
      // Construir condiciones WHERE
      const conditions: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      // Filtro de edad mínima
      if (edad_min !== null && edad_min !== undefined && edad_min !== '') {
        conditions.push(`edad >= $${paramIndex}`);
        values.push(Number(edad_min));
        paramIndex++;
      }

      // Filtro de edad máxima
      if (edad_max !== null && edad_max !== undefined && edad_max !== '') {
        conditions.push(`edad <= $${paramIndex}`);
        values.push(Number(edad_max));
        paramIndex++;
      }

      // Procesar otros filtros
      Object.entries(otherFilters).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
          if (Array.isArray(value)) {
            conditions.push(`${key} = ANY($${paramIndex})`);
            values.push(value);
            paramIndex++;
          } else if (typeof value === 'string' && value.includes('%')) {
            conditions.push(`${key} ILIKE $${paramIndex}`);
            values.push(value);
            paramIndex++;
          } else if (key === 'nombres' || key === 'apellidos') {
            // Búsqueda parcial para nombres y apellidos
            conditions.push(`${key} ILIKE $${paramIndex}`);
            values.push(`%${value}%`);
            paramIndex++;
          } else {
            conditions.push(`${key} = $${paramIndex}`);
            values.push(value);
            paramIndex++;
          }
        }
      });

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Count query
      const countQuery = `SELECT COUNT(*) as total FROM ${this.tableName} ${whereClause}`;
      const countResult = await client.query(countQuery, values);
      const total = parseInt(countResult.rows[0].total);

      // Data query
      const dataQuery = `
        SELECT * FROM ${this.tableName} 
        ${whereClause}
        ORDER BY ${this.idColumn} DESC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}
      `;
      const dataResult = await client.query(dataQuery, [...values, limit, offset]);

      const paginationInfo: PaginationInfo = {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      };

      return {
        data: dataResult.rows as PatientData[],
        pagination: paginationInfo
      };
    } catch (error) {
      throw new Error(`Failed to fetch patients: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }
}

// Exportar el tipo para uso en TypeScript
export type PatientRepositoryType = typeof PatientRepository;
