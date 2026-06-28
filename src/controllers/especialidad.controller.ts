import { Request, Response } from 'express';
import { postgresPool } from '../config/database.js';
import { ApiResponse } from '../types/index.js';
import { resolveEfectivaClinicaAlias } from '../utils/clinica-alias-request.js';

/**
 * Especialidades (MultiMed / DemoMed):
 *
 * - `especialidades`: catálogo maestro (nombre único global). Los médicos usan `medicos.especialidad_id`.
 * - `especialidades_clinicas`: qué filas del catálogo están **asignadas** a cada clínica (`clinica_alias` + `especialidad_id`).
 *   El nombre es único en `especialidades`; si ya existe (otra clínica), solo se inserta el vínculo en `especialidades_clinicas`.
 *
 * Listados (`getAll` / `search`) filtran por `especialidades_clinicas` usando el alias efectivo (JWT primero).
 */
export class EspecialidadController {

  async getAllEspecialidades(req: Request, res: Response<ApiResponse>): Promise<void> {
    try {
      const clinicaAlias = (await resolveEfectivaClinicaAlias(req)) || '';
      const client = await postgresPool.connect();
      try {
        let result;
        if (clinicaAlias) {
          result = await client.query(
            `SELECT e.*
             FROM especialidades e
             INNER JOIN especialidades_clinicas ec ON ec.especialidad_id = e.id
             WHERE ec.clinica_alias = $1 AND ec.activa = true
             ORDER BY e.nombre_especialidad ASC`,
            [clinicaAlias]
          );
        } else {
          result = await client.query(
            'SELECT * FROM especialidades ORDER BY nombre_especialidad ASC'
          );
        }

        const response: ApiResponse = {
          success: true,
          data: result.rows
        };
        res.json(response);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('❌ Error in getAllEspecialidades:', error);
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(500).json(response);
    }
  }

  async getEspecialidadById(req: Request<{ id: string }, ApiResponse>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { id } = req.params;
      const especialidadId = parseInt(id);

      if (isNaN(especialidadId) || especialidadId <= 0) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Invalid especialidad ID' }
        };
        res.status(400).json(response);
        return;
      }

      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
        const result = await client.query(
          'SELECT * FROM especialidades WHERE id = $1',
          [especialidadId]
        );

        if (result.rows.length === 0) {
          const response: ApiResponse = {
            success: false,
            error: { message: 'Especialidad not found' }
          };
          res.status(404).json(response);
          return;
        }

        const response: ApiResponse = {
          success: true,
          data: result.rows[0]
        };
        res.json(response);
      } finally {
        client.release();
      }
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(500).json(response);
    }
  }

  async createEspecialidad(req: Request<{}, ApiResponse, { nombre_especialidad: string; descripcion: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { nombre_especialidad, descripcion } = req.body;

      if (!nombre_especialidad || !descripcion) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Nombre_especialidad and descripcion are required' }
        };
        res.status(400).json(response);
        return;
      }

      const clinicaAlias = (await resolveEfectivaClinicaAlias(req)) || process.env['CLINICA_ALIAS'] || 'multimed';

      const nombreTrim = String(nombre_especialidad).trim();
      const descripcionTrim = String(descripcion).trim();

      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
        // Iniciar transacción
        await client.query('BEGIN');

        // Catálogo global: nombre único. Si ya existe, reutilizar el id y solo vincular la clínica.
        const existente = await client.query(
          `SELECT id, nombre_especialidad, descripcion, activa
           FROM especialidades
           WHERE lower(trim(nombre_especialidad)) = lower($1)`,
          [nombreTrim]
        );

        let filaEspecialidad: Record<string, unknown>;
        if (existente.rows.length > 0) {
          filaEspecialidad = existente.rows[0] as Record<string, unknown>;
        } else {
          const result = await client.query(
            `INSERT INTO especialidades (nombre_especialidad, descripcion)
             VALUES ($1, $2)
             RETURNING *`,
            [nombreTrim, descripcionTrim]
          );
          filaEspecialidad = result.rows[0] as Record<string, unknown>;
        }

        const especialidadId = filaEspecialidad['id'] as number;

        await client.query(
          `INSERT INTO especialidades_clinicas (especialidad_id, clinica_alias)
           VALUES ($1, $2)
           ON CONFLICT (especialidad_id, clinica_alias)
           DO UPDATE SET activa = true`,
          [especialidadId, clinicaAlias]
        );

        // Confirmar transacción
        await client.query('COMMIT');

        const response: ApiResponse = {
          success: true,
          data: filaEspecialidad
        };
        res.status(201).json(response);
      } catch (dbError: any) {
        // Revertir transacción en caso de error
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          console.error('❌ Error al hacer rollback:', rollbackError);
        }
        console.error('❌ PostgreSQL error creating especialidad:', dbError);
        // Verificar si es un error de duplicado
        if (dbError.code === '23505') { // Unique violation
          const response: ApiResponse = {
            success: false,
            error: { message: 'Ya existe una especialidad con ese nombre' }
          };
          res.status(400).json(response);
          return;
        }
        // Error genérico para el usuario
        const response: ApiResponse = {
          success: false,
          error: { message: 'No se pudo crear la especialidad. Por favor, verifique los datos e intente nuevamente.' }
        };
        res.status(400).json(response);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('❌ Error creating especialidad:', error);
      const response: ApiResponse = {
        success: false,
        error: { message: 'No se pudo crear la especialidad. Por favor, verifique los datos e intente nuevamente.' }
      };
      res.status(400).json(response);
    }
  }

  async updateEspecialidad(req: Request<{ id: string }, ApiResponse, { nombre_especialidad?: string; descripcion?: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { id } = req.params;
      const { nombre_especialidad, descripcion } = req.body;
      const especialidadId = parseInt(id);

      if (isNaN(especialidadId) || especialidadId <= 0) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Invalid especialidad ID' }
        };
        res.status(400).json(response);
        return;
      }

      const updateData: { nombre_especialidad?: string; descripcion?: string } = {};
      if (nombre_especialidad !== undefined) updateData.nombre_especialidad = nombre_especialidad;
      if (descripcion !== undefined) updateData.descripcion = descripcion;

      if (Object.keys(updateData).length === 0) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'No fields to update' }
        };
        res.status(400).json(response);
        return;
      }

      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
        // Construir query dinámico
        const setClauses: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (nombre_especialidad !== undefined) {
          setClauses.push(`nombre_especialidad = $${paramIndex}`);
          values.push(nombre_especialidad);
          paramIndex++;
        }

        if (descripcion !== undefined) {
          setClauses.push(`descripcion = $${paramIndex}`);
          values.push(descripcion);
          paramIndex++;
        }

        // Agregar el ID al final para el WHERE
        values.push(especialidadId);
        const whereParamIndex = paramIndex;
        const sqlQuery = `
          UPDATE especialidades
          SET ${setClauses.join(', ')}, fecha_actualizacion = CURRENT_TIMESTAMP
          WHERE id = $${whereParamIndex}
          RETURNING *
        `;

        const result = await client.query(sqlQuery, values);

        if (result.rows.length === 0) {
          const response: ApiResponse = {
            success: false,
            error: { message: 'Especialidad not found' }
          };
          res.status(404).json(response);
          return;
        }

        const response: ApiResponse = {
          success: true,
          data: result.rows[0]
        };
        res.json(response);
      } catch (dbError: any) {
        console.error('❌ PostgreSQL error updating especialidad:', dbError);
        if (dbError.code === '23505') { // Unique violation
          const response: ApiResponse = {
            success: false,
            error: { message: 'Ya existe una especialidad con ese nombre' }
          };
          res.status(400).json(response);
          return;
        }
        // Error genérico para el usuario
        const response: ApiResponse = {
          success: false,
          error: { message: 'No se pudo actualizar la especialidad. Por favor, verifique los datos e intente nuevamente.' }
        };
        res.status(400).json(response);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('❌ Error updating especialidad:', error);
      const response: ApiResponse = {
        success: false,
        error: { message: 'No se pudo actualizar la especialidad. Por favor, verifique los datos e intente nuevamente.' }
      };
      res.status(400).json(response);
    }
  }

  async deleteEspecialidad(req: Request<{ id: string }, ApiResponse>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { id } = req.params;
      const especialidadId = parseInt(id);

      if (isNaN(especialidadId) || especialidadId <= 0) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Invalid especialidad ID' }
        };
        res.status(400).json(response);
        return;
      }

      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
        await client.query('BEGIN'); // Iniciar transacción

        // Verificar que la especialidad existe
        const especialidadCheck = await client.query(
          'SELECT id, nombre_especialidad, activa FROM especialidades WHERE id = $1',
          [especialidadId]
        );

        if (especialidadCheck.rows.length === 0) {
          await client.query('ROLLBACK');
          const response: ApiResponse = {
            success: false,
            error: { message: 'Especialidad no encontrada' }
          };
          res.status(404).json(response);
          return;
        }

        const especialidad = especialidadCheck.rows[0];

        // Verificar si la especialidad ya está inactiva
        if (!especialidad.activa) {
          await client.query('ROLLBACK');
          const response: ApiResponse = {
            success: false,
            error: { message: 'La especialidad ya está inactiva' }
          };
          res.status(400).json(response);
          return;
        }

        // Verificar si la especialidad está siendo usada por médicos ACTIVOS
        const checkMedicosActivos = await client.query(
          'SELECT COUNT(*) as count FROM medicos WHERE especialidad_id = $1 AND activo = true',
          [especialidadId]
        );

        const tieneMedicosActivos = parseInt(checkMedicosActivos.rows[0].count) > 0;

        // Verificar si hay consultas FINALIZADAS con médicos de esta especialidad
        const checkConsultas = await client.query(
          `SELECT COUNT(*) as count 
           FROM consultas_pacientes cp
           INNER JOIN medicos m ON cp.medico_id = m.id
           WHERE m.especialidad_id = $1 
           AND (cp.estado_consulta = 'finalizada' OR cp.estado_consulta = 'completada' OR cp.fecha_culminacion IS NOT NULL)`,
          [especialidadId]
        );

        const tieneConsultasFinalizadas = parseInt(checkConsultas.rows[0].count) > 0;

        if (tieneMedicosActivos || tieneConsultasFinalizadas) {
          // Marcar como inactiva en lugar de eliminar
          await client.query(
            'UPDATE especialidades SET activa = false, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = $1',
            [especialidadId]
          );

          await client.query('COMMIT'); // Confirmar transacción

          let razon = '';
          if (tieneMedicosActivos && tieneConsultasFinalizadas) {
            razon = 'está asociada a médicos activos y tiene consultas finalizadas';
          } else if (tieneMedicosActivos) {
            razon = 'está asociada a uno o más médicos activos';
          } else {
            razon = 'tiene consultas finalizadas asociadas a médicos de esta especialidad';
          }

          const response: ApiResponse = {
            success: true,
            data: { 
              message: `Especialidad "${especialidad.nombre_especialidad}" marcada como inactiva (${razon})`,
              accion: 'desactivada'
            }
          };
          res.json(response);
          return;
        }

        // Si llegamos aquí, se puede eliminar físicamente
        // Eliminar de especialidades_clinicas primero
        const clinicaAlias = (await resolveEfectivaClinicaAlias(req)) || process.env['CLINICA_ALIAS'] || 'multimed';
        await client.query(
          'DELETE FROM especialidades_clinicas WHERE especialidad_id = $1 AND clinica_alias = $2',
          [especialidadId, clinicaAlias]
        );

        // Eliminar de especialidades
        const result = await client.query(
          'DELETE FROM especialidades WHERE id = $1 RETURNING id',
          [especialidadId]
        );

        if (result.rows.length === 0) {
          await client.query('ROLLBACK');
          const response: ApiResponse = {
            success: false,
            error: { message: 'Especialidad no encontrada' }
          };
          res.status(404).json(response);
          return;
        }

        await client.query('COMMIT'); // Confirmar transacción

        const response: ApiResponse = {
          success: true,
          data: { 
            message: `Especialidad "${especialidad.nombre_especialidad}" eliminada completamente del sistema`,
            accion: 'eliminada'
          }
        };
        res.json(response);
      } catch (dbError: any) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          console.error('❌ Error al hacer rollback:', rollbackError);
        }
        console.error('❌ PostgreSQL error deleting especialidad:', dbError);
        // Verificar si es un error de foreign key constraint
        if (dbError.code === '23503') { // Foreign key violation
          const response: ApiResponse = {
            success: false,
            error: { message: 'No se puede eliminar la especialidad porque está siendo usada en el sistema' }
          };
          res.status(400).json(response);
          return;
        }
        // Error genérico para el usuario
        const response: ApiResponse = {
          success: false,
          error: { message: 'No se pudo eliminar la especialidad. Por favor, intente nuevamente.' }
        };
        res.status(400).json(response);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('❌ Error deleting especialidad:', error);
      const response: ApiResponse = {
        success: false,
        error: { message: 'No se pudo eliminar la especialidad. Por favor, intente nuevamente.' }
      };
      res.status(400).json(response);
    }
  }

  async searchEspecialidades(req: Request<{}, ApiResponse, {}, { q?: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { q } = req.query;

      if (!q || typeof q !== 'string') {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Search query is required' }
        };
        res.status(400).json(response);
        return;
      }

      // PostgreSQL implementation
      const clinicaAlias = (await resolveEfectivaClinicaAlias(req)) || '';
      const client = await postgresPool.connect();
      try {
        const searchTerm = `%${q}%`;
        let result;
        if (clinicaAlias) {
          result = await client.query(
            `SELECT e.*
             FROM especialidades e
             INNER JOIN especialidades_clinicas ec ON ec.especialidad_id = e.id
             WHERE ec.clinica_alias = $1 AND ec.activa = true
               AND (e.nombre_especialidad ILIKE $2 OR e.descripcion ILIKE $2)
             ORDER BY e.nombre_especialidad ASC`,
            [clinicaAlias, searchTerm]
          );
        } else {
          result = await client.query(
            `SELECT * FROM especialidades
             WHERE nombre_especialidad ILIKE $1 OR descripcion ILIKE $1
             ORDER BY nombre_especialidad ASC`,
            [searchTerm]
          );
        }

        const response: ApiResponse = {
          success: true,
          data: result.rows
        };
        res.json(response);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('❌ Error searching especialidades:', error);
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(500).json(response);
    }
  }
}
