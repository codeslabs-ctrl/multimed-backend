import { PatientRepository, PatientData, PatientRepositoryType } from '../repositories/patient.repository.js';
import { PaginationInfo } from '../types/index.js';
import { postgresPool } from '../config/database.js';
import { checkLimitePacientesParaClinica } from './parametros-clinica.service.js';

/** Resultado de alta: paciente nuevo o existente vinculado al médico por cédula. */
export type CreatePatientResult = PatientData & {
  linkedExisting?: boolean;
  alreadyAssociated?: boolean;
};

export class PatientService {
  private patientRepository: InstanceType<PatientRepositoryType>;

  constructor() {
    this.patientRepository = new PatientRepository();
  }

  async getAllPatients(
    filters: Record<string, any> = {},
    pagination: { page: number; limit: number } = { page: 1, limit: 10 }
  ): Promise<{ data: PatientData[]; pagination: PaginationInfo }> {
    try {
      return await this.patientRepository.findAll(filters, pagination);
    } catch (error) {
      throw new Error(`Failed to get patients: ${(error as Error).message}`);
    }
  }

  async getPatientById(id: string): Promise<PatientData | null> {
    try {
      // Obtener datos básicos del paciente
      const patient = await this.patientRepository.findById(id);
      
      if (!patient) {
        return null;
      }

      // Obtener la información médica más reciente del paciente
      let latestHistoric: any = null;

      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
        const result = await client.query(
          `SELECT motivo_consulta, diagnostico, conclusiones, plan
           FROM historico_pacientes
           WHERE paciente_id = $1
           ORDER BY fecha_consulta DESC
           LIMIT 1`,
          [id]
        );

        if (result.rows.length > 0) {
          latestHistoric = result.rows[0];
          console.log('🔍 Histórico médico encontrado (PostgreSQL):', latestHistoric);
        } else {
          console.log('🔍 No se encontró historial médico para el paciente:', id);
        }
      } catch (dbError) {
        console.error('❌ Error obteniendo historico médico (PostgreSQL):', dbError);
        // Si hay error, devolver solo los datos básicos del paciente
        return patient;
      } finally {
        client.release();
      }

      // Si se encontró información médica, agregarla al paciente
      if (latestHistoric) {
        console.log('🔍 Datos médicos encontrados:', latestHistoric);
        return {
          ...patient,
          motivo_consulta: latestHistoric.motivo_consulta || null,
          diagnostico: latestHistoric.diagnostico || null,
          conclusiones: latestHistoric.conclusiones || null,
          plan: latestHistoric.plan || null
        };
      }

      return patient;
    } catch (error) {
      console.error('❌ Error en getPatientById:', error);
      throw new Error(`Failed to get patient: ${(error as Error).message}`);
    }
  }

  async getPatientByEmail(email: string): Promise<PatientData | null> {
    try {
      return await this.patientRepository.findByEmail(email);
    } catch (error) {
      throw new Error(`Failed to get patient by email: ${(error as Error).message}`);
    }
  }

  /**
   * true = el email se puede usar en el flujo de alta (no bloquea).
   * Con médico en sesión: bloqueado solo si el paciente con ese email ya tiene fila en historico con ese médico.
   */
  async checkEmailAvailability(email: string, medicoId?: number | null): Promise<boolean> {
    try {
      const patient = await this.patientRepository.findByEmail(email);
      if (!patient) return true;
      if (medicoId == null || medicoId === undefined) {
        return false;
      }
      const pid = patient.id;
      if (pid == null) return false;
      const linked = await this.hasMedicoHistorialLink(Number(pid), medicoId);
      return !linked;
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return true;
      }
      throw new Error(`Failed to check email availability: ${(error as Error).message}`);
    }
  }

  /**
   * Misma lógica que email: disponible si no hay paciente con ese teléfono o si hay médico y aún no está vinculado.
   */
  async checkTelefonoAvailability(telefono: string, medicoId?: number | null): Promise<boolean> {
    const digits = (telefono || '').replace(/\D/g, '');
    if (digits.length < 10) return true;
    const list = await this.patientRepository.searchByTelefono(telefono);
    if (list.length === 0) return true;
    if (medicoId == null || medicoId === undefined) return false;
    const first = list[0];
    if (!first) return true;
    const pid = first.id;
    if (pid == null) return false;
    const linked = await this.hasMedicoHistorialLink(Number(pid), medicoId);
    return !linked;
  }

  /**
   * Misma lógica que email/tel: disponible si no hay paciente con esa cédula o si hay médico y aún no está vinculado.
   */
  async checkCedulaAvailability(cedula: string, medicoId?: number | null): Promise<boolean> {
    const cedulaNorm = (cedula || '').trim();
    if (!cedulaNorm) return true;
    const patient = await this.patientRepository.findByCedulaExact(cedulaNorm);
    if (!patient) return true;
    if (medicoId == null || medicoId === undefined) return false;
    const pid = patient.id;
    if (pid == null) return false;
    const linked = await this.hasMedicoHistorialLink(Number(pid), medicoId);
    return !linked;
  }

  /** DemoMed: vínculo = cualquier fila historico_pacientes con paciente_id + medico_id. */
  private async hasMedicoHistorialLink(pacienteId: number, medicoId: number): Promise<boolean> {
    const client = await postgresPool.connect();
    try {
      const r = await client.query(
        `SELECT 1 FROM historico_pacientes
         WHERE paciente_id = $1 AND medico_id = $2
         LIMIT 1`,
        [pacienteId, medicoId]
      );
      return r.rows.length > 0;
    } finally {
      client.release();
    }
  }

  private assertCedulaConsistentWithExisting(existing: PatientData, cedulaNorm: string): void {
    if (!cedulaNorm) return;
    const ec = existing.cedula ? String(existing.cedula).trim() : '';
    if (ec && ec !== cedulaNorm) {
      throw new Error(
        'La cédula no coincide con el paciente ya registrado con este correo o teléfono.'
      );
    }
  }

  /** Resuelve alias de clínica desde la petición o `CLINICA_ALIAS`. */
  private clinicaAliasOrThrow(explicit?: string | null): string {
    const v =
      (explicit != null && String(explicit).trim() !== '' ? String(explicit).trim() : '') ||
      (process.env['CLINICA_ALIAS'] || '').trim();
    if (!v) {
      throw new Error(
        'No se pudo determinar la clínica (clinica_alias). Configure CLINICA_ALIAS o asocie el usuario a una clínica.'
      );
    }
    return v;
  }

  /**
   * DemoMed `historico_pacientes` sin `consulta_id`/`titulo`: vínculo = fila con mismo paciente_id + medico_id.
   */
  private async linkMedicoToExistingPatientByCedula(
    existing: PatientData,
    patientData: Omit<PatientData, 'id' | 'fecha_creacion' | 'fecha_actualizacion'>,
    medicoId: number,
    clinicaAliasResolved: string
  ): Promise<CreatePatientResult> {
    const clinicaAlias = clinicaAliasResolved;

    const pid = existing.id;
    if (pid === undefined || pid === null) {
      throw new Error('Paciente existente sin id válido');
    }

    const { motivo_consulta, diagnostico, conclusiones, plan } = patientData;

    let alreadyAssociated = false;
    const client = await postgresPool.connect();
    try {
      await client.query('BEGIN');

      const dup = await client.query(
        `SELECT id FROM historico_pacientes
         WHERE paciente_id = $1 AND medico_id = $2
         LIMIT 1`,
        [pid, medicoId]
      );
      alreadyAssociated = dup.rows.length > 0;

      if (!alreadyAssociated) {
        await client.query(
          `INSERT INTO historico_pacientes
           (paciente_id, motivo_consulta, diagnostico, conclusiones, plan, medico_id, clinica_alias, fecha_consulta)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            pid,
            motivo_consulta || null,
            diagnostico || null,
            conclusiones || null,
            plan || null,
            medicoId,
            clinicaAlias,
            new Date().toISOString()
          ]
        );
        console.log('✅ PatientService - Vínculo médico–paciente creado (cédula existente)');
      } else {
        console.log('ℹ️ PatientService - El médico ya tenía historial con este paciente');
      }

      await client.query('COMMIT');
    } catch (dbError: unknown) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      console.error('❌ PatientService - Error vinculando paciente existente:', dbError);
      const msg = dbError instanceof Error ? dbError.message : String(dbError);
      throw new Error(`No se pudo vincular el paciente: ${msg}`);
    } finally {
      client.release();
    }

    const full = await this.getPatientById(String(pid));
    if (!full) {
      throw new Error('No se pudo cargar el paciente tras vincular');
    }
    return {
      ...full,
      linkedExisting: true,
      alreadyAssociated
    };
  }

  async linkMedicoToPatientById(
    patientId: string | number,
    medicoId: number,
    body: Partial<Pick<PatientData, 'motivo_consulta' | 'diagnostico' | 'conclusiones' | 'plan'>> = {},
    clinicaAliasExplicit?: string | null
  ): Promise<CreatePatientResult> {
    const existing = await this.patientRepository.findById(String(patientId));
    if (!existing) {
      throw new Error('Paciente no encontrado');
    }
    const payload = {
      nombres: existing.nombres,
      apellidos: existing.apellidos,
      edad: existing.edad,
      sexo: existing.sexo as PatientData['sexo'],
      cedula: existing.cedula,
      email: existing.email ?? '',
      telefono: existing.telefono ?? '',
      remitido_por: existing.remitido_por,
      motivo_consulta: body.motivo_consulta,
      diagnostico: body.diagnostico,
      conclusiones: body.conclusiones,
      plan: body.plan
    } as Omit<PatientData, 'id' | 'fecha_creacion' | 'fecha_actualizacion'>;
    const clinicaAlias = this.clinicaAliasOrThrow(clinicaAliasExplicit);
    return this.linkMedicoToExistingPatientByCedula(existing, payload, medicoId, clinicaAlias);
  }

  async createPatient(
    patientData: Omit<PatientData, 'id' | 'fecha_creacion' | 'fecha_actualizacion'>,
    medicoId?: number,
    clinicaAliasExplicit?: string | null
  ): Promise<CreatePatientResult> {
    try {
      console.log('🔍 PatientService - Validando datos del paciente:', patientData);

      if (!patientData.nombres || !patientData.apellidos || !patientData.edad || !patientData.sexo) {
        console.error('❌ PatientService - Campos requeridos faltantes:', {
          nombres: patientData.nombres,
          apellidos: patientData.apellidos,
          edad: patientData.edad,
          sexo: patientData.sexo
        });
        throw new Error('Missing required fields: nombres, apellidos, edad, sexo');
      }

      if (patientData.edad < 0 || patientData.edad > 150) {
        console.error('❌ PatientService - Edad inválida:', patientData.edad);
        throw new Error('Age must be between 0 and 150');
      }

      const validSexes = ['Masculino', 'Femenino', 'Otro'];
      if (!validSexes.includes(patientData.sexo)) {
        console.error('❌ PatientService - Sexo inválido:', patientData.sexo);
        throw new Error('Sex must be one of: Masculino, Femenino, Otro');
      }

      const clinicaAlias = this.clinicaAliasOrThrow(clinicaAliasExplicit);

      const cedulaNorm = patientData.cedula ? String(patientData.cedula).trim() : '';
      if (cedulaNorm) {
        const existingByCedula = await this.patientRepository.findByCedulaExact(cedulaNorm);
        if (existingByCedula && existingByCedula.id != null) {
          if (medicoId) {
            if (await this.hasMedicoHistorialLink(Number(existingByCedula.id), medicoId)) {
              throw new Error(
                'Este paciente ya está registrado y vinculado a su historial. Busque al paciente en su lista en lugar de crear uno nuevo.'
              );
            }
            return await this.linkMedicoToExistingPatientByCedula(
              existingByCedula,
              patientData,
              medicoId,
              clinicaAlias
            );
          }
          throw new Error(
            'La cédula ya está registrada en el sistema. Busque el paciente existente o use un usuario médico para vincularlo a su historial.'
          );
        }
      }

      if (patientData.email) {
        console.log('🔍 PatientService - Verificando email:', patientData.email);
        const existingPatientByEmail = await this.patientRepository.findByEmail(patientData.email);
        if (existingPatientByEmail && existingPatientByEmail.id != null) {
          if (medicoId) {
            if (await this.hasMedicoHistorialLink(Number(existingPatientByEmail.id), medicoId)) {
              throw new Error(
                'El correo ya está registrado y vinculado a su historial. Busque al paciente en su lista.'
              );
            }
            this.assertCedulaConsistentWithExisting(existingPatientByEmail, cedulaNorm);
            return await this.linkMedicoToExistingPatientByCedula(
              existingPatientByEmail,
              patientData,
              medicoId,
              clinicaAlias
            );
          }
          console.error('❌ PatientService - Email ya existe:', patientData.email);
          throw new Error('El email ya está registrado en el sistema');
        }
      }

      if (patientData.telefono && String(patientData.telefono).replace(/\D/g, '').length >= 10) {
        const existingByTelefono = await this.patientRepository.searchByTelefono(patientData.telefono);
        if (existingByTelefono.length > 0) {
          const ex = existingByTelefono[0]!;
          if (ex.id != null && medicoId) {
            if (await this.hasMedicoHistorialLink(Number(ex.id), medicoId)) {
              throw new Error(
                'El teléfono ya está registrado y vinculado a su historial. Busque al paciente en su lista.'
              );
            }
            this.assertCedulaConsistentWithExisting(ex, cedulaNorm);
            return await this.linkMedicoToExistingPatientByCedula(ex, patientData, medicoId, clinicaAlias);
          }
          console.error('❌ PatientService - Teléfono ya existe:', patientData.telefono);
          throw new Error('El teléfono ya está registrado en el sistema');
        }
      }

      const { motivo_consulta, diagnostico, conclusiones, plan, ...patientBasicData } = patientData;

      await checkLimitePacientesParaClinica(clinicaAlias);

      console.log('✅ PatientService - Validaciones pasadas, iniciando transacción...');
      console.log('🏥 PatientService - Clínica asignada:', clinicaAlias);

      const client = await postgresPool.connect();
      try {
        await client.query('BEGIN');

        const patientDataWithClinica = {
          ...patientBasicData,
          clinica_alias: clinicaAlias,
          ...(cedulaNorm ? { cedula: cedulaNorm } : {})
        };

        const newPatient = await this.patientRepository.create(patientDataWithClinica);
        console.log('✅ PatientService - Paciente creado:', newPatient.id);

        if (motivo_consulta || diagnostico || conclusiones || plan || medicoId) {
          const medicalData = {
            paciente_id: newPatient.id,
            motivo_consulta: motivo_consulta || null,
            diagnostico: diagnostico || null,
            conclusiones: conclusiones || null,
            plan: plan || null,
            medico_id: medicoId || null,
            clinica_alias: clinicaAlias,
            fecha_consulta: new Date().toISOString()
          };

          await client.query(
            `INSERT INTO historico_pacientes 
             (paciente_id, motivo_consulta, diagnostico, conclusiones, plan, medico_id, clinica_alias, fecha_consulta)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              medicalData.paciente_id,
              medicalData.motivo_consulta,
              medicalData.diagnostico,
              medicalData.conclusiones,
              medicalData.plan,
              medicalData.medico_id,
              medicalData.clinica_alias,
              medicalData.fecha_consulta
            ]
          );
          console.log('✅ PatientService - Historial médico creado');
        }

        await client.query('COMMIT');
        console.log('✅ PatientService - Transacción completada exitosamente');
        return newPatient;
      } catch (dbError: any) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          console.error('❌ Error al hacer rollback:', rollbackError);
        }
        console.error('❌ PatientService - Error en transacción PostgreSQL:', dbError);
        throw new Error(`Transaction failed: ${dbError.message}`);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('❌ PatientService - Error en createPatient:', error);
      throw error instanceof Error ? error : new Error(String(error));
    }
  }
  async updatePatient(id: string, patientData: Partial<PatientData>): Promise<PatientData> {
    try {
      // Validate age if provided
      if (patientData.edad !== undefined) {
        if (patientData.edad < 0 || patientData.edad > 150) {
          throw new Error('Age must be between 0 and 150');
        }
      }

      // Validate sex if provided
      if (patientData.sexo) {
        const validSexes = ['Masculino', 'Femenino', 'Otro'];
        if (!validSexes.includes(patientData.sexo)) {
          throw new Error('Sex must be one of: Masculino, Femenino, Otro');
        }
      }

      // Validate email uniqueness if provided
      if (patientData.email) {
        // PostgreSQL implementation
        const client = await postgresPool.connect();
        try {
          const result = await client.query(
            'SELECT id FROM pacientes WHERE email = $1 AND id != $2 LIMIT 1',
            [patientData.email, id]
          );
          if (result.rows.length > 0) {
            throw new Error('El email ya está registrado en el sistema');
          }
        } finally {
          client.release();
        }
      }

      // Validate cedula uniqueness if provided
      if (patientData.cedula) {
        // PostgreSQL implementation
        const client = await postgresPool.connect();
        try {
          const result = await client.query(
            'SELECT id FROM pacientes WHERE cedula = $1 AND id != $2 LIMIT 1',
            [patientData.cedula, id]
          );
          if (result.rows.length > 0) {
            throw new Error('La cédula ya está registrada en el sistema');
          }
        } finally {
          client.release();
        }
      }

      return await this.patientRepository.update(id, patientData);
    } catch (error) {
      throw new Error(`Failed to update patient: ${(error as Error).message}`);
    }
  }

  async deletePatient(id: string): Promise<boolean> {
    try {
      return await this.patientRepository.delete(id);
    } catch (error) {
      throw new Error(`Failed to delete patient: ${(error as Error).message}`);
    }
  }

  async searchPatientsByName(name: string): Promise<PatientData[]> {
    try {
      if (!name || name.trim().length === 0) {
        throw new Error('Search name cannot be empty');
      }

      return await this.patientRepository.searchByName(name.trim());
    } catch (error) {
      throw new Error(`Failed to search patients: ${(error as Error).message}`);
    }
  }

  async searchPatientsByCedula(cedula: string): Promise<PatientData[]> {
    try {
      const trimmed = (cedula ?? '').trim().toUpperCase();
      if (!trimmed || !/^[VEJPG][0-9]{3,8}$/.test(trimmed)) {
        throw new Error('La cédula debe ser V, E, J, P o G seguida de entre 3 y 8 dígitos');
      }

      return await this.patientRepository.searchByCedula(trimmed);
    } catch (error) {
      throw new Error(`Failed to search patients by cedula: ${(error as Error).message}`);
    }
  }

  async searchPatientsByTelefono(telefono: string): Promise<PatientData[]> {
    try {
      const digits = (telefono || '').replace(/\D/g, '');
      if (digits.length < 10) return [];
      return await this.patientRepository.searchByTelefono(telefono.trim());
    } catch (error) {
      throw new Error(`Failed to search patients by telefono: ${(error as Error).message}`);
    }
  }

  async searchPatientsByPatologia(q: string, medicoId: number | null): Promise<PatientData[]> {
    try {
      if (!q || q.trim().length === 0) {
        throw new Error('El término de búsqueda por patología no puede estar vacío');
      }
      return await this.patientRepository.searchByPatologia(q.trim(), medicoId);
    } catch (error) {
      throw new Error(`Failed to search patients by patologia: ${(error as Error).message}`);
    }
  }

  async getPatientsByAgeRange(minAge: number, maxAge: number): Promise<PatientData[]> {
    try {
      if (minAge < 0 || maxAge < 0 || minAge > maxAge) {
        throw new Error('Invalid age range');
      }

      return await this.patientRepository.getPatientsByAgeRange(minAge, maxAge);
    } catch (error) {
      throw new Error(`Failed to get patients by age range: ${(error as Error).message}`);
    }
  }

  async getPatientStatistics(): Promise<{
    total: number;
    bySex: { Masculino: number; Femenino: number; Otro: number };
    byAgeGroup: { [key: string]: number };
  }> {
    try {
      const { data: allPatients } = await this.patientRepository.findAll({}, { page: 1, limit: 1000 });
      
      const stats = {
        total: allPatients.length,
        bySex: { Masculino: 0, Femenino: 0, Otro: 0 },
        byAgeGroup: {} as { [key: string]: number }
      };

      allPatients.forEach((patient: PatientData) => {
        // Count by sex
        if (patient.sexo === 'Masculino') stats.bySex.Masculino++;
        else if (patient.sexo === 'Femenino') stats.bySex.Femenino++;
        else stats.bySex.Otro++;

        // Count by age group
        const ageGroup = this.getAgeGroup(patient.edad);
        stats.byAgeGroup[ageGroup] = (stats.byAgeGroup[ageGroup] || 0) + 1;
      });

      return stats;
    } catch (error) {
      throw new Error(`Failed to get patient statistics: ${(error as Error).message}`);
    }
  }

  async getPatientsByMedico(medicoId: number, page: number = 1, limit: number = 100, filters: any = {}): Promise<{ patients: PatientData[], total: number }> {
    try {
      if (!medicoId || medicoId <= 0) {
        throw new Error('Valid medico ID is required');
      }

      console.log('🔍 Getting patients for medico_id:', medicoId, 'page:', page, 'limit:', limit, 'filters:', filters);

      // Always use the enhanced fallback query that includes both historico and consultas
      console.log('🔄 Using enhanced fallback query (includes historico + consultas)');
      const fallbackResult = await this.getPatientsByMedicoFallback(medicoId);
      
      // Apply pagination to the results
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedPatients = fallbackResult.patients.slice(startIndex, endIndex);
      
      console.log('✅ Enhanced fallback result:', paginatedPatients.length, 'patients (page', page, 'of', Math.ceil(fallbackResult.total / limit), ')');
      return { 
        patients: paginatedPatients, 
        total: fallbackResult.total 
      };
    } catch (error) {
      console.error('❌ getPatientsByMedico error:', error);
      throw new Error(`Failed to get patients by medico: ${(error as Error).message}`);
    }
  }

  private async getPatientsByMedicoFallback(medicoId: number): Promise<{ patients: PatientData[], total: number }> {
    try {
      console.log('🔄 Using fallback query for medico_id:', medicoId);

      // PostgreSQL implementation with JOINs
      const client = await postgresPool.connect();
      try {
        const today = new Date().toISOString().split('T')[0];
        
        console.log('🔍 PostgreSQL query - medico_id:', medicoId, 'today:', today);
        
        // Query to get unique patients from both historico_pacientes and consultas_pacientes.
        // tiene_consulta: true si el paciente tiene al menos una consulta (para mostrar Historial vs Agendar una Consulta).
        const result = await client.query(`
          SELECT DISTINCT p.*,
            EXISTS (
              SELECT 1 FROM consultas_pacientes c
              WHERE c.paciente_id = p.id AND c.medico_id = $1
            ) AS tiene_consulta
          FROM pacientes p
          WHERE p.id IN (
            SELECT DISTINCT paciente_id 
            FROM historico_pacientes 
            WHERE medico_id = $1
            UNION
            SELECT DISTINCT paciente_id 
            FROM consultas_pacientes 
            WHERE medico_id = $1 
              AND fecha_pautada >= $2
              AND estado_consulta IN ('agendada', 'reagendada')
          )
          ORDER BY p.fecha_creacion DESC
        `, [medicoId, today]);

        console.log('✅ Fallback query result (PostgreSQL):', result.rows.length, 'unique patients');
        return { patients: result.rows, total: result.rows.length };
      } catch (dbError) {
        console.error('❌ PostgreSQL query error:', dbError);
        throw new Error(`Database query failed: ${(dbError as Error).message}`);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('❌ Fallback query error:', error);
      throw new Error(`Failed to get patients by medico (fallback): ${(error as Error).message}`);
    }
  }

  // Método específico para estadísticas (sin paginación)
  async getPatientsByMedicoForStats(medicoId: number | null = null): Promise<PatientData[]> {
    try {
      console.log('📊 Getting patients for statistics, medico_id:', medicoId);

      if (medicoId === null) {
        // For admin: get all patients directly from the patients table
        console.log('👑 Admin: Getting all patients for statistics');
        
        // PostgreSQL implementation
        const client = await postgresPool.connect();
        try {
          const result = await client.query(
            'SELECT * FROM pacientes ORDER BY fecha_creacion DESC'
          );
          console.log('✅ Admin: Retrieved', result.rows.length, 'patients');
          return result.rows;
        } catch (dbError) {
          console.error('❌ PostgreSQL query error (admin):', dbError);
          throw new Error(`Database query failed: ${(dbError as Error).message}`);
        } finally {
          client.release();
        }
      } else {
        // For doctor: use the fallback query (which includes both historico and consultas)
        console.log('👨‍⚕️ Doctor: Getting patients for medico_id:', medicoId);
        
        const fallbackResult = await this.getPatientsByMedicoFallback(medicoId);
        return fallbackResult.patients;
      }
    } catch (error) {
      console.error('❌ getPatientsByMedicoForStats error:', error);
      throw new Error(`Failed to get patients by medico for stats: ${(error as Error).message}`);
    }
  }

  private getAgeGroup(age: number): string {
    if (age < 18) return '0-17';
    if (age < 30) return '18-29';
    if (age < 45) return '30-44';
    if (age < 60) return '45-59';
    if (age < 75) return '60-74';
    return '75+';
  }

  /**
   * Pacientes activos con al menos una consulta con el médico indicado.
   * Última consulta = fila en consultas_pacientes con mayor fecha_pautada; desempate: hora_pautada, fecha_creacion, id.
   */
  async getActivePatientsWithLastConsultaByMedico(
    medicoId: number,
    limit: number = 200
  ): Promise<
    {
      paciente_id: number;
      nombre_completo: string;
      edad: number | null;
      telefono: string | null;
      email: string | null;
      ultima_consulta_fecha: string | null;
      ultima_consulta_hora: string | null;
      ultima_consulta_estado: string | null;
    }[]
  > {
    if (!medicoId || medicoId <= 0) {
      throw new Error('Valid medico ID is required');
    }
    const lim = Math.min(Math.max(limit, 1), 500);
    const client = await postgresPool.connect();
    try {
      const result = await client.query(
        `SELECT
          p.id AS paciente_id,
          TRIM(CONCAT(COALESCE(p.nombres, ''), ' ', COALESCE(p.apellidos, ''))) AS nombre_completo,
          p.edad,
          p.telefono,
          p.email,
          lc.fecha_pautada::text AS ultima_consulta_fecha,
          lc.hora_pautada::text AS ultima_consulta_hora,
          lc.estado_consulta AS ultima_consulta_estado
        FROM pacientes p
        INNER JOIN LATERAL (
          SELECT c.fecha_pautada, c.hora_pautada, c.estado_consulta
          FROM consultas_pacientes c
          WHERE c.medico_id = $1 AND c.paciente_id = p.id
          ORDER BY c.fecha_pautada DESC, c.hora_pautada DESC NULLS LAST, c.fecha_creacion DESC NULLS LAST, c.id DESC
          LIMIT 1
        ) lc ON true
        WHERE COALESCE(p.activo, true) = true
        ORDER BY p.apellidos NULLS LAST, p.nombres NULLS LAST
        LIMIT $2`,
        [medicoId, lim]
      );
      return result.rows as {
        paciente_id: number;
        nombre_completo: string;
        edad: number | null;
        telefono: string | null;
        email: string | null;
        ultima_consulta_fecha: string | null;
        ultima_consulta_hora: string | null;
        ultima_consulta_estado: string | null;
      }[];
    } finally {
      client.release();
    }
  }
}
