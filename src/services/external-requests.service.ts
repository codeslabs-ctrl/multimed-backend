import { postgresPool } from '../config/database.js';
import { PDFService } from './pdf.service';

export type AppointmentRequestInput = {
  paciente_id: number;
  medico_id: number;
  motivo_consulta: string;
  tipo_consulta?: string;
  prioridad?: string;
  observaciones?: string;
};

export type ReportRequestInput = {
  paciente_id: number;
  medico_id?: number;
  tipo_informe: string;
  motivo: string;
};

const FAR_FUTURE_DAYS = 3650; // ~10 años, evita contaminar "consultas del día"
const PLACEHOLDER_HOUR = '00:00:00';

function getClinicaAlias(): string | null {
  return (process.env['CLINICA_ALIAS'] || '').trim() || null;
}

function getClinicaNombre(): string | null {
  return (process.env['CLINICA_NOMBRE'] || '').trim() || null;
}

let ensurePromise: Promise<void> | null = null;

async function ensureExternalTables(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const client = await postgresPool.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS public.solicitudes_informes_medicos (
            id SERIAL PRIMARY KEY,
            paciente_id INT4 NOT NULL,
            medico_id INT4,
            clinica_alias VARCHAR(50),
            tipo_informe VARCHAR(100) NOT NULL,
            motivo TEXT NOT NULL,
            estado VARCHAR(50) NOT NULL DEFAULT 'pendiente',
            informe_id INT4,
            fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
        `);

        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_solicitudes_informes_paciente
          ON public.solicitudes_informes_medicos (paciente_id);
        `);

        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_solicitudes_informes_estado
          ON public.solicitudes_informes_medicos (estado);
        `);

        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_solicitudes_informes_clinica
          ON public.solicitudes_informes_medicos (clinica_alias);
        `);
      } finally {
        client.release();
      }
    })();
  }
  await ensurePromise;
}

export class ExternalRequestsService {
  static async createAppointmentRequest(input: AppointmentRequestInput) {
    const clinicaAlias = getClinicaAlias();
    const clinicaNombre = getClinicaNombre();

    const client = await postgresPool.connect();
    try {
      const result = await client.query(
        `
        INSERT INTO consultas_pacientes
          (paciente_id, medico_id, motivo_consulta, tipo_consulta, fecha_pautada, hora_pautada,
           estado_consulta, duracion_estimada, prioridad, observaciones, recordatorio_enviado, clinica_alias,
           fecha_creacion, fecha_actualizacion)
        VALUES
          ($1, $2, $3, $4,
           (CURRENT_DATE + ($5::int * INTERVAL '1 day'))::date,
           $6::time,
           'por_agendar', 30, $7, $8, false, $9,
           CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *
        `,
        [
          input.paciente_id,
          input.medico_id,
          input.motivo_consulta,
          input.tipo_consulta || 'primera_vez',
          FAR_FUTURE_DAYS,
          PLACEHOLDER_HOUR,
          input.prioridad || 'normal',
          input.observaciones || null,
          clinicaAlias
        ]
      );

      const row = result.rows[0];
      return {
        ...row,
        fecha_pautada: null,
        hora_pautada: null,
        clinica_nombre: clinicaNombre
      };
    } finally {
      client.release();
    }
  }

  static async listAppointmentsByPaciente(pacienteId: number) {
    const clinicaAlias = getClinicaAlias();
    const clinicaNombre = getClinicaNombre();

    const client = await postgresPool.connect();
    try {
      const result = await client.query(
        `
        SELECT
          c.id,
          c.paciente_id,
          c.medico_id,
          c.motivo_consulta,
          c.tipo_consulta,
          c.estado_consulta,
          c.fecha_pautada,
          c.hora_pautada,
          c.fecha_culminacion,
          COALESCE(c.clinica_alias, $2) as clinica_alias,
          json_build_object(
            'id', m.id,
            'nombres', m.nombres,
            'apellidos', m.apellidos,
            'especialidad_id', m.especialidad_id
          ) as medico,
          json_build_object(
            'id', e.id,
            'nombre', e.nombre_especialidad
          ) as especialidad
        FROM consultas_pacientes c
        LEFT JOIN medicos m ON c.medico_id = m.id
        LEFT JOIN especialidades e ON m.especialidad_id = e.id
        WHERE c.paciente_id = $1
        ORDER BY
          CASE
            WHEN c.estado_consulta = 'por_agendar' THEN 0
            WHEN c.estado_consulta IN ('agendada','reagendada','en_progreso','completada') THEN 1
            WHEN c.estado_consulta = 'finalizada' THEN 2
            ELSE 3
          END ASC,
          c.fecha_creacion DESC
        `,
        [pacienteId, clinicaAlias]
      );

      return result.rows.map((r: any) => ({
        ...r,
        clinica_nombre: clinicaNombre,
        ...(r.estado_consulta === 'por_agendar' ? { fecha_pautada: null, hora_pautada: null } : null)
      }));
    } finally {
      client.release();
    }
  }

  static async createReportRequest(input: ReportRequestInput) {
    await ensureExternalTables();
    const clinicaAlias = getClinicaAlias();
    const clinicaNombre = getClinicaNombre();

    const client = await postgresPool.connect();
    try {
      const result = await client.query(
        `
        INSERT INTO public.solicitudes_informes_medicos
          (paciente_id, medico_id, clinica_alias, tipo_informe, motivo, estado, fecha_creacion, fecha_actualizacion)
        VALUES
          ($1, $2, $3, $4, $5, 'pendiente', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *
        `,
        [input.paciente_id, input.medico_id || null, clinicaAlias, input.tipo_informe, input.motivo]
      );

      return {
        ...result.rows[0],
        clinica_nombre: clinicaNombre
      };
    } finally {
      client.release();
    }
  }

  static async listReportsByPaciente(pacienteId: number) {
    await ensureExternalTables();
    const clinicaAlias = getClinicaAlias();
    const clinicaNombre = getClinicaNombre();

    const client = await postgresPool.connect();
    try {
      const requests = await client.query(
        `
        SELECT
          'request'::text as kind,
          s.id,
          s.paciente_id,
          s.medico_id,
          s.tipo_informe,
          s.motivo,
          s.estado,
          s.informe_id,
          s.clinica_alias,
          s.fecha_creacion,
          s.fecha_actualizacion
        FROM public.solicitudes_informes_medicos s
        WHERE s.paciente_id = $1
        ORDER BY s.fecha_creacion DESC
        `,
        [pacienteId]
      );

      const informes = await client.query(
        `
        SELECT
          'report'::text as kind,
          im.id,
          im.paciente_id,
          im.medico_id,
          im.tipo_informe,
          im.titulo,
          im.numero_informe,
          im.estado,
          im.fecha_emision as fecha_creacion,
          im.fecha_actualizacion,
          im.clinica_alias
        FROM informes_medicos im
        WHERE im.paciente_id = $1
          AND im.estado IN ('finalizado','firmado','enviado')
        ORDER BY im.fecha_emision DESC
        `,
        [pacienteId]
      );

      const items = [...requests.rows, ...informes.rows].map((r: any) => ({
        ...r,
        clinica_alias: r.clinica_alias || clinicaAlias,
        clinica_nombre: clinicaNombre
      }));

      items.sort((a: any, b: any) => new Date(b.fecha_creacion).getTime() - new Date(a.fecha_creacion).getTime());
      return items;
    } finally {
      client.release();
    }
  }

  static async generateReportPdfForPaciente(pacienteId: number, informeId: number): Promise<{ pdf: Buffer; numero_informe: string | number | null }> {
    const client = await postgresPool.connect();
    try {
      const result = await client.query(
        `SELECT id, paciente_id, numero_informe
         FROM informes_medicos
         WHERE id = $1
           AND paciente_id = $2
           AND estado IN ('finalizado','firmado','enviado')
         LIMIT 1`,
        [informeId, pacienteId]
      );

      if (result.rows.length === 0) {
        throw new Error('Informe no encontrado para el paciente');
      }

      const pdfService = new PDFService();
      const pdf = await pdfService.generarPDFInforme(informeId);
      return { pdf, numero_informe: result.rows[0].numero_informe ?? null };
    } finally {
      client.release();
    }
  }
}


