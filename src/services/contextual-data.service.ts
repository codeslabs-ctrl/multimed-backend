import { postgresPool } from '../config/database.js';

export interface DatosPaciente {
  id: number;
  nombres: string;
  apellidos: string;
  edad: number;
  cedula: string;
  sexo?: string | null;
  telefono: string;
  email: string;
  direccion: string;
  fecha_nacimiento: string;
}

export interface DatosMedico {
  id: number;
  nombres: string;
  apellidos: string;
  especialidad: string;
  cedula_profesional: string;
  telefono: string;
  email: string;
}

export interface UltimoInforme {
  id: number;
  titulo?: string;
  motivo_consulta: string;
  /** Desde historico_pacientes.examenes_paraclinicos */
  examenes_paraclinicos: string;
  /** Desde historico_pacientes.examenes_medico (examen físico en historia) */
  examenes_medico: string;
  diagnostico: string;
  tratamiento: string;
  conclusiones: string;
  fecha_consulta: string;
  fecha_emision: string;
}

export interface DatosContextuales {
  paciente: DatosPaciente;
  medico: DatosMedico;
  ultimoInforme?: UltimoInforme | undefined;
  historialConsultas?: UltimoInforme[] | undefined;
}

export class ContextualDataService {
  
  /**
   * Obtiene datos contextuales para un informe médico
   * @param pacienteId ID del paciente
   * @param medicoId ID del médico
   * @param clinicaAlias Alias de la clínica
   * @returns Datos contextuales completos
   */
  async obtenerDatosContextuales(
    pacienteId: number, 
    medicoId: number, 
    clinicaAlias: string,
    options?: { maxControles?: number }
  ): Promise<DatosContextuales> {
    try {
      console.log(`🔍 Iniciando obtención de datos contextuales - Paciente: ${pacienteId}, Médico: ${medicoId}, Clínica: ${clinicaAlias}`);
      
      // Obtener datos del paciente
      let paciente: DatosPaciente;
      try {
        paciente = await this.obtenerDatosPaciente(pacienteId, clinicaAlias);
      } catch (error: any) {
        console.error(`❌ Error obteniendo paciente ${pacienteId}:`, error);
        throw new Error(`Error obteniendo datos del paciente: ${error.message}`);
      }
      
      // Obtener datos del médico
      let medico: DatosMedico;
      try {
        medico = await this.obtenerDatosMedico(medicoId, clinicaAlias);
      } catch (error: any) {
        console.error(`❌ Error obteniendo médico ${medicoId}:`, error);
        throw new Error(`Error obteniendo datos del médico: ${error.message}`);
      }
      
      // Obtener último informe médico entre este paciente y médico
      let ultimoInforme: UltimoInforme | undefined;
      try {
        ultimoInforme = await this.obtenerUltimoInforme(pacienteId, medicoId, clinicaAlias);
        console.log(`📄 Último informe obtenido:`, ultimoInforme);
      } catch (error: any) {
        console.error(`⚠️ Error obteniendo último informe (continuando):`, error);
        // No lanzamos error aquí, solo continuamos sin último informe
        ultimoInforme = undefined;
      }
      
      // Obtener historial de consultas (por defecto últimas 5; para informe puede pedirse más)
      const limitControles = options?.maxControles ?? 5;
      let historialConsultas: UltimoInforme[] = [];
      try {
        historialConsultas = await this.obtenerHistorialConsultas(pacienteId, medicoId, clinicaAlias, limitControles);
        console.log(`📚 Historial obtenido:`, historialConsultas);
      } catch (error: any) {
        console.error(`⚠️ Error obteniendo historial (continuando):`, error);
        // No lanzamos error aquí, solo continuamos sin historial
        historialConsultas = [];
      }

      const resultado = {
        paciente,
        medico,
        ultimoInforme,
        historialConsultas
      };
      
      console.log(`✅ Datos contextuales completos obtenidos exitosamente`);
      return resultado;
    } catch (error: any) {
      console.error('❌ Error obteniendo datos contextuales:', error);
      console.error('Stack trace:', error.stack);
      throw error;
    }
  }

  /**
   * Obtiene datos del paciente
   */
  private async obtenerDatosPaciente(pacienteId: number, _clinicaAlias: string): Promise<DatosPaciente> {
    console.log(`🔍 Obteniendo datos del paciente ${pacienteId}`);
    
    const client = await postgresPool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM pacientes WHERE id = $1 LIMIT 1',
        [pacienteId]
      );

      if (result.rows.length === 0) {
        throw new Error(`Paciente con ID ${pacienteId} no encontrado`);
      }

      const data = result.rows[0];
      console.log(`📊 Datos del paciente obtenidos:`, data);
      console.log(`👤 Edad del paciente en BD:`, data.edad);
      console.log(`📅 Fecha de nacimiento en BD:`, data.fecha_nacimiento);

      return {
        id: data.id,
        nombres: data.nombres || '',
        apellidos: data.apellidos || '',
        edad: data.edad || 0,
        cedula: data.cedula || '',
        sexo: data.sexo || null,
        telefono: data.telefono || '',
        email: data.email || '',
        direccion: data.direccion || '',
        fecha_nacimiento: data.fecha_nacimiento || ''
      };
    } catch (error: any) {
      console.error(`❌ Error en obtenerDatosPaciente para paciente ${pacienteId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Obtiene datos del médico
   */
  private async obtenerDatosMedico(medicoId: number, clinicaAlias: string): Promise<DatosMedico> {
    console.log(`🔍 Obteniendo datos del médico ${medicoId} para clínica ${clinicaAlias}`);
    
    const client = await postgresPool.connect();
    try {
      // Primero verificar si el médico existe
      const medicoCheck = await client.query(
        'SELECT id, nombres, apellidos FROM medicos WHERE id = $1',
        [medicoId]
      );

      if (medicoCheck.rows.length === 0) {
        throw new Error(`Médico con ID ${medicoId} no existe en la base de datos`);
      }

      console.log(`✅ Médico existe:`, medicoCheck.rows[0]);

      // Verificar la relación médico-clínica
      const relacionCheck = await client.query(
        `SELECT medico_id, clinica_alias, activo 
         FROM medicos_clinicas 
         WHERE medico_id = $1 AND clinica_alias = $2`,
        [medicoId, clinicaAlias]
      );

      console.log(`📊 Relación médico-clínica encontrada:`, relacionCheck.rows);

      if (relacionCheck.rows.length === 0) {
        throw new Error(`Médico con ID ${medicoId} no está asociado a la clínica ${clinicaAlias}`);
      }

      if (!relacionCheck.rows[0].activo) {
        throw new Error(`Médico con ID ${medicoId} no está activo en la clínica ${clinicaAlias}`);
      }

      // Obtener datos completos del médico
      const result = await client.query(
        `SELECT 
          m.id, m.nombres, m.apellidos, m.email, m.telefono, m.especialidad_id, m.mpps, m.cm, m.cedula,
          e.nombre_especialidad
        FROM medicos_clinicas mc
        INNER JOIN medicos m ON mc.medico_id = m.id
        LEFT JOIN especialidades e ON m.especialidad_id = e.id
        WHERE mc.medico_id = $1
          AND mc.clinica_alias = $2
          AND mc.activo = true
        LIMIT 1`,
        [medicoId, clinicaAlias]
      );

      if (result.rows.length === 0) {
        throw new Error(`No se pudieron obtener los datos completos del médico ${medicoId} en la clínica ${clinicaAlias}`);
      }

      const medico = result.rows[0];
      console.log(`📊 Datos del médico obtenidos:`, medico);
      
      // Usar mpps o cm como cedula_profesional (priorizar mpps)
      const cedulaProfesional = medico.mpps || medico.cm || medico.cedula || '';
      
      return {
        id: medico.id,
        nombres: medico.nombres || '',
        apellidos: medico.apellidos || '',
        especialidad: medico.nombre_especialidad || 'No especificada',
        cedula_profesional: cedulaProfesional,
        telefono: medico.telefono || '',
        email: medico.email || ''
      };
    } catch (error: any) {
      console.error(`❌ Error en obtenerDatosMedico para médico ${medicoId}:`, error);
      console.error(`❌ Stack trace:`, error.stack);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Obtiene el último informe médico entre paciente y médico
   */
  private async obtenerUltimoInforme(
    pacienteId: number, 
    medicoId: number, 
    clinicaAlias: string
  ): Promise<UltimoInforme | undefined> {
    console.log(`🔍 Buscando último historial para paciente ${pacienteId}, médico ${medicoId}, clínica ${clinicaAlias}`);
    
    const client = await postgresPool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM historico_pacientes
         WHERE paciente_id = $1
           AND medico_id = $2
           AND (clinica_alias = $3 OR clinica_alias IS NULL)
         ORDER BY fecha_consulta DESC
         LIMIT 1`,
        [pacienteId, medicoId, clinicaAlias]
      );

      console.log(`📊 Resultado de la consulta en historico_pacientes:`, result.rows);

      if (result.rows.length === 0) {
        console.log(`⚠️ No se encontró último historial`);
        return undefined;
      }

      const data = result.rows[0];
      console.log(`✅ Historial encontrado:`, data);

      return {
        id: data.id,
        motivo_consulta: data.motivo_consulta || '',
        examenes_paraclinicos: data.examenes_paraclinicos || '',
        examenes_medico: data.examenes_medico || '',
        diagnostico: data.diagnostico || '',
        tratamiento: data.plan || '',
        conclusiones: data.conclusiones || '',
        fecha_consulta: data.fecha_consulta,
        fecha_emision: data.fecha_creacion
      };
    } catch (error: any) {
      console.error(`❌ Error en obtenerUltimoInforme:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Obtiene historial de consultas (controles) del paciente con el médico
   * @param limit Número máximo de controles a devolver (por defecto 5)
   */
  private async obtenerHistorialConsultas(
    pacienteId: number, 
    medicoId: number, 
    clinicaAlias: string,
    limit: number = 5
  ): Promise<UltimoInforme[]> {
    console.log(`🔍 Buscando historial de consultas para paciente ${pacienteId}, médico ${medicoId}, clínica ${clinicaAlias}, limit ${limit}`);
    
    const client = await postgresPool.connect();
    try {
      // Primero verificar si hay datos sin filtro de clínica
      const allResult = await client.query(
        `SELECT * FROM historico_pacientes
         WHERE paciente_id = $1 AND medico_id = $2`,
        [pacienteId, medicoId]
      );
      
      console.log(`📊 Datos sin filtro de clínica:`, allResult.rows.length);
      
      // Solo controles cuya consulta esté completada o finalizada (no agendada ni en progreso)
      const result = await client.query(
        `SELECT h.* FROM historico_pacientes h
         INNER JOIN consultas_pacientes c ON c.id = h.consulta_id
         WHERE h.paciente_id = $1
           AND h.medico_id = $2
           AND (h.clinica_alias = $3 OR h.clinica_alias IS NULL)
           AND c.estado_consulta IN ('completada', 'finalizada')
         ORDER BY h.fecha_consulta DESC
         LIMIT $4`,
        [pacienteId, medicoId, clinicaAlias, limit]
      );

      console.log(`📊 Resultado del historial con filtro de clínica (incluyendo null):`, result.rows.length);

      const historial = result.rows.map((historial: any) => ({
        id: historial.id,
        titulo: historial.titulo ?? undefined,
        motivo_consulta: historial.motivo_consulta || '',
        examenes_paraclinicos: historial.examenes_paraclinicos || '',
        examenes_medico: historial.examenes_medico || '',
        diagnostico: historial.diagnostico || '',
        tratamiento: historial.plan || '',
        conclusiones: historial.conclusiones || '',
        fecha_consulta: historial.fecha_consulta,
        fecha_emision: historial.fecha_creacion
      }));

      console.log(`✅ Historial mapeado:`, historial);
      return historial;
    } catch (error: any) {
      console.error(`❌ Error en obtenerHistorialConsultas:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Obtiene datos contextuales básicos (solo paciente y médico)
   */
  async obtenerDatosBasicos(pacienteId: number, medicoId: number, clinicaAlias: string): Promise<{
    paciente: DatosPaciente;
    medico: DatosMedico;
  }> {
    try {
      const paciente = await this.obtenerDatosPaciente(pacienteId, clinicaAlias);
      const medico = await this.obtenerDatosMedico(medicoId, clinicaAlias);

      return { paciente, medico };
    } catch (error) {
      console.error('Error obteniendo datos básicos:', error);
      throw error;
    }
  }
}
