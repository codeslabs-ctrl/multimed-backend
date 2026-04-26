import { PostgresRepository } from './postgres.repository.js';

export interface AntecedenteMedicoTipoData {
  id?: number;
  /** NULL = catálogo de clínica; NOT NULL = ítem propio de un médico */
  medico_id?: number | null;
  tipo: string;
  nombre: string;
  requiere_detalle: string;
  orden: number;
  activo: boolean;
  fecha_creacion?: string;
  fecha_actualizacion?: string;
}

/** Filtro al listar por categoría: todo el catálogo, solo global, o global + un médico. */
export type MedicoFiltroAntecedente = 'all' | 'solo_global' | { globalYMedico: number };

export class AntecedenteTipoRepository extends PostgresRepository<AntecedenteMedicoTipoData> {
  constructor() {
    super('antecedente_medico_tipo');
  }

  async findByTipo(
    tipo: string,
    soloActivos = true,
    filtro: MedicoFiltroAntecedente = 'solo_global'
  ): Promise<AntecedenteMedicoTipoData[]> {
    const conditions = ['tipo = $1'];
    const values: any[] = [tipo];
    let p = 2;
    if (soloActivos) {
      conditions.push(`activo = $${p++}`);
      values.push(true);
    }
    if (filtro === 'solo_global') {
      conditions.push('medico_id IS NULL');
    } else if (filtro !== 'all' && filtro.globalYMedico) {
      conditions.push(`(medico_id IS NULL OR medico_id = $${p++})`);
      values.push(filtro.globalYMedico);
    }
    const result = await this.query(
      `SELECT * FROM ${this.tableName} WHERE ${conditions.join(' AND ')} ORDER BY medico_id NULLS FIRST, orden ASC, id ASC`,
      values
    );
    return result.rows as AntecedenteMedicoTipoData[];
  }
}
