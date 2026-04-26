import { postgresPool } from '../config/database.js';
import { HistoricoAntecedenteRepository } from '../repositories/historico-antecedente.repository.js';

export interface HistoricoData {
  id: number;
  paciente_id: number;
  medico_id: number;
  motivo_consulta: string;
  examenes_medico?: string;
  diagnostico?: string;
  conclusiones?: string;
  plan?: string;
  antecedentes_personales?: string;
  antecedentes_familiares?: string;
  examenes_paraclinicos?: string;
  /** Antecedentes "otros" pasaron a pacientes.antecedentes_otros (ver 005_antecedentes_otros_paciente.sql) */
  fecha_consulta: string;
  fecha_creacion: string;
  fecha_actualizacion: string;
  ruta_archivo?: string;
  nombre_archivo?: string;
  consulta_id?: number;
  titulo?: string;
  tratamiento_cumplido?: string | null;
  evaluacion_subjetiva?: string | null;
  evaluacion_complementaria?: string | null;
}

export interface HistoricoWithDetails extends HistoricoData {
  paciente_nombre?: string;
  paciente_apellidos?: string;
  medico_nombre?: string;
  medico_apellidos?: string;
  medico_sexo?: string | null;
  especialidad_nombre?: string;
}

export class HistoricoService {
  async getHistoricoById(historicoId: number): Promise<HistoricoWithDetails> {
    if (!historicoId || historicoId <= 0) throw new Error('Valid historico ID is required');

    const client = await postgresPool.connect();
    try {
        const query = `
        SELECT 
          h.id,
          h.paciente_id,
          h.medico_id,
          h.consulta_id,
          h.titulo,
          h.motivo_consulta,
          h.examenes_medico,
          h.diagnostico,
          h.conclusiones,
          h.plan,
          h.antecedentes_personales,
          h.antecedentes_familiares,
          h.examenes_paraclinicos,
          h.tratamiento_cumplido,
          h.evaluacion_subjetiva,
          h.evaluacion_complementaria,
          h.fecha_consulta,
          h.fecha_creacion,
          h.fecha_actualizacion,
          h.ruta_archivo,
          h.nombre_archivo,
          p.nombres as paciente_nombre,
          p.apellidos as paciente_apellidos,
          m.nombres as medico_nombre,
          m.apellidos as medico_apellidos,
          m.sexo as medico_sexo,
          e.nombre_especialidad as especialidad_nombre
        FROM historico_pacientes h
        LEFT JOIN pacientes p ON h.paciente_id = p.id
        LEFT JOIN medicos m ON h.medico_id = m.id
        LEFT JOIN especialidades e ON m.especialidad_id = e.id
        WHERE h.id = $1
        LIMIT 1
      `;

      const result = await client.query(query, [historicoId]);
      if (result.rows.length === 0) throw new Error('Historia médica no encontrada');

      const row = result.rows[0];
      const historico: HistoricoWithDetails = {
        id: row.id,
        paciente_id: row.paciente_id,
        medico_id: row.medico_id,
        consulta_id: row.consulta_id ?? undefined,
        titulo: row.titulo ?? undefined,
        motivo_consulta: row.motivo_consulta,
        examenes_medico: row.examenes_medico,
        diagnostico: row.diagnostico,
        conclusiones: row.conclusiones,
        plan: row.plan,
        antecedentes_personales: row.antecedentes_personales,
        antecedentes_familiares: row.antecedentes_familiares,
        examenes_paraclinicos: row.examenes_paraclinicos,
        tratamiento_cumplido: row.tratamiento_cumplido ?? null,
        evaluacion_subjetiva: row.evaluacion_subjetiva ?? null,
        evaluacion_complementaria: row.evaluacion_complementaria ?? null,
        fecha_consulta: row.fecha_consulta,
        fecha_creacion: row.fecha_creacion,
        fecha_actualizacion: row.fecha_actualizacion,
        ruta_archivo: row.ruta_archivo,
        nombre_archivo: row.nombre_archivo,
        paciente_nombre: row.paciente_nombre,
        paciente_apellidos: row.paciente_apellidos,
        medico_nombre: row.medico_nombre,
        medico_apellidos: row.medico_apellidos,
        medico_sexo: row.medico_sexo ?? null,
        especialidad_nombre: row.especialidad_nombre
      };
      return historico;
    } finally {
      client.release();
    }
  }
  async getHistoricoByPaciente(pacienteId: number): Promise<HistoricoWithDetails[]> {
    try {
      if (!pacienteId || pacienteId <= 0) {
        throw new Error('Valid paciente ID is required');
      }

      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
        const query = `
          SELECT 
            h.id,
            h.paciente_id,
            h.medico_id,
            h.consulta_id,
            h.titulo,
            h.motivo_consulta,
            h.diagnostico,
            h.conclusiones,
            h.plan,
            h.antecedentes_personales,
            h.antecedentes_familiares,
            h.examenes_paraclinicos,
            h.tratamiento_cumplido,
            h.evaluacion_subjetiva,
            h.evaluacion_complementaria,
            h.fecha_consulta,
            h.fecha_creacion,
            h.fecha_actualizacion,
            h.ruta_archivo,
            h.nombre_archivo,
            p.nombres as paciente_nombre,
            p.apellidos as paciente_apellidos,
            m.nombres as medico_nombre,
            m.apellidos as medico_apellidos,
            m.sexo as medico_sexo,
            e.nombre_especialidad as especialidad_nombre
          FROM historico_pacientes h
          LEFT JOIN pacientes p ON h.paciente_id = p.id
          LEFT JOIN medicos m ON h.medico_id = m.id
          LEFT JOIN especialidades e ON m.especialidad_id = e.id
          WHERE h.paciente_id = $1 AND h.consulta_id IS NOT NULL
          ORDER BY h.fecha_consulta DESC, h.id DESC
        `;

        const result = await client.query(query, [pacienteId]);
        
        return result.rows.map(row => ({
          id: row.id,
          paciente_id: row.paciente_id,
          medico_id: row.medico_id,
          consulta_id: row.consulta_id ?? undefined,
          titulo: row.titulo ?? null,
          motivo_consulta: row.motivo_consulta,
          diagnostico: row.diagnostico,
          conclusiones: row.conclusiones,
          plan: row.plan,
          antecedentes_personales: row.antecedentes_personales,
          antecedentes_familiares: row.antecedentes_familiares,
          examenes_paraclinicos: row.examenes_paraclinicos,
          tratamiento_cumplido: row.tratamiento_cumplido ?? null,
          evaluacion_subjetiva: row.evaluacion_subjetiva ?? null,
          evaluacion_complementaria: row.evaluacion_complementaria ?? null,
          fecha_consulta: row.fecha_consulta,
          fecha_creacion: row.fecha_creacion,
          fecha_actualizacion: row.fecha_actualizacion,
          ruta_archivo: row.ruta_archivo,
          nombre_archivo: row.nombre_archivo,
          paciente_nombre: row.paciente_nombre,
          paciente_apellidos: row.paciente_apellidos,
          medico_nombre: row.medico_nombre,
          medico_apellidos: row.medico_apellidos,
          medico_sexo: row.medico_sexo ?? null,
          especialidad_nombre: row.especialidad_nombre
        }));
      } catch (dbError) {
        console.error('❌ Error en consulta PostgreSQL:', dbError);
        throw new Error(`Database error: ${(dbError as Error).message}`);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('❌ Error en getHistoricoByPaciente:', error);
      throw new Error(`Failed to get historico by paciente: ${(error as Error).message}`);
    }
  }

  async getHistoricoByMedico(medicoId: number): Promise<HistoricoWithDetails[]> {
    try {
      if (!medicoId || medicoId <= 0) {
        throw new Error('Valid medico ID is required');
      }

      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
        const query = `
          SELECT 
            h.id,
            h.paciente_id,
            h.medico_id,
            h.motivo_consulta,
            h.diagnostico,
            h.conclusiones,
            h.plan,
            h.antecedentes_personales,
            h.antecedentes_familiares,
            h.examenes_paraclinicos,
            h.fecha_consulta,
            h.fecha_creacion,
            h.fecha_actualizacion,
            h.ruta_archivo,
            h.nombre_archivo,
            p.nombres as paciente_nombre,
            p.apellidos as paciente_apellidos,
            m.nombres as medico_nombre,
            m.apellidos as medico_apellidos,
            e.nombre_especialidad as especialidad_nombre
          FROM historico_pacientes h
          LEFT JOIN pacientes p ON h.paciente_id = p.id
          LEFT JOIN medicos m ON h.medico_id = m.id
          LEFT JOIN especialidades e ON m.especialidad_id = e.id
          WHERE h.medico_id = $1
          ORDER BY h.fecha_consulta DESC
        `;

        const result = await client.query(query, [medicoId]);
        
        return result.rows.map(row => ({
          id: row.id,
          paciente_id: row.paciente_id,
          medico_id: row.medico_id,
          motivo_consulta: row.motivo_consulta,
          diagnostico: row.diagnostico,
          conclusiones: row.conclusiones,
          plan: row.plan,
          antecedentes_personales: row.antecedentes_personales,
          antecedentes_familiares: row.antecedentes_familiares,
          examenes_paraclinicos: row.examenes_paraclinicos,
          fecha_consulta: row.fecha_consulta,
          fecha_creacion: row.fecha_creacion,
          fecha_actualizacion: row.fecha_actualizacion,
          ruta_archivo: row.ruta_archivo,
          nombre_archivo: row.nombre_archivo,
          paciente_nombre: row.paciente_nombre,
          paciente_apellidos: row.paciente_apellidos,
          medico_nombre: row.medico_nombre,
          medico_apellidos: row.medico_apellidos,
          especialidad_nombre: row.especialidad_nombre
        }));
      } catch (dbError) {
        console.error('❌ Error en consulta PostgreSQL:', dbError);
        throw new Error(`Database error: ${(dbError as Error).message}`);
      } finally {
        client.release();
      }
    } catch (error) {
      throw new Error(`Failed to get historico by medico: ${(error as Error).message}`);
    }
  }

  async getHistoricoCompleto(): Promise<HistoricoWithDetails[]> {
    try {
      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
        const query = `
          SELECT 
            h.id,
            h.paciente_id,
            h.medico_id,
            h.motivo_consulta,
            h.diagnostico,
            h.conclusiones,
            h.plan,
            h.antecedentes_personales,
            h.antecedentes_familiares,
            h.examenes_paraclinicos,
            h.fecha_consulta,
            h.fecha_creacion,
            h.fecha_actualizacion,
            h.ruta_archivo,
            h.nombre_archivo,
            p.nombres as paciente_nombre,
            p.apellidos as paciente_apellidos,
            m.nombres as medico_nombre,
            m.apellidos as medico_apellidos,
            e.nombre_especialidad as especialidad_nombre
          FROM historico_pacientes h
          LEFT JOIN pacientes p ON h.paciente_id = p.id
          LEFT JOIN medicos m ON h.medico_id = m.id
          LEFT JOIN especialidades e ON m.especialidad_id = e.id
          ORDER BY h.fecha_consulta DESC
        `;

        const result = await client.query(query);
        
        return result.rows.map(row => ({
          id: row.id,
          paciente_id: row.paciente_id,
          medico_id: row.medico_id,
          motivo_consulta: row.motivo_consulta,
          diagnostico: row.diagnostico,
          conclusiones: row.conclusiones,
          plan: row.plan,
          antecedentes_personales: row.antecedentes_personales,
          antecedentes_familiares: row.antecedentes_familiares,
          examenes_paraclinicos: row.examenes_paraclinicos,
          fecha_consulta: row.fecha_consulta,
          fecha_creacion: row.fecha_creacion,
          fecha_actualizacion: row.fecha_actualizacion,
          ruta_archivo: row.ruta_archivo,
          nombre_archivo: row.nombre_archivo,
          paciente_nombre: row.paciente_nombre,
          paciente_apellidos: row.paciente_apellidos,
          medico_nombre: row.medico_nombre,
          medico_apellidos: row.medico_apellidos,
          especialidad_nombre: row.especialidad_nombre
        }));
      } catch (dbError) {
        console.error('❌ Error en consulta PostgreSQL:', dbError);
        throw new Error(`Database error: ${(dbError as Error).message}`);
      } finally {
        client.release();
      }
    } catch (error) {
      throw new Error(`Failed to get historico completo: ${(error as Error).message}`);
    }
  }

  async getHistoricoFiltrado(pacienteId?: number, medicoId?: number): Promise<HistoricoWithDetails[]> {
    try {
      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
        let query = `
          SELECT 
            h.id,
            h.paciente_id,
            h.medico_id,
            h.motivo_consulta,
            h.diagnostico,
            h.conclusiones,
            h.plan,
            h.antecedentes_personales,
            h.antecedentes_familiares,
            h.examenes_paraclinicos,
            h.fecha_consulta,
            h.fecha_creacion,
            h.fecha_actualizacion,
            h.ruta_archivo,
            h.nombre_archivo,
            p.nombres as paciente_nombre,
            p.apellidos as paciente_apellidos,
            m.nombres as medico_nombre,
            m.apellidos as medico_apellidos,
            e.nombre_especialidad as especialidad_nombre
          FROM historico_pacientes h
          LEFT JOIN pacientes p ON h.paciente_id = p.id
          LEFT JOIN medicos m ON h.medico_id = m.id
          LEFT JOIN especialidades e ON m.especialidad_id = e.id
          WHERE 1=1
        `;
        const params: any[] = [];
        let paramIndex = 1;

        if (pacienteId) {
          query += ` AND h.paciente_id = $${paramIndex}`;
          params.push(pacienteId);
          paramIndex++;
        }

        if (medicoId) {
          query += ` AND h.medico_id = $${paramIndex}`;
          params.push(medicoId);
          paramIndex++;
        }

        query += ` ORDER BY h.fecha_consulta DESC`;

        const result = await client.query(query, params);
        
        return result.rows.map(row => ({
          id: row.id,
          paciente_id: row.paciente_id,
          medico_id: row.medico_id,
          motivo_consulta: row.motivo_consulta,
          diagnostico: row.diagnostico,
          conclusiones: row.conclusiones,
          plan: row.plan,
          antecedentes_personales: row.antecedentes_personales,
          antecedentes_familiares: row.antecedentes_familiares,
          examenes_paraclinicos: row.examenes_paraclinicos,
          fecha_consulta: row.fecha_consulta,
          fecha_creacion: row.fecha_creacion,
          fecha_actualizacion: row.fecha_actualizacion,
          ruta_archivo: row.ruta_archivo,
          nombre_archivo: row.nombre_archivo,
          paciente_nombre: row.paciente_nombre,
          paciente_apellidos: row.paciente_apellidos,
          medico_nombre: row.medico_nombre,
          medico_apellidos: row.medico_apellidos,
          especialidad_nombre: row.especialidad_nombre
        }));
      } catch (dbError) {
        console.error('❌ Error en consulta PostgreSQL:', dbError);
        throw new Error(`Database error: ${(dbError as Error).message}`);
      } finally {
        client.release();
      }
    } catch (error) {
      throw new Error(`Failed to get historico filtrado: ${(error as Error).message}`);
    }
  }

  async getLatestHistoricoByPaciente(pacienteId: number): Promise<HistoricoWithDetails | null> {
    try {
      const historico = await this.getHistoricoByPaciente(pacienteId);
      
      if (historico.length === 0) {
        return null;
      }

      // Ordenar por fecha de consulta y tomar el más reciente
      const sortedHistorico = historico.sort((a, b) => 
        new Date(b.fecha_consulta).getTime() - new Date(a.fecha_consulta).getTime()
      );

      return sortedHistorico[0] || null;
    } catch (error) {
      throw new Error(`Failed to get latest historico by paciente: ${(error as Error).message}`);
    }
  }

  // Obtener médicos que han creado historias para un paciente específico
  async getMedicosConHistoriaByPaciente(pacienteId: number): Promise<any[]> {
    try {
      if (!pacienteId || pacienteId <= 0) {
        throw new Error('Valid paciente ID is required');
      }

      console.log('🔍 getMedicosConHistoriaByPaciente - pacienteId:', pacienteId);

      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
        const query = `
          SELECT DISTINCT ON (h.medico_id)
            h.medico_id,
            h.fecha_consulta as ultima_consulta,
            m.nombres as medico_nombre,
            m.apellidos as medico_apellidos,
            e.nombre_especialidad as especialidad_nombre
          FROM historico_pacientes h
          INNER JOIN medicos m ON h.medico_id = m.id
          LEFT JOIN especialidades e ON m.especialidad_id = e.id
          WHERE h.paciente_id = $1
          ORDER BY h.medico_id, h.fecha_consulta DESC
        `;

        const result = await client.query(query, [pacienteId]);
        
        const medicos = result.rows.map(row => ({
          medico_id: row.medico_id,
          medico_nombre: row.medico_nombre || 'Médico',
          medico_apellidos: row.medico_apellidos || 'Desconocido',
          especialidad_nombre: row.especialidad_nombre || 'Sin especialidad',
          ultima_consulta: row.ultima_consulta
        }));

        console.log('✅ Médicos con historia encontrados (PostgreSQL):', medicos.length);
        return medicos;
      } catch (dbError) {
        console.error('❌ Error en consulta PostgreSQL:', dbError);
        throw new Error(`Database error: ${(dbError as Error).message}`);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('❌ Error en getMedicosConHistoriaByPaciente:', error);
      throw new Error(`Failed to get medicos con historia by paciente: ${(error as Error).message}`);
    }
  }

  // Verificar si un paciente tiene historia médica para una especialidad específica
  async tieneHistoriaPorEspecialidad(pacienteId: number, especialidadId: number): Promise<boolean> {
    try {
      if (!pacienteId || pacienteId <= 0) {
        throw new Error('Valid paciente ID is required');
      }
      if (!especialidadId || especialidadId <= 0) {
        throw new Error('Valid especialidad ID is required');
      }

      console.log('🔍 tieneHistoriaPorEspecialidad - pacienteId:', pacienteId, 'especialidadId:', especialidadId);

      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
        const query = `
          SELECT COUNT(*) as count
          FROM historico_pacientes h
          INNER JOIN medicos m ON h.medico_id = m.id
          WHERE h.paciente_id = $1
            AND m.especialidad_id = $2
        `;

        const result = await client.query(query, [pacienteId, especialidadId]);
        const count = parseInt(result.rows[0]?.count || '0');
        
        console.log('✅ Historia médica encontrada (PostgreSQL):', count > 0);
        return count > 0;
      } catch (dbError) {
        console.error('❌ Error en consulta PostgreSQL:', dbError);
        throw new Error(`Database error: ${(dbError as Error).message}`);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('❌ Error en tieneHistoriaPorEspecialidad:', error);
      throw new Error(`Failed to check historia por especialidad: ${(error as Error).message}`);
    }
  }

  // Obtener historia específica de un médico para un paciente
  async getHistoricoByPacienteAndMedico(pacienteId: number, medicoId: number): Promise<HistoricoWithDetails | null> {
    try {
      if (!pacienteId || pacienteId <= 0) {
        throw new Error('Valid paciente ID is required');
      }
      if (!medicoId || medicoId <= 0) {
        throw new Error('Valid medico ID is required');
      }

      console.log('🔍 getHistoricoByPacienteAndMedico - pacienteId:', pacienteId, 'medicoId:', medicoId);

      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
          const query = `
            SELECT 
              h.id, h.paciente_id, h.medico_id, h.consulta_id, h.titulo, h.motivo_consulta, h.examenes_medico, h.diagnostico, 
              h.conclusiones, h.plan, h.antecedentes_personales, h.antecedentes_familiares,
              h.examenes_paraclinicos, h.tratamiento_cumplido, h.evaluacion_subjetiva, h.evaluacion_complementaria,
              h.fecha_consulta, h.fecha_creacion, h.fecha_actualizacion, h.ruta_archivo, h.nombre_archivo,
              p.nombres as paciente_nombre, p.apellidos as paciente_apellidos,
              m.nombres as medico_nombre, m.apellidos as medico_apellidos,
              m.sexo as medico_sexo,
              e.nombre_especialidad as especialidad_nombre
            FROM historico_pacientes h
            LEFT JOIN pacientes p ON h.paciente_id = p.id
            LEFT JOIN medicos m ON h.medico_id = m.id
            LEFT JOIN especialidades e ON m.especialidad_id = e.id
            WHERE h.paciente_id = $1
              AND h.medico_id = $2
            ORDER BY h.fecha_consulta DESC
            LIMIT 1
          `;
          
          const result = await client.query(query, [pacienteId, medicoId]);
          
          if (result.rows.length === 0) {
            console.log('✅ Historia encontrada: No');
            return null;
          }
          
          const historia = result.rows[0];
          console.log('✅ Historia encontrada: Sí');
          
          const historico: HistoricoWithDetails = {
            id: historia.id,
            paciente_id: historia.paciente_id,
            medico_id: historia.medico_id,
            consulta_id: historia.consulta_id ?? undefined,
            titulo: historia.titulo ?? undefined,
            motivo_consulta: historia.motivo_consulta,
            examenes_medico: historia.examenes_medico,
            diagnostico: historia.diagnostico,
            conclusiones: historia.conclusiones,
            plan: historia.plan,
            antecedentes_personales: historia.antecedentes_personales,
            antecedentes_familiares: historia.antecedentes_familiares,
            examenes_paraclinicos: historia.examenes_paraclinicos,
            tratamiento_cumplido: historia.tratamiento_cumplido ?? null,
            evaluacion_subjetiva: historia.evaluacion_subjetiva ?? null,
            evaluacion_complementaria: historia.evaluacion_complementaria ?? null,
            fecha_consulta: historia.fecha_consulta,
            fecha_creacion: historia.fecha_creacion,
            fecha_actualizacion: historia.fecha_actualizacion,
            ruta_archivo: historia.ruta_archivo,
            nombre_archivo: historia.nombre_archivo,
            paciente_nombre: historia.paciente_nombre,
            paciente_apellidos: historia.paciente_apellidos,
            medico_nombre: historia.medico_nombre,
            medico_apellidos: historia.medico_apellidos,
            medico_sexo: historia.medico_sexo ?? null,
            especialidad_nombre: historia.especialidad_nombre
          };
          return historico;
        } finally {
          client.release();
        }
    } catch (error) {
      console.error('❌ Error en getHistoricoByPacienteAndMedico:', error);
      throw new Error(`Failed to get historico by paciente and medico: ${(error as Error).message}`);
    }
  }

  async updateHistorico(historicoId: number, updateData: Partial<HistoricoData>): Promise<HistoricoWithDetails> {
    try {
      if (!historicoId || historicoId <= 0) {
        throw new Error('Valid historico ID is required');
      }

      console.log('🔍 updateHistorico - historicoId:', historicoId);
      console.log('🔍 updateHistorico - updateData:', updateData);

      // Filtrar solo los campos que existen en la tabla historico_medico
      const allowedFields = ['motivo_consulta', 'examenes_medico', 'diagnostico', 'conclusiones', 'plan', 'antecedentes_personales', 'antecedentes_familiares', 'examenes_paraclinicos', 'tratamiento_cumplido', 'evaluacion_subjetiva', 'evaluacion_complementaria'];
      const filteredData: any = {};
      
      for (const [key, value] of Object.entries(updateData)) {
        if (allowedFields.includes(key)) {
          // Permitir strings vacíos, null, undefined, pero no otros tipos
          if (value !== undefined) {
            filteredData[key] = value === '' ? null : value;
          }
        }
      }

      console.log('🔍 updateHistorico - updateData recibido:', updateData);
      console.log('🔍 updateHistorico - filteredData:', filteredData);
      console.log('🔍 updateHistorico - filteredData keys:', Object.keys(filteredData));

      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
          // Construir la consulta UPDATE dinámicamente
          const updateFields: string[] = [];
          const values: any[] = [];
          let paramIndex = 1;

          for (const [key, value] of Object.entries(filteredData)) {
            // Incluir todos los valores, incluso null (para limpiar campos)
            // Solo excluir undefined
            if (value !== undefined) {
              updateFields.push(`${key} = $${paramIndex}`);
              values.push(value);
              paramIndex++;
            }
          }

          // Validar que hay al menos un campo para actualizar
          if (updateFields.length === 0) {
            console.error('❌ updateHistorico - No hay campos para actualizar');
            console.error('❌ updateHistorico - filteredData:', filteredData);
            throw new Error('No hay campos para actualizar. Debe proporcionar al menos uno de los siguientes campos: motivo_consulta, diagnostico, conclusiones, plan, antecedentes_personales, antecedentes_familiares, examenes_paraclinicos, tratamiento_cumplido, evaluacion_subjetiva, evaluacion_complementaria');
          }
          
          console.log('🔍 updateHistorico - updateFields:', updateFields);
          console.log('🔍 updateHistorico - values count:', values.length);

          // Agregar fecha_actualizacion
          updateFields.push(`fecha_actualizacion = NOW()`);
          
          // Agregar el ID al final
          values.push(historicoId);
          const whereParamIndex = paramIndex;

          const updateQuery = `
            UPDATE historico_pacientes 
            SET ${updateFields.join(', ')}
            WHERE id = $${whereParamIndex}
            RETURNING *
          `;

          console.log('🔍 updateHistorico - Query:', updateQuery);
          console.log('🔍 updateHistorico - Values:', values);
          console.log('🔍 updateHistorico - whereParamIndex:', whereParamIndex);

          let result;
          try {
            result = await client.query(updateQuery, values);
          } catch (queryError: any) {
            console.error('❌ updateHistorico - Error en query SQL:', queryError);
            console.error('❌ updateHistorico - Query que falló:', updateQuery);
            console.error('❌ updateHistorico - Valores:', values);
            throw new Error(`Error al ejecutar la actualización: ${queryError.message || 'Error desconocido'}`);
          }

          if (result.rows.length === 0) {
            console.error('❌ updateHistorico - No se encontró historia con ID:', historicoId);
            throw new Error(`No se encontró historia médica con ID ${historicoId}`);
          }

          console.log('✅ updateHistorico - Updated successfully:', result.rows[0]);

          // Obtener los datos completos con joins
          const fullDataQuery = `
            SELECT 
              h.id, h.paciente_id, h.medico_id, h.consulta_id, h.titulo, h.motivo_consulta, h.examenes_medico, h.diagnostico, 
              h.conclusiones, h.plan, h.antecedentes_personales, h.antecedentes_familiares,
              h.examenes_paraclinicos, h.tratamiento_cumplido, h.evaluacion_subjetiva, h.evaluacion_complementaria,
              h.fecha_consulta, h.fecha_creacion, h.fecha_actualizacion, h.ruta_archivo, h.nombre_archivo,
              p.nombres as paciente_nombre, p.apellidos as paciente_apellidos,
              m.nombres as medico_nombre, m.apellidos as medico_apellidos,
              e.nombre_especialidad as especialidad_nombre
            FROM historico_pacientes h
            LEFT JOIN pacientes p ON h.paciente_id = p.id
            LEFT JOIN medicos m ON h.medico_id = m.id
            LEFT JOIN especialidades e ON m.especialidad_id = e.id
            WHERE h.id = $1
          `;
          
          console.log('🔍 updateHistorico - Buscando historia completa con ID:', historicoId);
          const fullResult = await client.query(fullDataQuery, [historicoId]);
          
          if (fullResult.rows.length === 0) {
            throw new Error('No se pudo obtener los datos completos del historial actualizado');
          }

          const historicoActualizado = fullResult.rows[0];
          
          // Usar la consulta asociada al historial (consulta_id); si no hay, buscar la más reciente
          let consultaId: number | null = historicoActualizado.consulta_id && historicoActualizado.consulta_id > 0
            ? Number(historicoActualizado.consulta_id)
            : null;
          console.log('🔍 updateHistorico - paciente_id:', historicoActualizado.paciente_id);
          console.log('🔍 updateHistorico - medico_id:', historicoActualizado.medico_id);
          console.log('🔍 updateHistorico - fecha_consulta:', historicoActualizado.fecha_consulta);
          console.log('🔍 updateHistorico - consulta_id del historial:', historicoActualizado.consulta_id);
          
          if (!consultaId) {
            const consultaQuery = `
              SELECT id, estado_consulta, fecha_pautada
              FROM consultas_pacientes
              WHERE paciente_id = $1
                AND medico_id = $2
                AND estado_consulta IN ('agendada', 'reagendada', 'en_progreso', 'por_agendar', 'completada')
              ORDER BY fecha_pautada DESC, fecha_creacion DESC
              LIMIT 1
            `;
            const consultaResult = await client.query(consultaQuery, [
              historicoActualizado.paciente_id,
              historicoActualizado.medico_id
            ]);
            consultaId = consultaResult.rows.length > 0 ? consultaResult.rows[0].id : null;
          }
          console.log('🔍 updateHistorico - Consulta a actualizar (completada):', consultaId);
          
          if (consultaId) {
            const fechaConsultaUpdate = historicoActualizado.fecha_consulta || new Date().toISOString().split('T')[0];
            
            // Actualizar el estado de la consulta en consultas_pacientes a "completada"
            await this.actualizarEstadoConsulta(
              client,
              consultaId,
              historicoActualizado.paciente_id,
              historicoActualizado.medico_id,
              fechaConsultaUpdate
            );
          } else {
            console.log('ℹ️ updateHistorico - No se encontró consulta relacionada para actualizar');
          }

          return historicoActualizado;
        } finally {
          client.release();
        }
    } catch (error) {
      console.error('❌ updateHistorico - Error:', error);
      throw new Error(`Failed to update historico: ${(error as Error).message}`);
    }
  }

  /**
   * Actualiza el estado de la consulta relacionada a "completada" cuando se crea o edita una historia médica (PostgreSQL)
   */
  private async actualizarEstadoConsulta(
    client: any,
    consultaId: number | null,
    pacienteId: number,
    medicoId: number,
    fechaConsulta: string
  ): Promise<void> {
    try {
      console.log('🔄 actualizarEstadoConsulta - Buscando consulta relacionada:', {
        consultaId,
        pacienteId,
        medicoId,
        fechaConsulta
      });

      // Si tenemos el ID de la consulta, usarlo directamente
      if (consultaId && consultaId > 0) {
        console.log('🔍 actualizarEstadoConsulta - Usando consulta_id directamente:', consultaId);
        
        // Verificar que la consulta existe y obtener su estado actual
        const checkQuery = `
          SELECT id, estado_consulta, paciente_id, medico_id
          FROM consultas_pacientes
          WHERE id = $1
        `;
        
        console.log('🔍 actualizarEstadoConsulta - Verificando consulta con ID:', consultaId);
        
        const checkResult = await client.query(checkQuery, [consultaId]);
        
        if (checkResult.rows.length === 0) {
          console.log('⚠️ actualizarEstadoConsulta - Consulta no encontrada:', consultaId);
          return;
        }
        
        const consulta = checkResult.rows[0];
        console.log('🔍 actualizarEstadoConsulta - Consulta encontrada:', {
          id: consulta.id,
          estado: consulta.estado_consulta,
          paciente_id: consulta.paciente_id,
          medico_id: consulta.medico_id
        });
        
        // Solo actualizar si no está ya en "completada" o "finalizada"
        if (consulta.estado_consulta === 'completada' || consulta.estado_consulta === 'finalizada') {
          console.log(`ℹ️ actualizarEstadoConsulta - Consulta ID ${consultaId} ya está en estado "${consulta.estado_consulta}", no se actualiza`);
          return;
        }
        
        // Actualizar la consulta directamente por ID
        const updateQuery = `
          UPDATE consultas_pacientes
          SET estado_consulta = 'completada',
              fecha_culminacion = CURRENT_TIMESTAMP,
              fecha_actualizacion = CURRENT_TIMESTAMP
          WHERE id = $1
            AND estado_consulta IN ('agendada', 'reagendada', 'en_progreso', 'por_agendar')
          RETURNING id, estado_consulta
        `;
        
        const updateResult = await client.query(updateQuery, [consultaId]);
        
        if (updateResult.rows.length > 0) {
          console.log(`✅ actualizarEstadoConsulta - Consulta ID ${consultaId} actualizada a "completada"`);
        } else {
          console.log(`⚠️ actualizarEstadoConsulta - Consulta ID ${consultaId} no se pudo actualizar (estado actual: ${consulta.estado_consulta})`);
        }
        return;
      }

      // Primero buscar la consulta más reciente que coincida con paciente_id y medico_id
      // y que esté en un estado válido para completar
      const findQuery = `
        SELECT id, estado_consulta, fecha_pautada, fecha_creacion
        FROM consultas_pacientes
        WHERE paciente_id = $1
          AND medico_id = $2
          AND estado_consulta IN ('agendada', 'reagendada', 'en_progreso', 'por_agendar')
        ORDER BY fecha_pautada DESC, fecha_creacion DESC
        LIMIT 1
      `;

      const findResult = await client.query(findQuery, [pacienteId, medicoId]);

      if (findResult.rows.length === 0) {
        // Intentar buscar sin filtrar por médico (por si el médico cambió)
        const findQuerySinMedico = `
          SELECT id, estado_consulta, fecha_pautada, medico_id
          FROM consultas_pacientes
          WHERE paciente_id = $1
            AND estado_consulta IN ('agendada', 'reagendada', 'en_progreso', 'por_agendar')
          ORDER BY fecha_pautada DESC, fecha_creacion DESC
          LIMIT 1
        `;
        
        const findResultSinMedico = await client.query(findQuerySinMedico, [pacienteId]);
        
        if (findResultSinMedico.rows.length === 0) {
          console.log('ℹ️ actualizarEstadoConsulta - No se encontraron consultas activas para actualizar');
          console.log('   Parámetros de búsqueda:', { pacienteId, medicoId, fechaConsulta });
          return;
        } else {
          const consulta = findResultSinMedico.rows[0];
          console.log('⚠️ actualizarEstadoConsulta - Consulta encontrada con médico diferente:', {
            consultaId: consulta.id,
            medicoIdConsulta: consulta.medico_id,
            medicoIdBuscado: medicoId
          });
          // Actualizar la consulta encontrada aunque el médico sea diferente
          const updateResult = await client.query(
            `UPDATE consultas_pacientes
             SET estado_consulta = 'completada',
                 fecha_culminacion = CURRENT_TIMESTAMP,
                 fecha_actualizacion = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING id, estado_consulta`,
            [consulta.id]
          );
          if (updateResult.rows.length > 0) {
            console.log(`✅ actualizarEstadoConsulta - Consulta ID ${consulta.id} actualizada a "completada" (médico diferente)`);
          }
          return;
        }
      }

      const consulta = findResult.rows[0];
      if (!consulta) {
        console.log('ℹ️ actualizarEstadoConsulta - Consulta no encontrada');
        return;
      }
      
      console.log('🔍 actualizarEstadoConsulta - Consulta encontrada:', {
        id: consulta.id,
        estado: consulta.estado_consulta,
        fecha_pautada: consulta.fecha_pautada
      });

      // Actualizar la consulta encontrada
      const updateQuery = `
        UPDATE consultas_pacientes
        SET estado_consulta = 'completada',
            fecha_culminacion = CURRENT_TIMESTAMP,
            fecha_actualizacion = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING id, estado_consulta
      `;

      const updateResult = await client.query(updateQuery, [consulta.id]);

      if (updateResult.rows.length > 0) {
        console.log(`✅ actualizarEstadoConsulta - Consulta ID ${consulta.id} actualizada a "completada"`);
      } else {
        console.log('⚠️ actualizarEstadoConsulta - No se pudo actualizar la consulta');
      }
    } catch (error) {
      // No lanzar error, solo registrar, para no interrumpir el flujo principal
      console.error('⚠️ actualizarEstadoConsulta - Error al actualizar estado de consulta:', error);
    }
  }

  // Método obsoleto - ya no se usa Supabase, eliminado

  async createHistorico(historicoData: Omit<HistoricoData, 'id' | 'fecha_creacion' | 'fecha_actualizacion'>): Promise<HistoricoWithDetails> {
    try {
      console.log('🔍 createHistorico - Datos recibidos:', historicoData);

      // Validar campos requeridos
      if (!historicoData.paciente_id || !historicoData.motivo_consulta) {
        console.error('❌ Validación fallida:', {
          paciente_id: historicoData.paciente_id,
          motivo_consulta: historicoData.motivo_consulta
        });
        throw new Error('paciente_id and motivo_consulta are required');
      }

      // medico_id es requerido (se fuerza desde el controller usando el token JWT)
      const medicoId = Number(historicoData.medico_id || 0);
      if (!medicoId) {
        throw new Error('medico_id is required');
      }

      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
          const insertQuery = `
            INSERT INTO historico_pacientes (
              paciente_id, medico_id, consulta_id, titulo, motivo_consulta, examenes_medico, diagnostico, 
              conclusiones, plan, antecedentes_personales, antecedentes_familiares,
              examenes_paraclinicos, tratamiento_cumplido, evaluacion_subjetiva, evaluacion_complementaria, fecha_consulta
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            RETURNING *
          `;
          
          const fechaConsulta = (historicoData.fecha_consulta || new Date().toISOString().split('T')[0]) as string;
          const consultaIdForInsert = historicoData.consulta_id ?? null;
          const titulo = historicoData.titulo ?? 'control';
          
          const result = await client.query(insertQuery, [
            historicoData.paciente_id,
            medicoId,
            consultaIdForInsert,
            titulo,
            historicoData.motivo_consulta,
            (historicoData as HistoricoData).examenes_medico || null,
            historicoData.diagnostico || null,
            historicoData.conclusiones || null,
            historicoData.plan || null,
            historicoData.antecedentes_personales || null,
            historicoData.antecedentes_familiares || null,
            (historicoData as any).examenes_paraclinicos || null,
            (historicoData as any).tratamiento_cumplido ?? null,
            (historicoData as any).evaluacion_subjetiva ?? null,
            (historicoData as any).evaluacion_complementaria ?? null,
            fechaConsulta
          ]);

          const insertedData = result.rows[0];
          console.log('✅ createHistorico - Historial creado:', insertedData);

          // Obtener los datos completos con joins
          const fullDataQuery = `
            SELECT 
              h.id, h.paciente_id, h.medico_id, h.consulta_id, h.titulo, h.motivo_consulta, h.examenes_medico, h.diagnostico, 
              h.conclusiones, h.plan, h.tratamiento_cumplido, h.evaluacion_subjetiva, h.evaluacion_complementaria,
              h.fecha_consulta, h.fecha_creacion, h.fecha_actualizacion, h.ruta_archivo, h.nombre_archivo,
              p.nombres as paciente_nombre, p.apellidos as paciente_apellidos,
              m.nombres as medico_nombre, m.apellidos as medico_apellidos
            FROM historico_pacientes h
            LEFT JOIN pacientes p ON h.paciente_id = p.id
            LEFT JOIN medicos m ON h.medico_id = m.id
            WHERE h.id = $1
          `;
          
          const fullResult = await client.query(fullDataQuery, [insertedData.id]);
          
          if (fullResult.rows.length === 0) {
            throw new Error('No se pudo obtener los datos completos del historial creado');
          }

          const historicoCreado = fullResult.rows[0];
          
          // Buscar la consulta relacionada en consultas_pacientes para actualizar su estado
          console.log('🔍 createHistorico - Buscando consulta relacionada');
          console.log('🔍 createHistorico - paciente_id:', historicoData.paciente_id);
          console.log('🔍 createHistorico - medico_id:', medicoId);
          console.log('🔍 createHistorico - fecha_consulta:', fechaConsulta);
          console.log('🔍 createHistorico - consulta_id proporcionado:', historicoData.consulta_id);
          
          // Primero intentar usar el consulta_id si fue proporcionado
          let consultaId = historicoData.consulta_id || null;
          
          // Si no hay consulta_id, buscar la consulta más reciente
          if (!consultaId || consultaId <= 0) {
            const consultaQuery = `
              SELECT id, estado_consulta, fecha_pautada
              FROM consultas_pacientes
              WHERE paciente_id = $1
                AND medico_id = $2
                AND estado_consulta IN ('agendada', 'reagendada', 'en_progreso', 'por_agendar', 'completada')
              ORDER BY fecha_pautada DESC, fecha_creacion DESC
              LIMIT 1
            `;
            
            const consultaResult = await client.query(consultaQuery, [
              historicoData.paciente_id,
              medicoId
            ]);
            
            consultaId = consultaResult.rows.length > 0 ? consultaResult.rows[0].id : null;
            console.log('🔍 createHistorico - Consulta encontrada por búsqueda:', consultaId);
          } else {
            console.log('🔍 createHistorico - Usando consulta_id proporcionado:', consultaId);
          }
          
          // Actualizar el estado de la consulta en consultas_pacientes a "completada"
          if (consultaId) {
            await this.actualizarEstadoConsulta(
              client,
              consultaId,
              historicoData.paciente_id,
              medicoId,
              fechaConsulta
            );
          } else {
            console.log('ℹ️ createHistorico - No se encontró consulta relacionada para actualizar');
          }

          return historicoCreado;
        } finally {
          client.release();
        }
    } catch (error) {
      console.error('❌ createHistorico - Error:', error);
      throw new Error(`Failed to create historico: ${(error as Error).message}`);
    }
  }

  /**
   * Antecedentes están por paciente. Se resuelve historicoId -> paciente_id y se devuelve
   * antecedentes de antecedente_paciente + antecedentes_otros de pacientes.
   */
  async getAntecedentesByHistoricoId(historicoId: number): Promise<{ antecedentes: import('../repositories/historico-antecedente.repository.js').HistoricoAntecedenteRow[]; antecedentes_otros: string | null }> {
    const historico = await this.getHistoricoById(historicoId);
    const pacienteId = historico.paciente_id;
    const repo = new HistoricoAntecedenteRepository();
    const antecedentes = await repo.getByPacienteId(pacienteId);
    const client = await postgresPool.connect();
    let antecedentes_otros: string | null = null;
    try {
      const r = await client.query('SELECT antecedentes_otros FROM pacientes WHERE id = $1', [pacienteId]);
      if (r.rows.length > 0) antecedentes_otros = r.rows[0].antecedentes_otros ?? null;
    } finally {
      client.release();
    }
    return { antecedentes, antecedentes_otros };
  }

  async saveAntecedentesBulk(
    historicoId: number,
    items: { antecedente_tipo_id: number; presente: boolean; detalle?: string | null }[],
    antecedentes_otros?: string | null
  ) {
    const historico = await this.getHistoricoById(historicoId);
    const pacienteId = historico.paciente_id;
    const repo = new HistoricoAntecedenteRepository();
    const antecedentes = await repo.saveBulk(pacienteId, items);
    if (antecedentes_otros !== undefined) {
      const client = await postgresPool.connect();
      try {
        await client.query('UPDATE pacientes SET antecedentes_otros = $1, fecha_actualizacion = NOW() WHERE id = $2', [
          antecedentes_otros ?? null,
          pacienteId
        ]);
      } finally {
        client.release();
      }
    }
    const otrosResult = await postgresPool.query('SELECT antecedentes_otros FROM pacientes WHERE id = $1', [pacienteId]);
    const otros = otrosResult.rows.length > 0 ? (otrosResult.rows[0].antecedentes_otros ?? null) : null;
    return { antecedentes, antecedentes_otros: otros };
  }

  /** Antecedentes por paciente (para edición en ficha del paciente). */
  async getAntecedentesByPacienteId(pacienteId: number) {
    const repo = new HistoricoAntecedenteRepository();
    const antecedentes = await repo.getByPacienteId(pacienteId);
    const client = await postgresPool.connect();
    let antecedentes_otros: string | null = null;
    try {
      const r = await client.query('SELECT antecedentes_otros FROM pacientes WHERE id = $1', [pacienteId]);
      if (r.rows.length > 0) antecedentes_otros = r.rows[0].antecedentes_otros ?? null;
    } finally {
      client.release();
    }
    return { antecedentes, antecedentes_otros };
  }

  async saveAntecedentesByPacienteId(
    pacienteId: number,
    items: { antecedente_tipo_id: number; presente: boolean; detalle?: string | null }[],
    antecedentes_otros?: string | null
  ) {
    const repo = new HistoricoAntecedenteRepository();
    const antecedentes = await repo.saveBulk(pacienteId, items);
    if (antecedentes_otros !== undefined) {
      const client = await postgresPool.connect();
      try {
        await client.query('UPDATE pacientes SET antecedentes_otros = $1 WHERE id = $2', [
          antecedentes_otros ?? null,
          pacienteId
        ]);
      } finally {
        client.release();
      }
    }
    const otrosResult = await postgresPool.query('SELECT antecedentes_otros FROM pacientes WHERE id = $1', [pacienteId]);
    const otros = otrosResult.rows.length > 0 ? (otrosResult.rows[0].antecedentes_otros ?? null) : null;
    return { antecedentes, antecedentes_otros: otros };
  }
}
