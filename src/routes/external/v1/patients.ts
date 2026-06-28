import express, { Request, Response } from 'express';
import { postgresPool } from '../../../config/database.js';
import { ApiResponse } from '../../../types/index.js';
import { requireExternalApiKey } from '../../../middleware/external-api-key.js';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

const router = express.Router();

// Por decisión: usar la misma key que app de pacientes (server-to-server desde MediAsistencia)
router.use(requireExternalApiKey('EXTERNAL_PATIENT_APP_API_KEYS'));

function normalizeCedula(raw: unknown): string {
  const s = String(raw ?? '').trim().toUpperCase();
  // Mantener solo letras y números (quita espacios, puntos, guiones).
  return s.replace(/[^A-Z0-9]/g, '');
}

function normalizeText(raw: unknown): string {
  return String(raw ?? '').trim();
}

function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
}

function normalizePhone(raw: string): string | null {
  const s0 = String(raw ?? '').trim();
  const s = s0.startsWith('00') ? `+${s0.slice(2)}` : s0;
  const phone = s.startsWith('+')
    ? parsePhoneNumberFromString(s)
    : parsePhoneNumberFromString(s, 'VE');
  if (!phone || !phone.isValid()) return null;
  return phone.number; // E.164
}

function normalizeEdad(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const edad = Math.trunc(n);
  if (edad <= 0 || edad >= 150) return null;
  return edad;
}

function normalizeSexo(raw: unknown): 'Masculino' | 'Femenino' | 'Otro' | null {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'masculino' || s === 'm') return 'Masculino';
  if (s === 'femenino' || s === 'f') return 'Femenino';
  if (s === 'otro' || s === 'o') return 'Otro';
  return null;
}

// POST /api/v1/external/v1/patients/pre-register
router.post('/pre-register', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const cedula = normalizeCedula((req.body as any)?.cedula);
    const nombres = normalizeText((req.body as any)?.nombres);
    const apellidos = normalizeText((req.body as any)?.apellidos);
    const edad = normalizeEdad((req.body as any)?.edad);
    const sexo = normalizeSexo((req.body as any)?.sexo);
    const email = normalizeText((req.body as any)?.email);
    const telefono = normalizeText((req.body as any)?.telefono);

    if (!/^[VP][0-9]{7,10}$/.test(cedula)) {
      res.status(400).json({
        success: false,
        error: { message: 'Cédula inválida. Formato esperado: V o P + 7-10 dígitos (ej: V25418500). Se permiten guiones/puntos.' }
      });
      return;
    }
    if (!nombres || !apellidos) {
      res.status(400).json({ success: false, error: { message: 'nombres y apellidos son requeridos' } });
      return;
    }
    if (!edad) {
      res.status(400).json({ success: false, error: { message: 'edad inválida. Debe ser un número entre 1 y 149.' } });
      return;
    }
    if (!sexo) {
      res.status(400).json({ success: false, error: { message: "sexo inválido. Valores permitidos: 'Masculino', 'Femenino', 'Otro'." } });
      return;
    }
    if (!email || !isValidEmail(email)) {
      res.status(400).json({ success: false, error: { message: 'email inválido' } });
      return;
    }
    const telefonoE164 = normalizePhone(telefono);
    if (!telefonoE164) {
      res.status(400).json({ success: false, error: { message: 'telefono inválido. Usa un número real (ej: +58..., +57..., +1...)' } });
      return;
    }

    const clinicaAlias = (process.env['CLINICA_ALIAS'] || '').trim() || null;

    const client = await postgresPool.connect();
    try {
      const existing = await client.query(
        `SELECT id, nombres, apellidos, cedula, email, telefono, activo, clinica_alias
         FROM pacientes
         WHERE regexp_replace(upper(coalesce(cedula, '')), '[^A-Z0-9]', '', 'g') = $1
           AND ($2::varchar IS NULL OR clinica_alias = $2)
         ORDER BY id ASC
         LIMIT 1`,
        [cedula, clinicaAlias]
      );

      if (existing.rows.length > 0) {
        const id = existing.rows[0].id;
        const updated = await client.query(
          `UPDATE pacientes
           SET nombres = $1,
               apellidos = $2,
               edad = $3,
               sexo = $4,
               email = $5,
               telefono = $6,
               clinica_alias = COALESCE(clinica_alias, $7),
               fecha_actualizacion = CURRENT_TIMESTAMP
           WHERE id = $8
           RETURNING id, nombres, apellidos, cedula, edad, sexo, email, telefono, activo, clinica_alias`,
          [nombres, apellidos, edad, sexo, email, telefonoE164, clinicaAlias, id]
        );

        res.json({ success: true, data: { created: false, patient: updated.rows[0] } });
        return;
      }

      const created = await client.query(
        `INSERT INTO pacientes
           (nombres, apellidos, edad, sexo, email, telefono, cedula, activo, clinica_alias, fecha_creacion, fecha_actualizacion)
         VALUES
           ($1, $2, $3, $4, $5, $6, $7, true, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING id, nombres, apellidos, cedula, edad, sexo, email, telefono, activo, clinica_alias`,
        [nombres, apellidos, edad, sexo, email, telefonoE164, cedula, clinicaAlias]
      );

      res.status(201).json({ success: true, data: { created: true, patient: created.rows[0] } });
    } catch (dbErr: any) {
      if (dbErr?.code === '23505') {
        res.status(409).json({ success: false, error: { message: 'El email ya está registrado en esta clínica' } });
        return;
      }
      throw dbErr;
    } finally {
      client.release();
    }
  } catch (error) {
    res.status(500).json({ success: false, error: { message: (error as Error).message } });
  }
});

// POST /api/v1/external/v1/patients/lookup
router.post('/lookup', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const cedula = normalizeCedula((req.body as any)?.cedula);
    const cedulaDigits = cedula.replace(/^[VP]/, '');

    if (!/^[VP][0-9]{7,10}$/.test(cedula)) {
      res.status(400).json({
        success: false,
        error: { message: 'Cédula inválida. Formato esperado: V o P + 7-10 dígitos (ej: V1089230, V25418500). Se permiten guiones/puntos.' }
      });
      return;
    }

    const client = await postgresPool.connect();
    try {
      const result = await client.query(
        `SELECT
           id,
           nombres,
           apellidos,
           cedula,
           email,
           telefono,
           activo,
           clinica_alias
         FROM pacientes
         WHERE regexp_replace(upper(coalesce(cedula, '')), '[^A-Z0-9]', '', 'g') = $1
            OR regexp_replace(upper(coalesce(cedula, '')), '[^A-Z0-9]', '', 'g') = $2
         ORDER BY id ASC`,
        [cedula, cedulaDigits]
      );

      if (result.rows.length === 0) {
        res.json({
          success: true,
          data: { exists: false, cedula }
        });
        return;
      }

      res.json({
        success: true,
        data: {
          exists: true,
          cedula,
          patients: result.rows
        }
      });
    } finally {
      client.release();
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: (error as Error).message }
    });
  }
});

export default router;


