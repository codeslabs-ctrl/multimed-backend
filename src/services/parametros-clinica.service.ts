import { postgresPool } from '../config/database.js';

/** Límites desde parametros_clinicas (por fila; filtrar con `clinica_alias` en MultiMed). */
export interface LimitesClinica {
  maximo_medicos: number;
  maximo_pacientes: number;
}

/**
 * Obtiene maximo_medicos y maximo_pacientes de parametros_clinicas.
 * @param clinicaAlias Si se indica, filtra por columna `clinica_alias` (antes `alias_clinica`).
 */
export async function getLimitesConfigurada(clinicaAlias?: string | null): Promise<LimitesClinica | null> {
  const client = await postgresPool.connect();
  try {
    const alias = clinicaAlias != null ? String(clinicaAlias).trim() : '';
    const result =
      alias !== ''
        ? await client.query(
            `SELECT maximo_medicos, maximo_pacientes
             FROM parametros_clinicas
             WHERE estatus = 'activo'
               AND (fecha_fin IS NULL OR fecha_fin >= CURRENT_DATE)
               AND clinica_alias = $1
             LIMIT 1`,
            [alias]
          )
        : await client.query(
            `SELECT maximo_medicos, maximo_pacientes
             FROM parametros_clinicas
             WHERE estatus = 'activo'
               AND (fecha_fin IS NULL OR fecha_fin >= CURRENT_DATE)
             LIMIT 1`
          );
    if (result.rows.length === 0) return null;
    return {
      maximo_medicos: Number(result.rows[0].maximo_medicos),
      maximo_pacientes: Number(result.rows[0].maximo_pacientes)
    };
  } catch {
    // Tabla inexistente o error de BD: no aplicar límites
    return null;
  } finally {
    client.release();
  }
}

/**
 * Conteo de médicos (medicos_clinicas).
 */
export async function getConteoMedicosConfigurada(): Promise<number> {
  const client = await postgresPool.connect();
  try {
    const result = await client.query(
      `SELECT COUNT(*)::int AS total FROM medicos_clinicas`
    );
    return Number(result.rows[0]?.total ?? 0);
  } catch {
    return 0;
  } finally {
    client.release();
  }
}

/** Médicos vinculados a una clínica (por alias). */
export async function getConteoMedicosEnClinica(clinicaAlias: string): Promise<number> {
  const client = await postgresPool.connect();
  try {
    const result = await client.query(
      `SELECT COUNT(*)::int AS total FROM medicos_clinicas WHERE clinica_alias = $1`,
      [clinicaAlias]
    );
    return Number(result.rows[0]?.total ?? 0);
  } catch {
    return 0;
  } finally {
    client.release();
  }
}

/** Pacientes de una clínica (por clinica_alias en tabla pacientes). */
export async function getConteoPacientesEnClinica(clinicaAlias: string): Promise<number> {
  const client = await postgresPool.connect();
  try {
    const result = await client.query(
      `SELECT COUNT(*)::int AS total FROM pacientes WHERE clinica_alias = $1`,
      [clinicaAlias]
    );
    return Number(result.rows[0]?.total ?? 0);
  } catch {
    return 0;
  } finally {
    client.release();
  }
}

/**
 * Conteo global de pacientes (sin filtro de clínica).
 */
export async function getConteoPacientesConfigurada(): Promise<number> {
  const client = await postgresPool.connect();
  try {
    const result = await client.query(
      `SELECT COUNT(*)::int AS total FROM pacientes`
    );
    return Number(result.rows[0]?.total ?? 0);
  } finally {
    client.release();
  }
}

/**
 * Valida si se puede agregar un médico según límites de parametros_clinicas.
 * Lanza error si se alcanzó el máximo.
 */
export async function checkLimiteMedicos(): Promise<void> {
  const limites = await getLimitesConfigurada();
  if (!limites) return;
  const actual = await getConteoMedicosConfigurada();
  if (actual >= limites.maximo_medicos) {
    throw new Error(
      `No se puede agregar más médicos. Límite del plan: ${limites.maximo_medicos}. Actual: ${actual}.`
    );
  }
}

/**
 * Límites de la fila de parametros_clinicas que coincide con `clinica_alias`, conteo en esa clínica.
 */
export async function checkLimiteMedicosParaClinica(clinicaAlias: string): Promise<void> {
  const limites = await getLimitesConfigurada(clinicaAlias);
  if (!limites) return;
  const actual = await getConteoMedicosEnClinica(clinicaAlias);
  if (actual >= limites.maximo_medicos) {
    throw new Error(
      `No se puede agregar más médicos en esta clínica. Límite del plan: ${limites.maximo_medicos}. Actual en la clínica: ${actual}.`
    );
  }
}

/**
 * Valida si se puede agregar un paciente según límites globales (sin filtro por clínica en parametros).
 */
export async function checkLimitePacientes(): Promise<void> {
  const limites = await getLimitesConfigurada();
  if (!limites) return;
  const actual = await getConteoPacientesConfigurada();
  if (actual >= limites.maximo_pacientes) {
    throw new Error(
      `No se puede agregar más pacientes. Límite del plan: ${limites.maximo_pacientes}. Actual: ${actual}.`
    );
  }
}

/**
 * Límites de parametros_clinicas para `clinica_alias` y conteo de pacientes en esa clínica.
 */
export async function checkLimitePacientesParaClinica(clinicaAlias: string): Promise<void> {
  const limites = await getLimitesConfigurada(clinicaAlias);
  if (!limites) return;
  const actual = await getConteoPacientesEnClinica(clinicaAlias);
  if (actual >= limites.maximo_pacientes) {
    throw new Error(
      `No se puede agregar más pacientes en esta clínica. Límite del plan: ${limites.maximo_pacientes}. Actual en la clínica: ${actual}.`
    );
  }
}
