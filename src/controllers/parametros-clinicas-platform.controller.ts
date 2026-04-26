import { Request, Response } from 'express';
import { postgresPool } from '../config/database.js';
import { ApiResponse } from '../types/index.js';

const ESTATUS = ['activo', 'vencido', 'suspendido', 'cancelado'] as const;

/**
 * node-pg devuelve columnas `date` como `Date`. `String(d).slice(0, 10)` no es YYYY-MM-DD,
 * sino "Thu Jan 01" (inicio del toString() en inglés).
 */
function pgDateToYmd(v: unknown): string {
  if (v == null || v === '') return '';
  const isDateObj =
    typeof v === 'object' &&
    v !== null &&
    (Object.prototype.toString.call(v) === '[object Date]' || v instanceof Date);
  if (isDateObj) {
    const d = v as Date;
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  const s = String(v).trim();
  const head = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (head) return `${head[1]}-${head[2]}-${head[3]}`;
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return '';
}

function pgDateToYmdOrNull(v: unknown): string | null {
  if (v == null || v === '') return null;
  const ymd = pgDateToYmd(v);
  return ymd === '' ? null : ymd;
}

export type ParametroClinicaRow = {
  id: number;
  nombre_clinica_medico: string;
  clinica_alias: string;
  plan: string;
  maximo_medicos: number;
  maximo_pacientes: number;
  monto_pagado: string | null;
  fecha_inicio: string;
  fecha_fin: string | null;
  estatus: string;
  fecha_creacion: string | null;
  fecha_actualizacion: string | null;
};

function rowFromDb(r: Record<string, unknown>): ParametroClinicaRow {
  return {
    id: Number(r['id']),
    nombre_clinica_medico: String(r['nombre_clinica_medico'] ?? ''),
    clinica_alias: String(r['clinica_alias'] ?? ''),
    plan: String(r['plan'] ?? ''),
    maximo_medicos: Number(r['maximo_medicos'] ?? 0),
    maximo_pacientes: Number(r['maximo_pacientes'] ?? 0),
    monto_pagado: r['monto_pagado'] != null ? String(r['monto_pagado']) : null,
    fecha_inicio: pgDateToYmd(r['fecha_inicio']),
    fecha_fin: pgDateToYmdOrNull(r['fecha_fin']),
    estatus: String(r['estatus'] ?? 'activo'),
    fecha_creacion: r['fecha_creacion'] != null ? String(r['fecha_creacion']) : null,
    fecha_actualizacion: r['fecha_actualizacion'] != null ? String(r['fecha_actualizacion']) : null
  };
}

/**
 * CRUD `parametros_clinicas` (límites por plan / clínica) — solo administrador_plataforma.
 */
export class ParametrosClinicasPlatformController {
  async list(_req: Request, res: Response<ApiResponse<ParametroClinicaRow[]>>): Promise<void> {
    const client = await postgresPool.connect();
    try {
      const result = await client.query(
        `SELECT id, nombre_clinica_medico, clinica_alias, plan, maximo_medicos, maximo_pacientes,
                monto_pagado, fecha_inicio, fecha_fin, estatus, fecha_creacion, fecha_actualizacion
         FROM parametros_clinicas
         ORDER BY clinica_alias ASC`
      );
      res.json({
        success: true,
        data: result.rows.map((r) => rowFromDb(r as Record<string, unknown>))
      } as ApiResponse<ParametroClinicaRow[]>);
    } catch (e) {
      res.status(500).json({ success: false, error: { message: (e as Error).message } } as ApiResponse);
    } finally {
      client.release();
    }
  }

  async getById(req: Request<{ id: string }>, res: Response<ApiResponse<ParametroClinicaRow>>): Promise<void> {
    const id = parseInt(req.params['id'] || '', 10);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ success: false, error: { message: 'id inválido' } } as ApiResponse);
      return;
    }
    const client = await postgresPool.connect();
    try {
      const result = await client.query(
        `SELECT id, nombre_clinica_medico, clinica_alias, plan, maximo_medicos, maximo_pacientes,
                monto_pagado, fecha_inicio, fecha_fin, estatus, fecha_creacion, fecha_actualizacion
         FROM parametros_clinicas WHERE id = $1`,
        [id]
      );
      if (result.rows.length === 0) {
        res.status(404).json({ success: false, error: { message: 'No encontrado' } } as ApiResponse);
        return;
      }
      res.json({
        success: true,
        data: rowFromDb(result.rows[0] as Record<string, unknown>)
      } as ApiResponse<ParametroClinicaRow>);
    } catch (e) {
      res.status(500).json({ success: false, error: { message: (e as Error).message } } as ApiResponse);
    } finally {
      client.release();
    }
  }

  async create(req: Request, res: Response<ApiResponse<ParametroClinicaRow>>): Promise<void> {
    const b = req.body as Record<string, unknown>;
    const nombre_clinica_medico = String(b['nombre_clinica_medico'] ?? '').trim();
    const clinica_alias = String(b['clinica_alias'] ?? '').trim().toLowerCase();
    const plan = String(b['plan'] ?? '').trim();
    const maximo_medicos = parseInt(String(b['maximo_medicos'] ?? ''), 10);
    const maximo_pacientes = parseInt(String(b['maximo_pacientes'] ?? ''), 10);
    const monto_raw = b['monto_pagado'];
    let fecha_inicio: string | null =
      b['fecha_inicio'] != null && String(b['fecha_inicio']).trim() !== ''
        ? String(b['fecha_inicio']).slice(0, 10)
        : null;
    const fecha_fin =
      b['fecha_fin'] != null && String(b['fecha_fin']).trim() !== '' ? String(b['fecha_fin']).slice(0, 10) : null;
    let estatus = String(b['estatus'] ?? 'activo').trim();
    if (!ESTATUS.includes(estatus as (typeof ESTATUS)[number])) estatus = 'activo';

    if (!nombre_clinica_medico || !clinica_alias || !plan) {
      res.status(400).json({
        success: false,
        error: { message: 'nombre_clinica_medico, clinica_alias y plan son obligatorios' }
      } as ApiResponse);
      return;
    }
    if (!Number.isFinite(maximo_medicos) || maximo_medicos < 0 || !Number.isFinite(maximo_pacientes) || maximo_pacientes < 0) {
      res.status(400).json({
        success: false,
        error: { message: 'maximo_medicos y maximo_pacientes deben ser enteros ≥ 0' }
      } as ApiResponse);
      return;
    }

    let monto_pagado: number | null = null;
    if (monto_raw != null && String(monto_raw).trim() !== '') {
      const n = parseFloat(String(monto_raw));
      if (!Number.isFinite(n) || n < 0) {
        res.status(400).json({ success: false, error: { message: 'monto_pagado inválido' } } as ApiResponse);
        return;
      }
      monto_pagado = n;
    }

    const client = await postgresPool.connect();
    try {
      const dup = await client.query('SELECT 1 FROM parametros_clinicas WHERE clinica_alias = $1 LIMIT 1', [
        clinica_alias
      ]);
      if (dup.rows.length > 0) {
        res.status(409).json({
          success: false,
          error: { message: 'Ya existe una fila para este clinica_alias' }
        } as ApiResponse);
        return;
      }

      const result = await client.query(
        `INSERT INTO parametros_clinicas (
           nombre_clinica_medico, clinica_alias, plan, maximo_medicos, maximo_pacientes,
           monto_pagado, fecha_inicio, fecha_fin, estatus
         ) VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::date, CURRENT_DATE), $8::date, $9)
         RETURNING id, nombre_clinica_medico, clinica_alias, plan, maximo_medicos, maximo_pacientes,
                   monto_pagado, fecha_inicio, fecha_fin, estatus, fecha_creacion, fecha_actualizacion`,
        [
          nombre_clinica_medico,
          clinica_alias,
          plan,
          maximo_medicos,
          maximo_pacientes,
          monto_pagado,
          fecha_inicio,
          fecha_fin,
          estatus
        ]
      );
      res.status(201).json({
        success: true,
        data: rowFromDb(result.rows[0] as Record<string, unknown>)
      } as ApiResponse<ParametroClinicaRow>);
    } catch (e) {
      res.status(500).json({ success: false, error: { message: (e as Error).message } } as ApiResponse);
    } finally {
      client.release();
    }
  }

  async update(req: Request<{ id: string }>, res: Response<ApiResponse<ParametroClinicaRow>>): Promise<void> {
    const id = parseInt(req.params['id'] || '', 10);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ success: false, error: { message: 'id inválido' } } as ApiResponse);
      return;
    }
    const b = req.body as Record<string, unknown>;
    const client = await postgresPool.connect();
    try {
      const cur = await client.query('SELECT * FROM parametros_clinicas WHERE id = $1', [id]);
      if (cur.rows.length === 0) {
        res.status(404).json({ success: false, error: { message: 'No encontrado' } } as ApiResponse);
        return;
      }
      const row = cur.rows[0] as Record<string, unknown>;

      const nombre_clinica_medico =
        b['nombre_clinica_medico'] !== undefined
          ? String(b['nombre_clinica_medico']).trim()
          : String(row['nombre_clinica_medico'] ?? '');
      const clinica_alias =
        b['clinica_alias'] !== undefined
          ? String(b['clinica_alias']).trim().toLowerCase()
          : String(row['clinica_alias'] ?? '');
      const plan = b['plan'] !== undefined ? String(b['plan']).trim() : String(row['plan'] ?? '');
      const maximo_medicos =
        b['maximo_medicos'] !== undefined ? parseInt(String(b['maximo_medicos']), 10) : Number(row['maximo_medicos']);
      const maximo_pacientes =
        b['maximo_pacientes'] !== undefined
          ? parseInt(String(b['maximo_pacientes']), 10)
          : Number(row['maximo_pacientes']);

      let monto_pagado: number | null =
        row['monto_pagado'] != null ? Number(row['monto_pagado']) : null;
      if (b['monto_pagado'] !== undefined) {
        const raw = b['monto_pagado'];
        if (raw === null || String(raw).trim() === '') monto_pagado = null;
        else {
          const n = parseFloat(String(raw));
          if (!Number.isFinite(n) || n < 0) {
            res.status(400).json({ success: false, error: { message: 'monto_pagado inválido' } } as ApiResponse);
            return;
          }
          monto_pagado = n;
        }
      }

      let fecha_inicio =
        b['fecha_inicio'] !== undefined
          ? String(b['fecha_inicio']).slice(0, 10)
          : pgDateToYmd(row['fecha_inicio']);
      let fecha_fin: string | null =
        b['fecha_fin'] !== undefined
          ? b['fecha_fin'] === null || String(b['fecha_fin']).trim() === ''
            ? null
            : String(b['fecha_fin']).slice(0, 10)
          : pgDateToYmdOrNull(row['fecha_fin']);

      let estatus = b['estatus'] !== undefined ? String(b['estatus']).trim() : String(row['estatus'] ?? 'activo');
      if (!ESTATUS.includes(estatus as (typeof ESTATUS)[number])) estatus = 'activo';

      if (!nombre_clinica_medico || !clinica_alias || !plan) {
        res.status(400).json({ success: false, error: { message: 'Campos obligatorios vacíos' } } as ApiResponse);
        return;
      }
      if (!Number.isFinite(maximo_medicos) || maximo_medicos < 0 || !Number.isFinite(maximo_pacientes) || maximo_pacientes < 0) {
        res.status(400).json({
          success: false,
          error: { message: 'maximo_medicos y maximo_pacientes deben ser enteros ≥ 0' }
        } as ApiResponse);
        return;
      }

      if (clinica_alias !== String(row['clinica_alias'] ?? '').toLowerCase()) {
        const dup = await client.query(
          'SELECT 1 FROM parametros_clinicas WHERE clinica_alias = $1 AND id <> $2 LIMIT 1',
          [clinica_alias, id]
        );
        if (dup.rows.length > 0) {
          res.status(409).json({
            success: false,
            error: { message: 'Ya existe otra fila con este clinica_alias' }
          } as ApiResponse);
          return;
        }
      }

      const result = await client.query(
        `UPDATE parametros_clinicas SET
           nombre_clinica_medico = $1,
           clinica_alias = $2,
           plan = $3,
           maximo_medicos = $4,
           maximo_pacientes = $5,
           monto_pagado = $6,
           fecha_inicio = $7::date,
           fecha_fin = $8::date,
           estatus = $9,
           fecha_actualizacion = CURRENT_TIMESTAMP
         WHERE id = $10
         RETURNING id, nombre_clinica_medico, clinica_alias, plan, maximo_medicos, maximo_pacientes,
                   monto_pagado, fecha_inicio, fecha_fin, estatus, fecha_creacion, fecha_actualizacion`,
        [
          nombre_clinica_medico,
          clinica_alias,
          plan,
          maximo_medicos,
          maximo_pacientes,
          monto_pagado,
          fecha_inicio,
          fecha_fin,
          estatus,
          id
        ]
      );
      res.json({
        success: true,
        data: rowFromDb(result.rows[0] as Record<string, unknown>)
      } as ApiResponse<ParametroClinicaRow>);
    } catch (e) {
      res.status(500).json({ success: false, error: { message: (e as Error).message } } as ApiResponse);
    } finally {
      client.release();
    }
  }

  async remove(req: Request<{ id: string }>, res: Response<ApiResponse<{ id: number }>>): Promise<void> {
    const id = parseInt(req.params['id'] || '', 10);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ success: false, error: { message: 'id inválido' } } as ApiResponse);
      return;
    }
    const client = await postgresPool.connect();
    try {
      const result = await client.query('DELETE FROM parametros_clinicas WHERE id = $1 RETURNING id', [id]);
      if (result.rows.length === 0) {
        res.status(404).json({ success: false, error: { message: 'No encontrado' } } as ApiResponse);
        return;
      }
      res.json({ success: true, data: { id } } as ApiResponse<{ id: number }>);
    } catch (e) {
      res.status(500).json({ success: false, error: { message: (e as Error).message } } as ApiResponse);
    } finally {
      client.release();
    }
  }
}
