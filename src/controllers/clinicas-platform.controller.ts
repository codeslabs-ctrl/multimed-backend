import { Request, Response } from 'express';
import type { PoolClient } from 'pg';
import bcrypt from 'bcryptjs';
import { postgresPool } from '../config/database.js';
import { ApiResponse } from '../types/index.js';

/**
 * CRUD de clínicas solo para administrador_plataforma (MultiMed).
 * Plan comercial: FK `plan_id` → `planes_comparativos` (catálogo).
 */
export type PlanComparativoRow = {
  id: number;
  plan: string;
  costo_base: string | null;
  medicos_incluidos: string | null;
  pacientes_incluidos: string | null;
  almacenamiento: string | null;
  orden: number;
};

export type ClinicaDashboardRow = {
  id: number;
  alias: string;
  nombre_clinica: string;
  descripcion: string | null;
  activa: boolean;
  fecha_creacion: Date;
  fecha_actualizacion: Date;
  plan_id: number | null;
  plan_catalogo_plan: string | null;
  plan_catalogo_costo_base: string | null;
  plan_catalogo_medicos_incluidos: string | null;
  plan_catalogo_pacientes_incluidos: string | null;
  plan_catalogo_almacenamiento: string | null;
  /** @deprecated Prefer plan_id + planes_comparativos */
  plan_nombre: string | null;
  max_medicos_plan: number | null;
  max_pacientes_plan: number | null;
  total_medicos: number;
  total_pacientes: number;
  /**
   * Límites desde `parametros_clinicas` (estatus activo y vigencia de fechas), alineado con `getLimitesConfigurada`.
   * Si no hay fila para el alias, el cliente usa el plan (`planes_comparativos` / columnas legacy en `clinicas`).
   */
  maximo_medicos_parametros?: number | null;
  maximo_pacientes_parametros?: number | null;
  /** Agregado en dashboard: usuarios `administrador_clinica` (login y email). */
  administradores_clinica?: string | null;
};

export class ClinicasPlatformController {
  /** Catálogo de planes (tabla `planes_comparativos`). */
  async planesCatalogo(_req: Request, res: Response<ApiResponse<PlanComparativoRow[]>>): Promise<void> {
    const client = await postgresPool.connect();
    try {
      const result = await client.query(
        `SELECT id, plan, costo_base, medicos_incluidos, pacientes_incluidos, almacenamiento, orden
         FROM planes_comparativos
         ORDER BY orden ASC, id ASC`
      );
      res.json({ success: true, data: result.rows } as ApiResponse<PlanComparativoRow[]>);
    } catch (e) {
      res.status(500).json({ success: false, error: { message: (e as Error).message } } as ApiResponse);
    } finally {
      client.release();
    }
  }

  async dashboardStats(_req: Request, res: Response<ApiResponse<ClinicaDashboardRow[]>>): Promise<void> {
    const client = await postgresPool.connect();
    const sqlFull = `SELECT
          c.id,
          c.alias,
          c.nombre_clinica,
          c.descripcion,
          c.activa,
          c.fecha_creacion,
          c.fecha_actualizacion,
          c.plan_id,
          pl.plan AS plan_catalogo_plan,
          pl.costo_base AS plan_catalogo_costo_base,
          pl.medicos_incluidos AS plan_catalogo_medicos_incluidos,
          pl.pacientes_incluidos AS plan_catalogo_pacientes_incluidos,
          pl.almacenamiento AS plan_catalogo_almacenamiento,
          c.plan_nombre,
          c.max_medicos_plan,
          c.max_pacientes_plan,
          COALESCE(
            (SELECT COUNT(*)::int FROM medicos_clinicas mc
             WHERE mc.clinica_alias = c.alias AND mc.activo = true),
            0
          ) AS total_medicos,
          COALESCE(
            (SELECT COUNT(*)::int FROM pacientes px WHERE px.clinica_alias = c.alias),
            0
          ) AS total_pacientes
        FROM clinicas c
        LEFT JOIN planes_comparativos pl ON pl.id = c.plan_id
        ORDER BY c.nombre_clinica ASC`;
    const sqlNoLegacyPlanCols = `SELECT
          c.id,
          c.alias,
          c.nombre_clinica,
          c.descripcion,
          c.activa,
          c.fecha_creacion,
          c.fecha_actualizacion,
          c.plan_id,
          pl.plan AS plan_catalogo_plan,
          pl.costo_base AS plan_catalogo_costo_base,
          pl.medicos_incluidos AS plan_catalogo_medicos_incluidos,
          pl.pacientes_incluidos AS plan_catalogo_pacientes_incluidos,
          pl.almacenamiento AS plan_catalogo_almacenamiento,
          NULL::text AS plan_nombre,
          NULL::int AS max_medicos_plan,
          NULL::int AS max_pacientes_plan,
          COALESCE(
            (SELECT COUNT(*)::int FROM medicos_clinicas mc
             WHERE mc.clinica_alias = c.alias AND mc.activo = true),
            0
          ) AS total_medicos,
          COALESCE(
            (SELECT COUNT(*)::int FROM pacientes px WHERE px.clinica_alias = c.alias),
            0
          ) AS total_pacientes
        FROM clinicas c
        LEFT JOIN planes_comparativos pl ON pl.id = c.plan_id
        ORDER BY c.nombre_clinica ASC`;
    const sqlNoPlanId = `SELECT
          c.id,
          c.alias,
          c.nombre_clinica,
          c.descripcion,
          c.activa,
          c.fecha_creacion,
          c.fecha_actualizacion,
          NULL::int AS plan_id,
          NULL::text AS plan_catalogo_plan,
          NULL::text AS plan_catalogo_costo_base,
          NULL::text AS plan_catalogo_medicos_incluidos,
          NULL::text AS plan_catalogo_pacientes_incluidos,
          NULL::text AS plan_catalogo_almacenamiento,
          NULL::text AS plan_nombre,
          NULL::int AS max_medicos_plan,
          NULL::int AS max_pacientes_plan,
          COALESCE(
            (SELECT COUNT(*)::int FROM medicos_clinicas mc
             WHERE mc.clinica_alias = c.alias AND mc.activo = true),
            0
          ) AS total_medicos,
          COALESCE(
            (SELECT COUNT(*)::int FROM pacientes px WHERE px.clinica_alias = c.alias),
            0
          ) AS total_pacientes
        FROM clinicas c
        ORDER BY c.nombre_clinica ASC`;
    try {
      let result;
      try {
        result = await client.query(sqlFull);
      } catch (first: unknown) {
        const msg = (first as Error).message || '';
        if (msg.includes('plan_id') || msg.includes('plan_nombre') || msg.includes('column') || msg.includes('does not exist')) {
          try {
            result = await client.query(sqlNoLegacyPlanCols);
          } catch (second: unknown) {
            const msg2 = (second as Error).message || '';
            if (msg2.includes('plan_id') || msg2.includes('does not exist')) {
              result = await client.query(sqlNoPlanId);
            } else {
              throw second;
            }
          }
        } else {
          throw first;
        }
      }
      const rows = result.rows as ClinicaDashboardRow[];
      await this.attachParametrosLimitesDashboard(client, rows);
      await this.attachAdministradoresClinicaDashboard(client, rows);
      res.json({ success: true, data: rows } as ApiResponse<ClinicaDashboardRow[]>);
    } catch (e) {
      res.status(500).json({ success: false, error: { message: (e as Error).message } } as ApiResponse);
    } finally {
      client.release();
    }
  }

  /**
   * Rellena `maximo_medicos_parametros` / `maximo_pacientes_parametros` desde `parametros_clinicas`
   * (misma regla que `getLimitesConfigurada` en parametros-clinica.service).
   */
  private async attachParametrosLimitesDashboard(
    client: PoolClient,
    rows: ClinicaDashboardRow[]
  ): Promise<void> {
    if (rows.length === 0) return;
    const aliases = [...new Set(rows.map((r) => r.alias).filter((a) => a != null && String(a).trim() !== ''))];
    if (aliases.length === 0) return;
    try {
      const result = await client.query(
        `SELECT DISTINCT ON (clinica_alias) clinica_alias, maximo_medicos, maximo_pacientes
           FROM parametros_clinicas
          WHERE clinica_alias = ANY($1::text[])
            AND estatus = 'activo'
            AND (fecha_fin IS NULL OR fecha_fin >= CURRENT_DATE)
          ORDER BY clinica_alias, id DESC`,
        [aliases]
      );
      const byAlias = new Map<string, { m: number; p: number }>();
      for (const row of result.rows as {
        clinica_alias: string;
        maximo_medicos: unknown;
        maximo_pacientes: unknown;
      }[]) {
        byAlias.set(row.clinica_alias, {
          m: Number(row.maximo_medicos),
          p: Number(row.maximo_pacientes)
        });
      }
      for (const row of rows) {
        const lim = byAlias.get(row.alias);
        if (lim) {
          row.maximo_medicos_parametros = lim.m;
          row.maximo_pacientes_parametros = lim.p;
        }
      }
    } catch {
      // Tabla ausente u error: el dashboard sigue con topes solo desde plan
    }
  }

  /**
   * Rellena `administradores_clinica` por clínica (usuarios con rol administrador_clinica).
   * Si falta columna `clinica_id` u otra causa de error, no falla el dashboard.
   */
  private async attachAdministradoresClinicaDashboard(
    client: PoolClient,
    rows: ClinicaDashboardRow[]
  ): Promise<void> {
    if (rows.length === 0) return;
    try {
      const agg = await client.query(
        `SELECT u.clinica_id AS id,
                string_agg(u.username || ' · ' || u.email, ', ' ORDER BY u.username) AS txt
           FROM usuarios u
          WHERE u.rol = 'administrador_clinica'
            AND u.clinica_id IS NOT NULL
          GROUP BY u.clinica_id`
      );
      const byId = new Map<number, string>();
      for (const r of agg.rows as { id: number; txt: string }[]) {
        byId.set(r.id, r.txt);
      }
      for (const row of rows) {
        row.administradores_clinica = byId.get(row.id) ?? null;
      }
    } catch {
      for (const row of rows) {
        row.administradores_clinica = null;
      }
    }
  }

  async list(_req: Request, res: Response<ApiResponse>): Promise<void> {
    const client = await postgresPool.connect();
    try {
      let result;
      try {
        result = await client.query(
          `SELECT c.id, c.alias, c.nombre_clinica, c.descripcion, c.activa,
                  c.plan_id, c.plan_nombre, c.max_medicos_plan, c.max_pacientes_plan,
                  c.fecha_creacion, c.fecha_actualizacion
           FROM clinicas c ORDER BY c.nombre_clinica ASC`
        );
      } catch {
        result = await client.query(
          `SELECT id, alias, nombre_clinica, descripcion, activa, fecha_creacion, fecha_actualizacion
           FROM clinicas ORDER BY nombre_clinica ASC`
        );
      }
      res.json({ success: true, data: result.rows } as ApiResponse);
    } catch (e) {
      res.status(500).json({ success: false, error: { message: (e as Error).message } } as ApiResponse);
    } finally {
      client.release();
    }
  }

  async create(
    req: Request<
      {},
      ApiResponse,
      {
        alias: string;
        nombre_clinica: string;
        descripcion?: string;
        plan_id?: number | null | string;
        plan_nombre?: string | null;
        max_medicos_plan?: number | null;
        max_pacientes_plan?: number | null;
        /** Si true, crea usuario `administrador_clinica` ligado a la clínica nueva. */
        crear_admin_clinica?: boolean | string;
        admin_username?: string;
        admin_email?: string;
        admin_password?: string;
      }
    >,
    res: Response<ApiResponse>
  ): Promise<void> {
    try {
      const {
        alias,
        nombre_clinica,
        descripcion,
        plan_id,
        plan_nombre,
        max_medicos_plan,
        max_pacientes_plan,
        crear_admin_clinica,
        admin_username,
        admin_email,
        admin_password
      } = req.body;
      if (!alias?.trim() || !nombre_clinica?.trim()) {
        res.status(400).json({ success: false, error: { message: 'alias y nombre_clinica son requeridos' } } as ApiResponse);
        return;
      }
      const rawPid = plan_id as unknown;
      const pid =
        rawPid === null || rawPid === undefined || rawPid === '' ? null : Number(rawPid);
      if (pid != null && (Number.isNaN(pid) || pid <= 0)) {
        res.status(400).json({ success: false, error: { message: 'plan_id inválido' } } as ApiResponse);
        return;
      }

      const crearAdmin =
        crear_admin_clinica === true || crear_admin_clinica === 'true' || crear_admin_clinica === '1';
      const admUser = admin_username?.trim();
      const admEmail = admin_email?.trim();
      const admPass = admin_password != null ? String(admin_password) : '';

      if (crearAdmin) {
        if (!admUser || admUser.length < 3) {
          res.status(400).json({
            success: false,
            error: { message: 'Administrador de clínica: username de al menos 3 caracteres' }
          } as ApiResponse);
          return;
        }
        if (!admEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admEmail)) {
          res.status(400).json({
            success: false,
            error: { message: 'Administrador de clínica: email válido requerido' }
          } as ApiResponse);
          return;
        }
        if (!admPass || admPass.length < 6) {
          res.status(400).json({
            success: false,
            error: { message: 'Administrador de clínica: contraseña de al menos 6 caracteres' }
          } as ApiResponse);
          return;
        }
      }

      const client = await postgresPool.connect();
      try {
        await client.query('BEGIN');

        const clinicRow = await this.insertClinicaRow(client, {
          alias: alias.trim(),
          nombre_clinica: nombre_clinica.trim(),
          descripcion: descripcion?.trim() || null,
          pid,
          plan_nombre: plan_nombre?.trim() || null,
          max_medicos_plan: max_medicos_plan != null ? Number(max_medicos_plan) : null,
          max_pacientes_plan: max_pacientes_plan != null ? Number(max_pacientes_plan) : null
        });

        if (crearAdmin && admUser && admEmail && admPass) {
          const passwordHash = await bcrypt.hash(admPass, 10);
          const clinicaId = Number(clinicRow['id']);
          await client.query(
            `INSERT INTO usuarios (
              username, email, password_hash, rol, medico_id, clinica_id,
              activo, verificado, first_login, password_changed_at,
              fecha_creacion, fecha_actualizacion
            ) VALUES ($1, $2, $3, 'administrador_clinica', NULL, $4, true, true, true, NULL, NOW(), NOW())`,
            [admUser, admEmail, passwordHash, clinicaId]
          );
        }

        await client.query('COMMIT');
        res.status(201).json({
          success: true,
          data: {
            clinica: clinicRow,
            admin_clinica_creado: crearAdmin,
            ...(crearAdmin && admUser && admEmail
              ? { admin_username: admUser, admin_email: admEmail }
              : {})
          }
        } as ApiResponse);
      } catch (dbErr: unknown) {
        await client.query('ROLLBACK').catch(() => {});
        const err = dbErr as { code?: string; constraint?: string };
        if (err.code === '23505') {
          const c = err.constraint || '';
          if (c.includes('usuarios') || c.includes('username') || c.includes('email')) {
            res.status(400).json({
              success: false,
              error: { message: 'Ya existe un usuario con ese username o email' }
            } as ApiResponse);
            return;
          }
          res.status(400).json({ success: false, error: { message: 'Ya existe una clínica con ese alias' } } as ApiResponse);
          return;
        }
        if (err.code === '23503') {
          res.status(400).json({
            success: false,
            error: { message: 'El plan indicado no existe en planes_comparativos' }
          } as ApiResponse);
          return;
        }
        res.status(500).json({ success: false, error: { message: (dbErr as Error).message } } as ApiResponse);
      } finally {
        client.release();
      }
    } catch (e) {
      res.status(500).json({ success: false, error: { message: (e as Error).message } } as ApiResponse);
    }
  }

  /** Inserta fila en `clinicas` con fallbacks si faltan columnas de plan (misma lógica que antes). */
  private async insertClinicaRow(
    client: PoolClient,
    args: {
      alias: string;
      nombre_clinica: string;
      descripcion: string | null;
      pid: number | null;
      plan_nombre: string | null;
      max_medicos_plan: number | null;
      max_pacientes_plan: number | null;
    }
  ): Promise<Record<string, unknown>> {
    const { alias, nombre_clinica, descripcion, pid, plan_nombre, max_medicos_plan, max_pacientes_plan } = args;
    try {
      const result = await client.query(
        `INSERT INTO clinicas (alias, nombre_clinica, descripcion, activa, plan_id, plan_nombre, max_medicos_plan, max_pacientes_plan)
         VALUES ($1, $2, $3, true, $4, $5, $6, $7)
         RETURNING *`,
        [alias, nombre_clinica, descripcion, pid, plan_nombre, max_medicos_plan, max_pacientes_plan]
      );
      return result.rows[0] as Record<string, unknown>;
    } catch (ins: unknown) {
      const msg = (ins as Error).message || '';
      if (msg.includes('plan_id') || msg.includes('column') || msg.includes('does not exist')) {
        try {
          const result = await client.query(
            `INSERT INTO clinicas (alias, nombre_clinica, descripcion, activa, plan_nombre, max_medicos_plan, max_pacientes_plan)
             VALUES ($1, $2, $3, true, $4, $5, $6)
             RETURNING *`,
            [alias, nombre_clinica, descripcion, plan_nombre, max_medicos_plan, max_pacientes_plan]
          );
          return result.rows[0] as Record<string, unknown>;
        } catch {
          const result = await client.query(
            `INSERT INTO clinicas (alias, nombre_clinica, descripcion, activa)
             VALUES ($1, $2, $3, true)
             RETURNING id, alias, nombre_clinica, descripcion, activa, fecha_creacion, fecha_actualizacion`,
            [alias, nombre_clinica, descripcion]
          );
          return result.rows[0] as Record<string, unknown>;
        }
      }
      throw ins;
    }
  }

  async update(
    req: Request<
      { id: string },
      ApiResponse,
      {
        nombre_clinica?: string;
        descripcion?: string;
        activa?: boolean;
        plan_id?: number | null | string;
        plan_nombre?: string | null;
        max_medicos_plan?: number | null;
        max_pacientes_plan?: number | null;
      }
    >,
    res: Response<ApiResponse>
  ): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id) || id <= 0) {
        res.status(400).json({ success: false, error: { message: 'ID inválido' } } as ApiResponse);
        return;
      }
      const { nombre_clinica, descripcion, activa, plan_id, plan_nombre, max_medicos_plan, max_pacientes_plan } = req.body;
      const client = await postgresPool.connect();
      try {
        const sets: string[] = [];
        const vals: unknown[] = [];
        let i = 1;
        if (nombre_clinica !== undefined) {
          sets.push(`nombre_clinica = $${i++}`);
          vals.push(nombre_clinica);
        }
        if (descripcion !== undefined) {
          sets.push(`descripcion = $${i++}`);
          vals.push(descripcion);
        }
        if (activa !== undefined) {
          sets.push(`activa = $${i++}`);
          vals.push(activa);
        }
        if (plan_id !== undefined) {
          sets.push(`plan_id = $${i++}`);
          vals.push(plan_id === null || plan_id === '' ? null : Number(plan_id));
        }
        if (plan_nombre !== undefined) {
          sets.push(`plan_nombre = $${i++}`);
          vals.push(plan_nombre?.trim() || null);
        }
        if (max_medicos_plan !== undefined) {
          sets.push(`max_medicos_plan = $${i++}`);
          vals.push(max_medicos_plan === null || max_medicos_plan === undefined ? null : Number(max_medicos_plan));
        }
        if (max_pacientes_plan !== undefined) {
          sets.push(`max_pacientes_plan = $${i++}`);
          vals.push(max_pacientes_plan === null || max_pacientes_plan === undefined ? null : Number(max_pacientes_plan));
        }
        if (sets.length === 0) {
          res.status(400).json({ success: false, error: { message: 'Nada que actualizar' } } as ApiResponse);
          return;
        }
        sets.push('fecha_actualizacion = CURRENT_TIMESTAMP');
        vals.push(id);
        let result;
        try {
          result = await client.query(`UPDATE clinicas SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, vals);
        } catch (upd: unknown) {
          const msg = (upd as Error).message || '';
          if (msg.includes('plan_id') && plan_id !== undefined) {
            res.status(400).json({
              success: false,
              error: {
                message:
                  'La columna plan_id no existe. Ejecute migrations/clinicas_plan_id_planes_comparativos.sql'
              }
            } as ApiResponse);
            return;
          }
          const err = upd as { code?: string };
          if (err.code === '23503') {
            res.status(400).json({ success: false, error: { message: 'El plan indicado no existe en planes_comparativos' } } as ApiResponse);
            return;
          }
          if (
            (msg.includes('plan_nombre') || msg.includes('column') || msg.includes('does not exist')) &&
            (plan_nombre !== undefined || max_medicos_plan !== undefined || max_pacientes_plan !== undefined)
          ) {
            res.status(400).json({
              success: false,
              error: {
                message:
                  'Faltan columnas de plan en clinicas. Ejecute migrations/clinicas_plan_y_limites.sql'
              }
            } as ApiResponse);
            return;
          }
          throw upd;
        }
        if (result.rows.length === 0) {
          res.status(404).json({ success: false, error: { message: 'Clínica no encontrada' } } as ApiResponse);
          return;
        }
        res.json({ success: true, data: result.rows[0] } as ApiResponse);
      } finally {
        client.release();
      }
    } catch (e) {
      res.status(500).json({ success: false, error: { message: (e as Error).message } } as ApiResponse);
    }
  }

  /** Usuarios con `clinica_id` = clínica (operativos de esa sede). Sin `password_hash`. */
  async usuariosByClinica(req: Request<{ id: string }>, res: Response<ApiResponse>): Promise<void> {
    const clinicaId = parseInt(req.params.id, 10);
    if (isNaN(clinicaId) || clinicaId <= 0) {
      res.status(400).json({ success: false, error: { message: 'ID de clínica inválido' } } as ApiResponse);
      return;
    }
    const client = await postgresPool.connect();
    try {
      const c = await client.query('SELECT id FROM clinicas WHERE id = $1', [clinicaId]);
      if (c.rows.length === 0) {
        res.status(404).json({ success: false, error: { message: 'Clínica no encontrada' } } as ApiResponse);
        return;
      }
      const u = await client.query(
        `SELECT id, username, email, rol, medico_id, clinica_id, activo, verificado, first_login,
                password_changed_at, fecha_creacion, fecha_actualizacion
         FROM usuarios
         WHERE clinica_id = $1
         ORDER BY username ASC`,
        [clinicaId]
      );
      res.json({ success: true, data: u.rows } as ApiResponse);
    } catch (e) {
      const msg = (e as Error).message || '';
      if (msg.includes('clinica_id') || msg.includes('does not exist')) {
        res.status(500).json({
          success: false,
          error: { message: 'Falta columna clinica_id en usuarios. Ejecute la migración MultiMed correspondiente.' }
        } as ApiResponse);
        return;
      }
      res.status(500).json({ success: false, error: { message: msg } } as ApiResponse);
    } finally {
      client.release();
    }
  }

  /** Alta de usuario `administrador_clinica` para una clínica existente. */
  async createUsuarioClinica(
    req: Request<
      { id: string },
      ApiResponse,
      { username?: string; email?: string; password?: string }
    >,
    res: Response<ApiResponse>
  ): Promise<void> {
    try {
      const clinicaId = parseInt(req.params.id, 10);
      if (isNaN(clinicaId) || clinicaId <= 0) {
        res.status(400).json({ success: false, error: { message: 'ID de clínica inválido' } } as ApiResponse);
        return;
      }
      const username = req.body.username?.trim();
      const email = req.body.email?.trim();
      const password = req.body.password != null ? String(req.body.password) : '';
      if (!username || username.length < 3) {
        res.status(400).json({ success: false, error: { message: 'username de al menos 3 caracteres' } } as ApiResponse);
        return;
      }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ success: false, error: { message: 'email válido requerido' } } as ApiResponse);
        return;
      }
      if (!password || password.length < 6) {
        res.status(400).json({ success: false, error: { message: 'contraseña de al menos 6 caracteres' } } as ApiResponse);
        return;
      }

      const client = await postgresPool.connect();
      try {
        const c = await client.query('SELECT id FROM clinicas WHERE id = $1', [clinicaId]);
        if (c.rows.length === 0) {
          res.status(404).json({ success: false, error: { message: 'Clínica no encontrada' } } as ApiResponse);
          return;
        }
        const passwordHash = await bcrypt.hash(password, 10);
        const ins = await client.query(
          `INSERT INTO usuarios (
            username, email, password_hash, rol, medico_id, clinica_id,
            activo, verificado, first_login, password_changed_at,
            fecha_creacion, fecha_actualizacion
          ) VALUES ($1, $2, $3, 'administrador_clinica', NULL, $4, true, true, true, NULL, NOW(), NOW())
          RETURNING id, username, email, rol, clinica_id, activo, verificado, first_login, fecha_creacion`,
          [username, email, passwordHash, clinicaId]
        );
        res.status(201).json({ success: true, data: ins.rows[0] } as ApiResponse);
      } catch (dbErr: unknown) {
        const err = dbErr as { code?: string; constraint?: string };
        if (err.code === '23505') {
          res.status(400).json({ success: false, error: { message: 'Ya existe un usuario con ese username o email' } } as ApiResponse);
          return;
        }
        throw dbErr;
      } finally {
        client.release();
      }
    } catch (e) {
      res.status(500).json({ success: false, error: { message: (e as Error).message } } as ApiResponse);
    }
  }

  async patchUsuarioClinica(
    req: Request<{ clinicaId: string; userId: string }, ApiResponse, { activo?: boolean }>,
    res: Response<ApiResponse>
  ): Promise<void> {
    try {
      const clinicaId = parseInt(req.params.clinicaId, 10);
      const userId = parseInt(req.params.userId, 10);
      if (isNaN(clinicaId) || clinicaId <= 0 || isNaN(userId) || userId <= 0) {
        res.status(400).json({ success: false, error: { message: 'IDs inválidos' } } as ApiResponse);
        return;
      }
      const { activo } = req.body;
      if (typeof activo !== 'boolean') {
        res.status(400).json({ success: false, error: { message: 'activo (boolean) es requerido' } } as ApiResponse);
        return;
      }
      const client = await postgresPool.connect();
      try {
        const result = await client.query(
          `UPDATE usuarios SET activo = $1, fecha_actualizacion = NOW()
           WHERE id = $2 AND clinica_id = $3
           RETURNING id, username, email, rol, activo`,
          [activo, userId, clinicaId]
        );
        if (result.rows.length === 0) {
          res.status(404).json({ success: false, error: { message: 'Usuario no encontrado en esta clínica' } } as ApiResponse);
          return;
        }
        res.json({ success: true, data: result.rows[0] } as ApiResponse);
      } finally {
        client.release();
      }
    } catch (e) {
      res.status(500).json({ success: false, error: { message: (e as Error).message } } as ApiResponse);
    }
  }

  async putUsuarioPassword(
    req: Request<{ clinicaId: string; userId: string }, ApiResponse, { newPassword?: string }>,
    res: Response<ApiResponse>
  ): Promise<void> {
    try {
      const clinicaId = parseInt(req.params.clinicaId, 10);
      const userId = parseInt(req.params.userId, 10);
      if (isNaN(clinicaId) || clinicaId <= 0 || isNaN(userId) || userId <= 0) {
        res.status(400).json({ success: false, error: { message: 'IDs inválidos' } } as ApiResponse);
        return;
      }
      const newPassword = req.body.newPassword != null ? String(req.body.newPassword) : '';
      if (!newPassword || newPassword.length < 6) {
        res.status(400).json({ success: false, error: { message: 'newPassword de al menos 6 caracteres' } } as ApiResponse);
        return;
      }
      const passwordHash = await bcrypt.hash(newPassword, 10);
      const client = await postgresPool.connect();
      try {
        const result = await client.query(
          `UPDATE usuarios SET
             password_hash = $1,
             fecha_actualizacion = NOW(),
             first_login = false,
             password_changed_at = NOW()
           WHERE id = $2 AND clinica_id = $3
           RETURNING id, username, email`,
          [passwordHash, userId, clinicaId]
        );
        if (result.rows.length === 0) {
          res.status(404).json({ success: false, error: { message: 'Usuario no encontrado en esta clínica' } } as ApiResponse);
          return;
        }
        res.json({ success: true, data: result.rows[0] } as ApiResponse);
      } finally {
        client.release();
      }
    } catch (e) {
      res.status(500).json({ success: false, error: { message: (e as Error).message } } as ApiResponse);
    }
  }

  /** Alta en catálogo `planes_comparativos`. */
  async createPlanComparativo(
    req: Request<
      Record<string, string>,
      ApiResponse,
      {
        plan?: string;
        costo_base?: string | null;
        medicos_incluidos?: string | null;
        pacientes_incluidos?: string | null;
        almacenamiento?: string | null;
        orden?: number;
      }
    >,
    res: Response<ApiResponse>
  ): Promise<void> {
    try {
      const plan = req.body.plan?.trim();
      if (!plan || plan.length < 2) {
        res.status(400).json({ success: false, error: { message: 'Nombre de plan obligatorio (mín. 2 caracteres)' } } as ApiResponse);
        return;
      }
      const costo_base = req.body.costo_base != null ? String(req.body.costo_base).trim() || null : null;
      const medicos_incluidos =
        req.body.medicos_incluidos != null ? String(req.body.medicos_incluidos).trim() || null : null;
      const pacientes_incluidos =
        req.body.pacientes_incluidos != null ? String(req.body.pacientes_incluidos).trim() || null : null;
      const almacenamiento =
        req.body.almacenamiento != null ? String(req.body.almacenamiento).trim() || null : null;
      let orden = req.body.orden;
      if (orden !== undefined && orden !== null && typeof orden !== 'number') {
        orden = Number(orden);
      }
      const client = await postgresPool.connect();
      try {
        let ordenVal: number;
        if (orden != null && !isNaN(Number(orden)) && Number(orden) >= 0) {
          ordenVal = Math.floor(Number(orden));
        } else {
          const mx = await client.query(`SELECT COALESCE(MAX(orden), 0)::int + 1 AS n FROM planes_comparativos`);
          ordenVal = (mx.rows[0] as { n: number }).n;
        }
        const ins = await client.query(
          `INSERT INTO planes_comparativos (plan, costo_base, medicos_incluidos, pacientes_incluidos, almacenamiento, orden)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, plan, costo_base, medicos_incluidos, pacientes_incluidos, almacenamiento, orden`,
          [plan, costo_base, medicos_incluidos, pacientes_incluidos, almacenamiento, ordenVal]
        );
        res.status(201).json({ success: true, data: ins.rows[0] } as ApiResponse);
      } catch (dbErr: unknown) {
        const err = dbErr as { code?: string };
        if (err.code === '23505') {
          res.status(400).json({ success: false, error: { message: 'Ya existe un plan con ese nombre u orden' } } as ApiResponse);
          return;
        }
        throw dbErr;
      } finally {
        client.release();
      }
    } catch (e) {
      res.status(500).json({ success: false, error: { message: (e as Error).message } } as ApiResponse);
    }
  }

  /** Actualiza fila en `planes_comparativos`. */
  async updatePlanComparativo(
    req: Request<
      { planId: string },
      ApiResponse,
      {
        plan?: string;
        costo_base?: string | null;
        medicos_incluidos?: string | null;
        pacientes_incluidos?: string | null;
        almacenamiento?: string | null;
        orden?: number | null;
      }
    >,
    res: Response<ApiResponse>
  ): Promise<void> {
    try {
      const id = parseInt(req.params.planId, 10);
      if (isNaN(id) || id <= 0) {
        res.status(400).json({ success: false, error: { message: 'ID de plan inválido' } } as ApiResponse);
        return;
      }
      const { plan, costo_base, medicos_incluidos, pacientes_incluidos, almacenamiento, orden } = req.body;
      const sets: string[] = [];
      const vals: unknown[] = [];
      let i = 1;
      if (plan !== undefined) {
        const p = String(plan).trim();
        if (p.length < 2) {
          res.status(400).json({ success: false, error: { message: 'Nombre de plan inválido' } } as ApiResponse);
          return;
        }
        sets.push(`plan = $${i++}`);
        vals.push(p);
      }
      if (costo_base !== undefined) {
        sets.push(`costo_base = $${i++}`);
        vals.push(costo_base === null || costo_base === '' ? null : String(costo_base).trim());
      }
      if (medicos_incluidos !== undefined) {
        sets.push(`medicos_incluidos = $${i++}`);
        vals.push(medicos_incluidos === null || medicos_incluidos === '' ? null : String(medicos_incluidos).trim());
      }
      if (pacientes_incluidos !== undefined) {
        sets.push(`pacientes_incluidos = $${i++}`);
        vals.push(
          pacientes_incluidos === null || pacientes_incluidos === '' ? null : String(pacientes_incluidos).trim()
        );
      }
      if (almacenamiento !== undefined) {
        sets.push(`almacenamiento = $${i++}`);
        vals.push(almacenamiento === null || almacenamiento === '' ? null : String(almacenamiento).trim());
      }
      if (orden !== undefined) {
        sets.push(`orden = $${i++}`);
        vals.push(orden === null ? null : Math.floor(Number(orden)));
      }
      if (sets.length === 0) {
        res.status(400).json({ success: false, error: { message: 'Nada que actualizar' } } as ApiResponse);
        return;
      }
      vals.push(id);
      const client = await postgresPool.connect();
      try {
        const result = await client.query(
          `UPDATE planes_comparativos SET ${sets.join(', ')} WHERE id = $${i}
           RETURNING id, plan, costo_base, medicos_incluidos, pacientes_incluidos, almacenamiento, orden`,
          vals
        );
        if (result.rows.length === 0) {
          res.status(404).json({ success: false, error: { message: 'Plan no encontrado' } } as ApiResponse);
          return;
        }
        res.json({ success: true, data: result.rows[0] } as ApiResponse);
      } catch (dbErr: unknown) {
        const err = dbErr as { code?: string };
        if (err.code === '23505') {
          res.status(400).json({ success: false, error: { message: 'Conflicto de unicidad en plan u orden' } } as ApiResponse);
          return;
        }
        throw dbErr;
      } finally {
        client.release();
      }
    } catch (e) {
      res.status(500).json({ success: false, error: { message: (e as Error).message } } as ApiResponse);
    }
  }

  /** Elimina plan del catálogo (clínicas con ese `plan_id` quedan en NULL si FK ON DELETE SET NULL). */
  async deletePlanComparativo(req: Request<{ planId: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      const id = parseInt(req.params.planId, 10);
      if (isNaN(id) || id <= 0) {
        res.status(400).json({ success: false, error: { message: 'ID de plan inválido' } } as ApiResponse);
        return;
      }
      const client = await postgresPool.connect();
      try {
        const use = await client.query(`SELECT COUNT(*)::int AS n FROM clinicas WHERE plan_id = $1`, [id]);
        const n = (use.rows[0] as { n: number }).n;
        const del = await client.query(`DELETE FROM planes_comparativos WHERE id = $1 RETURNING id`, [id]);
        if (del.rows.length === 0) {
          res.status(404).json({ success: false, error: { message: 'Plan no encontrado' } } as ApiResponse);
          return;
        }
        res.json({
          success: true,
          data: { id, clinicas_que_tenian_este_plan: n }
        } as ApiResponse);
      } catch (dbErr: unknown) {
        const err = dbErr as { code?: string };
        if (err.code === '23503') {
          res.status(409).json({
            success: false,
            error: { message: 'No se puede eliminar: hay referencias a este plan' }
          } as ApiResponse);
          return;
        }
        throw dbErr;
      } finally {
        client.release();
      }
    } catch (e) {
      res.status(500).json({ success: false, error: { message: (e as Error).message } } as ApiResponse);
    }
  }
}
