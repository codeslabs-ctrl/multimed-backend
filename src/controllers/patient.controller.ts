import { Request, Response } from 'express';
import { PatientService, CreatePatientResult } from '../services/patient.service.js';
import { PatientCedulaExistsError } from '../errors/patient-cedula-exists.error.js';
import { HistoricoService } from '../services/historico.service.js';
import { ApiResponse } from '../types/index.js';
import { postgresPool } from '../config/database.js';
import { isGestorOperativoClinicaAmplio } from '../utils/roles.js';
import { resolveEfectivaClinicaAlias } from '../utils/clinica-alias-request.js';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: number;
    username: string;
    rol: string;
    medico_id?: number;
  };
}

export class PatientController {
  private patientService: PatientService;
  private historicoService: HistoricoService;

  constructor() {
    this.patientService = new PatientService();
    this.historicoService = new HistoricoService();
  }

  async getAllPatients(req: Request<{}, ApiResponse, {}, any>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { page = 1, limit = 10, ...filters } = req.query;
      
      const result = await this.patientService.getAllPatients(
        filters,
        { page: Number(page), limit: Number(limit) }
      );

      const response: ApiResponse = {
        success: true,
        data: result.data,
        pagination: result.pagination
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(500).json(response);
    }
  }

  async getPatientById(req: AuthenticatedRequest, res: Response<ApiResponse>): Promise<void> {
    try {
      const { id } = req.params;
      
      if (!id) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'ID del paciente es requerido' }
        };
        res.status(400).json(response);
        return;
      }
      
      const patient = await this.patientService.getPatientById(id);

      if (!patient) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Patient not found' }
        };
        res.status(404).json(response);
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: patient
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(500).json(response);
    }
  }

  async getAntecedentes(req: AuthenticatedRequest, res: Response<ApiResponse>): Promise<void> {
    try {
      const idParam = req.params['id'];
      if (idParam === undefined) {
        res.status(400).json({ success: false, error: { message: 'ID de paciente inválido.' } });
        return;
      }
      const id = parseInt(idParam, 10);
      if (isNaN(id)) {
        res.status(400).json({ success: false, error: { message: 'ID de paciente inválido.' } });
        return;
      }
      const data = await this.historicoService.getAntecedentesByPacienteId(id);
      res.json({ success: true, data });
    } catch (error) {
      console.error('getAntecedentes error:', error);
      res.status(500).json({ success: false, error: { message: (error as Error).message } });
    }
  }

  async saveAntecedentes(req: AuthenticatedRequest, res: Response<ApiResponse>): Promise<void> {
    try {
      const idParam = req.params['id'];
      if (idParam === undefined) {
        res.status(400).json({ success: false, error: { message: 'ID de paciente inválido.' } });
        return;
      }
      const id = parseInt(idParam, 10);
      if (isNaN(id)) {
        res.status(400).json({ success: false, error: { message: 'ID de paciente inválido.' } });
        return;
      }
      const body = req.body as {
        antecedentes?: { antecedente_tipo_id: number; presente: boolean; detalle?: string | null }[];
        antecedentes_otros?: string | null;
      };
      const items = Array.isArray(body?.antecedentes) ? body.antecedentes : [];
      const data = await this.historicoService.saveAntecedentesByPacienteId(id, items, body?.antecedentes_otros);
      res.json({ success: true, data });
    } catch (error) {
      console.error('saveAntecedentes error:', error);
      res.status(500).json({ success: false, error: { message: (error as Error).message } });
    }
  }

  async getPatientByEmail(req: AuthenticatedRequest, res: Response<ApiResponse>): Promise<void> {
    try {
      let { email } = req.params;
      
      // Decodificar el email en caso de que esté codificado (especialmente el símbolo @)
      if (email) {
        email = decodeURIComponent(email);
      }
      
      if (!email) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Email del paciente es requerido' }
        };
        res.status(400).json(response);
        return;
      }
      
      const patient = await this.patientService.getPatientByEmail(email);

      if (!patient) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Patient not found' }
        };
        res.status(404).json(response);
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: patient
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(500).json(response);
    }
  }

  async createPatient(req: AuthenticatedRequest, res: Response<ApiResponse>): Promise<void> {
    try {
      const patientData = req.body;
      console.log('🔍 Backend - Datos del paciente recibidos:', JSON.stringify(patientData, null, 2));
      
        // Obtener el medico_id del token JWT para el historial médico
        const user = (req as any).user;
        console.log('🔍 Backend - Usuario del token completo:', JSON.stringify(user, null, 2));
        console.log('🔍 Backend - Tipo de usuario:', typeof user);
        console.log('🔍 Backend - Medico ID del token:', user?.medico_id);
        console.log('🔍 Backend - Rol del usuario:', user?.rol);
        
        if (user && user.medico_id) {
          // El medico_id se usará para el historial médico, no para el paciente
          console.log('✅ Backend - Medico ID disponible para historial:', user.medico_id);
        } else {
          console.log('⚠️ Backend - No se encontró medico_id en el token');
          console.log('⚠️ Backend - Usuario completo:', user);
        }
      
      const clinicaAlias = await resolveEfectivaClinicaAlias(req);

      const patient = (await this.patientService.createPatient(
        patientData,
        user?.medico_id,
        clinicaAlias
      )) as CreatePatientResult;
      console.log('✅ Backend - Paciente creado exitosamente:', patient);

      const response: ApiResponse = {
        success: true,
        data: {
          message: 'Paciente creado correctamente',
          linkedExisting: false,
          alreadyAssociated: false,
          ...patient
        }
      };
      res.status(201).json(response);
    } catch (error) {
      if (error instanceof PatientCedulaExistsError) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: { existingPatient: error.existingPatient }
          }
        };
        res.status(409).json(response);
        return;
      }
      console.error('❌ Backend - Error creando paciente:', error);
      console.error('❌ Backend - Error message:', (error as Error).message);
      console.error('❌ Backend - Error stack:', (error as Error).stack);

      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(400).json(response);
    }
  }

  async linkPatientToMedicoHistorial(req: AuthenticatedRequest, res: Response<ApiResponse>): Promise<void> {
    try {
      const user = (req as any).user;
      const medicoId = user?.medico_id;
      if (!medicoId) {
        res.status(403).json({
          success: false,
          error: { message: 'Solo un usuario médico puede vincular pacientes a su historial.' }
        });
        return;
      }
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ success: false, error: { message: 'ID de paciente requerido' } });
        return;
      }
      const body = req.body || {};
      const clinicaAlias = await resolveEfectivaClinicaAlias(req);
      const patient = (await this.patientService.linkMedicoToPatientById(
        id,
        medicoId,
        {
          motivo_consulta: body.motivo_consulta,
          diagnostico: body.diagnostico,
          conclusiones: body.conclusiones,
          plan: body.plan
        },
        clinicaAlias
      )) as CreatePatientResult;

      const message = patient.alreadyAssociated
        ? 'Este paciente ya estaba vinculado a su historial'
        : 'Paciente vinculado a su historial correctamente';

      const response: ApiResponse = {
        success: true,
        data: {
          message,
          linkedExisting: true,
          alreadyAssociated: patient.alreadyAssociated ?? false,
          ...patient
        }
      };
      res.status(200).json(response);
    } catch (error) {
      console.error('❌ Backend - Error vinculando paciente:', error);
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(400).json(response);
    }
  }

  async updatePatient(req: AuthenticatedRequest, res: Response<ApiResponse>): Promise<void> {
    try {
      const { id } = req.params;
      const patientData = req.body;
      
      if (!id) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'ID del paciente es requerido' }
        };
        res.status(400).json(response);
        return;
      }
      
      const patient = await this.patientService.updatePatient(id, patientData);

      const response: ApiResponse = {
        success: true,
        data: {
          message: 'Patient updated successfully',
          ...patient
        }
      };
      res.json(response);
    } catch (error) {
      const err = error as Error;
      console.error('❌ updatePatient error:', err.message, err.stack);
      const response: ApiResponse = {
        success: false,
        error: { message: err.message }
      };
      const status = err.message.includes('Record not found') ? 404 : 500;
      res.status(status).json(response);
    }
  }

  async deletePatient(req: AuthenticatedRequest, res: Response<ApiResponse>): Promise<void> {
    try {
      const { id } = req.params;
      
      if (!id) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'ID del paciente es requerido' }
        };
        res.status(400).json(response);
        return;
      }
      
      const success = await this.patientService.deletePatient(id);

      if (!success) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Failed to delete patient' }
        };
        res.status(400).json(response);
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: { message: 'Patient deleted successfully' }
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(500).json(response);
    }
  }

  async hasConsultations(req: AuthenticatedRequest, res: Response<ApiResponse>): Promise<void> {
    try {
      const { id } = req.params;
      
      if (!id) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'ID del paciente es requerido' }
        };
        res.status(400).json(response);
        return;
      }
      
      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
        const result = await client.query(
          'SELECT COUNT(*) as count FROM consultas_pacientes WHERE paciente_id = $1',
          [id]
        );
        
        const count = parseInt(result.rows[0].count);
        const response: ApiResponse = {
          success: true,
          data: { hasConsultations: count > 0 }
        };
        res.json(response);
      } catch (dbError) {
        console.error('❌ PostgreSQL error checking consultations:', dbError);
        throw new Error(`Database error: ${(dbError as Error).message}`);
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

  async togglePatientStatus(req: AuthenticatedRequest, res: Response<ApiResponse>): Promise<void> {
    try {
      const { id } = req.params;
      const { activo } = req.body;
      
      if (!id) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'ID del paciente es requerido' }
        };
        res.status(400).json(response);
        return;
      }
      
      if (typeof activo !== 'boolean') {
        const response: ApiResponse = {
          success: false,
          error: { message: 'El campo activo debe ser un booleano' }
        };
        res.status(400).json(response);
        return;
      }
      
      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
        const result = await client.query(
          'UPDATE pacientes SET activo = $1, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
          [activo, id]
        );
        
        if (result.rows.length === 0) {
          const response: ApiResponse = {
            success: false,
            error: { message: 'Paciente no encontrado' }
          };
          res.status(404).json(response);
          return;
        }
        
        const response: ApiResponse = {
          success: true,
          data: result.rows[0]
        };
        res.json(response);
      } catch (dbError) {
        console.error('❌ PostgreSQL error updating patient status:', dbError);
        throw new Error(`Database error: ${(dbError as Error).message}`);
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

  async searchPatients(req: Request<{}, ApiResponse, {}, { name?: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { name } = req.query;
      
      if (!name || typeof name !== 'string') {
        const response: ApiResponse = {
          success: false,
          error: { message: 'El parámetro "name" es requerido' }
        };
        res.status(400).json(response);
        return;
      }

      const trimmedName = name.trim();
      if (trimmedName.length === 0) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'El término de búsqueda no puede estar vacío' }
        };
        res.status(400).json(response);
        return;
      }

      const patients = await this.patientService.searchPatientsByName(trimmedName);

      const response: ApiResponse = {
        success: true,
        data: patients
      };
      res.json(response);
    } catch (error) {
      console.error('❌ Error en searchPatients:', error);
      const errorMessage = (error as Error).message;
      const response: ApiResponse = {
        success: false,
        error: { message: errorMessage || 'Error al buscar pacientes' }
      };
      res.status(500).json(response);
    }
  }

  async searchPatientsByCedula(req: Request<{}, ApiResponse, {}, { cedula?: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { cedula } = req.query;
      
      if (!cedula) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Cedula parameter is required' }
        };
        res.status(400).json(response);
        return;
      }

      const patients = await this.patientService.searchPatientsByCedula(cedula as string);

      const response: ApiResponse = {
        success: true,
        data: patients
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(400).json(response);
    }
  }

  async searchPatientsByTelefono(req: Request<{}, ApiResponse, {}, { telefono?: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { telefono } = req.query;

      if (!telefono || String(telefono).trim().length < 10) {
        const response: ApiResponse = {
          success: true,
          data: []
        };
        res.json(response);
        return;
      }

      const patients = await this.patientService.searchPatientsByTelefono(telefono as string);

      const response: ApiResponse = {
        success: true,
        data: patients
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(400).json(response);
    }
  }

  async searchPatientsByPatologia(req: Request<{}, ApiResponse, {}, { q?: string; medico_id?: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      const q = (req.query.q || '').trim();
      const medicoIdParam = req.query.medico_id;
      const medicoId = medicoIdParam ? parseInt(medicoIdParam, 10) : null;

      if (!q) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'El parámetro "q" es requerido para la búsqueda por patología.' }
        };
        res.status(400).json(response);
        return;
      }

      const patients = await this.patientService.searchPatientsByPatologia(q, isNaN(medicoId as number) ? null : medicoId);
      if (process.env['NODE_ENV'] !== 'production') {
        console.log('[searchPatientsByPatologia] q=', q, 'medicoId=', medicoId, 'results=', patients?.length ?? 0);
      }

      const response: ApiResponse = {
        success: true,
        data: patients
      };
      res.json(response);
    } catch (error) {
      console.error('[searchPatientsByPatologia] error:', (error as Error).message);
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(500).json(response);
    }
  }

  async getPatientsByAgeRange(req: Request<{}, ApiResponse, {}, { minAge?: string; maxAge?: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { minAge, maxAge } = req.query;
      
      if (!minAge || !maxAge) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'minAge and maxAge parameters are required' }
        };
        res.status(400).json(response);
        return;
      }

      const patients = await this.patientService.getPatientsByAgeRange(
        Number(minAge),
        Number(maxAge)
      );

      const response: ApiResponse = {
        success: true,
        data: patients
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(400).json(response);
    }
  }

  async getPatientStatistics(_req: Request, res: Response<ApiResponse>): Promise<void> {
    try {
      const statistics = await this.patientService.getPatientStatistics();

      const response: ApiResponse = {
        success: true,
        data: statistics
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(500).json(response);
    }
  }

  async getPatientsByMedico(req: Request<{ medicoId: string }, ApiResponse, {}, { page?: string; limit?: string; [key: string]: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { medicoId } = req.params;
      const { page = '1', limit = '100', ...filters } = req.query;
      
      const id = parseInt(medicoId);
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);

      if (isNaN(id) || id <= 0) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Invalid medico ID' }
        };
        res.status(400).json(response);
        return;
      }

      if (isNaN(pageNum) || pageNum < 1) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Invalid page number' }
        };
        res.status(400).json(response);
        return;
      }

      if (isNaN(limitNum) || limitNum < 1 || limitNum > 1000) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Invalid limit (must be between 1 and 1000)' }
        };
        res.status(400).json(response);
        return;
      }

      const result = await this.patientService.getPatientsByMedico(id, pageNum, limitNum, filters);

      const response: ApiResponse = {
        success: true,
        data: {
          patients: result.patients,
          total: result.total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(result.total / limitNum)
        }
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(400).json(response);
    }
  }

  /**
   * Pacientes activos del médico en sesión con última consulta (fecha_pautada + estado de esa fila).
   * Admin/secretaria pueden pasar ?medico_id=.
   */
  async getMyActivePatientsLastConsulta(req: AuthenticatedRequest, res: Response<ApiResponse>): Promise<void> {
    try {
      const user = req.user;
      const limitRaw = parseInt(String(req.query['limit'] ?? '200'), 10);
      const limit = Math.min(Math.max(isNaN(limitRaw) ? 200 : limitRaw, 1), 500);

      let medicoId: number | null = null;
      const qMedico = req.query['medico_id'] != null ? parseInt(String(req.query['medico_id']), 10) : NaN;
      if (!isNaN(qMedico) && qMedico > 0 && user && isGestorOperativoClinicaAmplio(user.rol)) {
        medicoId = qMedico;
      } else if (user?.medico_id && user.medico_id > 0) {
        medicoId = user.medico_id;
      }

      if (!medicoId) {
        const response: ApiResponse = {
          success: false,
          error: {
            message:
              'Se requiere usuario médico con medico_id o, para administrador/secretaria, el query param medico_id.',
          },
        };
        res.status(400).json(response);
        return;
      }

      const pacientes = await this.patientService.getActivePatientsWithLastConsultaByMedico(medicoId, limit);
      const response: ApiResponse = {
        success: true,
        data: {
          pacientes,
          criterio_ultima_consulta:
            'Por cada paciente se toma la consulta en consultas_pacientes con este médico que tiene la fecha_pautada más reciente; si hay empate, hora_pautada, luego fecha_creacion y id. ultima_consulta_estado es el estado_consulta de esa fila.',
        },
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message },
      };
      res.status(500).json(response);
    }
  }

  async testEndpoint(_req: Request, res: Response<ApiResponse>): Promise<void> {
    try {
      const response: ApiResponse = {
        success: true,
        data: { message: 'Test endpoint working', timestamp: new Date().toISOString() }
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(500).json(response);
    }
  }

  async testFunction(req: Request<{ medicoId: string }, ApiResponse>, res: Response<ApiResponse>): Promise<void> {
    const client = await postgresPool.connect();
    try {
      const { medicoId } = req.params;
      const id = parseInt(medicoId);

      if (isNaN(id) || id <= 0) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Invalid medico ID' }
        };
        res.status(400).json(response);
        return;
      }

      // Test the function directly using PostgreSQL
      const result = await client.query(
        `SELECT * FROM get_pacientes_medico($1)`,
        [id]
      );

      const response: ApiResponse = {
        success: true,
        data: {
          message: 'Function test result',
          medicoId: id,
          rawData: result.rows,
          error: null,
          dataType: typeof result.rows,
          dataLength: Array.isArray(result.rows) ? result.rows.length : 'not array'
        }
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(500).json(response);
    } finally {
      client.release();
    }
  }

  async testHistorico(req: Request<{ medicoId: string }, ApiResponse>, res: Response<ApiResponse>): Promise<void> {
    const client = await postgresPool.connect();
    try {
      const { medicoId } = req.params;
      const id = parseInt(medicoId);

      if (isNaN(id) || id <= 0) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Invalid medico ID' }
        };
        res.status(400).json(response);
        return;
      }

      // Test direct query to historico_pacientes using PostgreSQL
      const result = await client.query(
        `SELECT hp.*, p.* 
         FROM historico_pacientes hp
         INNER JOIN pacientes p ON hp.paciente_id = p.id
         WHERE hp.medico_id = $1`,
        [id]
      );

      const response: ApiResponse = {
        success: true,
        data: {
          message: 'Historico test result',
          medicoId: id,
          rawData: result.rows,
          error: null,
          dataType: typeof result.rows,
          dataLength: Array.isArray(result.rows) ? result.rows.length : 'not array'
        }
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(500).json(response);
    } finally {
      client.release();
    }
  }

  async getPatientsByMedicoForStats(req: AuthenticatedRequest, res: Response<ApiResponse>): Promise<void> {
    try {
      const { medicoId } = req.params;
      const user = req.user;
      
      console.log('📊 getPatientsByMedicoForStats - Request params:', { medicoId });
      console.log('📊 getPatientsByMedicoForStats - User:', user ? { userId: user.userId, rol: user.rol, medico_id: user.medico_id } : 'No user');
      
      let id: number | null = null;
      
      // Si hay medicoId en params, usarlo
      if (medicoId) {
        id = parseInt(medicoId);
        if (isNaN(id) || id <= 0) {
          const response: ApiResponse = {
            success: false,
            error: { message: 'Invalid medico ID' }
          };
          res.status(400).json(response);
          return;
        }
      } else if (user) {
        // Si no hay medicoId en params, usar el del usuario autenticado
        if (isGestorOperativoClinicaAmplio(user.rol)) {
          // Gestión clínica / finanzas: ver todos los pacientes (comportamiento anterior del admin de clínica)
          id = null;
        } else if (user.medico_id) {
          // Médico con medico_id asignado
          id = user.medico_id;
        } else {
          // Usuario sin medico_id asignado
          console.warn('⚠️ User without medico_id:', user);
          id = null;
        }
      }

      console.log('📊 getPatientsByMedicoForStats - Final medico_id:', id);
      
      // Validar que tenemos un medico_id válido o null (para admin y secretaria)
      // Admin y secretaria pueden ver todos los pacientes (id = null)
      // Médicos deben tener un medico_id asignado
      if (id === null && user && !isGestorOperativoClinicaAmplio(user.rol)) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'No se pudo determinar el médico para obtener las estadísticas' }
        };
        res.status(400).json(response);
        return;
      }
      
      const patients = await this.patientService.getPatientsByMedicoForStats(id);

      const response: ApiResponse = {
        success: true,
        data: patients
      };
      res.json(response);
    } catch (error) {
      console.error('❌ getPatientsByMedicoForStats error:', error);
      const errorMessage = (error as Error).message;
      console.error('❌ Error details:', errorMessage);
      const response: ApiResponse = {
        success: false,
        error: { message: errorMessage || 'Error al obtener estadísticas de pacientes' }
      };
      res.status(500).json(response);
    }
  }

  async getAdminStats(_req: Request, res: Response<ApiResponse>): Promise<void> {
    try {
      console.log('👑 Admin stats endpoint called');
      
      // Get all patients for admin (medicoId = null)
      const patients = await this.patientService.getPatientsByMedicoForStats(null);

      const response: ApiResponse = {
        success: true,
        data: patients
      };
      res.json(response);
    } catch (error) {
      console.error('❌ Admin stats error:', error);
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(500).json(response);
    }
  }

  async checkEmailAvailability(req: AuthenticatedRequest, res: Response<{exists: boolean}>): Promise<void> {
    try {
      const { email } = req.query;
      
      if (!email || typeof email !== 'string') {
        res.status(400).json({ exists: false });
        return;
      }

      const medicoId = (req as AuthenticatedRequest).user?.medico_id;
      const isAvailable = await this.patientService.checkEmailAvailability(email, medicoId);

      res.json({ exists: !isAvailable }); // exists: true si bloquea para este usuario
    } catch (error) {
      console.error('Error checking email availability:', error);
      res.status(500).json({ exists: false });
    }
  }

  async checkTelefonoAvailability(req: AuthenticatedRequest, res: Response<{ exists: boolean }>): Promise<void> {
    try {
      const { telefono } = req.query;
      if (!telefono || typeof telefono !== 'string') {
        res.status(400).json({ exists: false });
        return;
      }
      const medicoId = (req as AuthenticatedRequest).user?.medico_id;
      const isAvailable = await this.patientService.checkTelefonoAvailability(telefono, medicoId);
      res.json({ exists: !isAvailable });
    } catch (error) {
      console.error('Error checking telefono availability:', error);
      res.status(500).json({ exists: false });
    }
  }

  async checkCedulaAvailability(req: AuthenticatedRequest, res: Response<{ exists: boolean }>): Promise<void> {
    try {
      const { cedula } = req.query;
      if (!cedula || typeof cedula !== 'string') {
        res.status(400).json({ exists: false });
        return;
      }
      const medicoId = (req as AuthenticatedRequest).user?.medico_id;
      const isAvailable = await this.patientService.checkCedulaAvailability(cedula, medicoId);
      res.json({ exists: !isAvailable });
    } catch (error) {
      console.error('Error checking cedula availability:', error);
      res.status(500).json({ exists: false });
    }
  }
}
