import { Request } from 'express';
import { postgresPool } from '../config/database.js';

type JwtUser = { rol?: string; clinica_id?: number | null; userId?: number; medico_id?: number | null };

/**
 * Alias de clínica desde el JWT (`clinica_id` = contexto operativo: admin, secretaría o médico tras login/switch).
 */
export async function getClinicaAliasFilterForReq(req: Request): Promise<string | null> {
  const reqUser = (req as { user?: JwtUser }).user;
  if (!reqUser || reqUser.clinica_id == null || reqUser.clinica_id <= 0) return null;
  const c = await postgresPool.connect();
  try {
    const ar = await c.query(
      'SELECT alias FROM clinicas WHERE id = $1 AND activa = true LIMIT 1',
      [reqUser.clinica_id]
    );
    return ar.rows.length ? (ar.rows[0].alias as string) : null;
  } finally {
    c.release();
  }
}

/**
 * Alias efectivo: JWT (`clinica_id`), tokens legacy médico sin `clinica_id`, luego `CLINICA_ALIAS`.
 */
export async function resolveEfectivaClinicaAlias(req: Request): Promise<string | null> {
  const fromJwt = await getClinicaAliasFilterForReq(req);
  if (fromJwt) return fromJwt;

  const reqUser = (req as { user?: JwtUser }).user;
  if (reqUser?.medico_id != null && reqUser.medico_id > 0) {
    const c = await postgresPool.connect();
    try {
      const r = await c.query(
        `SELECT c.alias AS alias
         FROM medicos_clinicas mc
         INNER JOIN clinicas c ON c.alias = mc.clinica_alias AND c.activa = true
         WHERE mc.medico_id = $1 AND mc.activo = true
         ORDER BY mc.id ASC
         LIMIT 1`,
        [reqUser.medico_id]
      );
      if (r.rows.length) return r.rows[0].alias as string;
    } finally {
      c.release();
    }
  }

  const env = (process.env['CLINICA_ALIAS'] || '').trim();
  return env || null;
}
