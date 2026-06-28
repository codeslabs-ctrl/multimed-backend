import { Request, Response } from 'express';
import { PoolClient } from 'pg';
import { postgresPool } from '../config/database.js';
import { ApiResponse } from '../types/index.js';
import { EmailService } from '../services/email.service.js';
import { checkLimiteMedicosParaClinica } from '../services/parametros-clinica.service.js';
import bcrypt from 'bcrypt';
import { isOperadorClinicaJwt, puedeGestionarMedicos } from '../utils/roles.js';
import { getClinicaAliasFilterForReq } from '../utils/clinica-alias-request.js';

type JwtUser = { rol?: string; clinica_id?: number | null; userId?: number };

async function resolveClinicaAltaMedico(
  client: PoolClient,
  bodyClinicaId: unknown,
  reqUser: JwtUser | undefined
): Promise<{ clinicaId: number; alias: string } | { error: string; status: number }> {
  if (!reqUser) return { error: 'No autenticado', status: 401 };
  if (!puedeGestionarMedicos(reqUser.rol)) return { error: 'No autorizado', status: 403 };

  const rid =
    bodyClinicaId !== undefined && bodyClinicaId !== null && String(bodyClinicaId).trim() !== ''
      ? Number(bodyClinicaId)
      : NaN;

  if (isOperadorClinicaJwt(reqUser)) {
    const cid = reqUser.clinica_id;
    if (cid == null) return { error: 'Usuario administrador de clínica sin clinica_id', status: 403 };
    const r = await client.query('SELECT id, alias FROM clinicas WHERE id = $1 AND activa = true', [cid]);
    if (r.rows.length === 0) return { error: 'Clínica del usuario no válida', status: 403 };
    if (!Number.isNaN(rid) && rid !== cid) return { error: 'No puede asignar médicos a otra clínica', status: 403 };
    return { clinicaId: r.rows[0].id, alias: r.rows[0].alias };
  }

  if ((reqUser.rol || '').trim() === 'secretaria') {
    if (reqUser.clinica_id != null) {
      const r = await client.query('SELECT id, alias FROM clinicas WHERE id = $1 AND activa = true', [
        reqUser.clinica_id
      ]);
      if (r.rows.length === 0) return { error: 'Clínica no válida', status: 403 };
      if (!Number.isNaN(rid) && rid !== reqUser.clinica_id) {
        return { error: 'No puede asignar médicos a otra clínica', status: 403 };
      }
      return { clinicaId: r.rows[0].id, alias: r.rows[0].alias };
    }
    if (Number.isNaN(rid) || rid <= 0) return { error: 'clinica_id es requerido', status: 400 };
    const r = await client.query('SELECT id, alias FROM clinicas WHERE id = $1 AND activa = true', [rid]);
    if (r.rows.length === 0) return { error: 'Clínica no encontrada', status: 400 };
    return { clinicaId: r.rows[0].id, alias: r.rows[0].alias };
  }

  return { error: 'No autorizado', status: 403 };
}

async function medicoPerteneceAclinicaUsuario(
  client: PoolClient,
  medicoId: number,
  clinicaIdUsuario: number
): Promise<boolean> {
  const a = await client.query('SELECT alias FROM clinicas WHERE id = $1', [clinicaIdUsuario]);
  if (a.rows.length === 0) return false;
  const alias = a.rows[0].alias as string;
  const r = await client.query(
    `SELECT 1 FROM medicos_clinicas WHERE medico_id = $1 AND clinica_alias = $2 AND activo = true`,
    [medicoId, alias]
  );
  return r.rows.length > 0;
}

export class MedicoController {

  async getMedicoById(req: Request<{ id: string }, ApiResponse>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { id } = req.params;
      const medicoId = parseInt(id);

      if (isNaN(medicoId) || medicoId <= 0) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Invalid medico ID' }
        };
        res.status(400).json(response);
        return;
      }

      const reqUser = (req as { user?: JwtUser }).user;

      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
        if (
          reqUser &&
          reqUser.clinica_id != null &&
          (isOperadorClinicaJwt(reqUser) || reqUser.rol === 'secretaria')
        ) {
          const allowed = await medicoPerteneceAclinicaUsuario(client, medicoId, reqUser.clinica_id);
          if (!allowed) {
            res.status(403).json({ success: false, error: { message: 'No autorizado para este médico' } } as ApiResponse);
            return;
          }
        }

        const result = await client.query(
          `SELECT m.*, e.nombre_especialidad
           FROM medicos m
           LEFT JOIN especialidades e ON m.especialidad_id = e.id
           WHERE m.id = $1`,
          [medicoId]
        );

        if (result.rows.length === 0) {
          const response: ApiResponse = {
            success: false,
            error: { message: 'Medico not found' }
          };
          res.status(404).json(response);
          return;
        }

        const row = result.rows[0];
        const nombreEspecialidad = row.nombre_especialidad || 'Especialidad no encontrada';
        const medico = {
          ...row,
          especialidad: nombreEspecialidad,
          especialidad_nombre: nombreEspecialidad
        };

        const response: ApiResponse = {
          success: true,
          data: medico
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

  async getAllMedicos(req: Request, res: Response<ApiResponse>): Promise<void> {
    try {
      const clinicaAliasFilter = await getClinicaAliasFilterForReq(req);

      const client = await postgresPool.connect();
      try {
        const medicosResult = clinicaAliasFilter
          ? await client.query(
              `
          SELECT m.*, e.nombre_especialidad
          FROM medicos m
          INNER JOIN medicos_clinicas mc ON mc.medico_id = m.id AND mc.clinica_alias = $1
          LEFT JOIN especialidades e ON m.especialidad_id = e.id
          ORDER BY m.nombres ASC
        `,
              [clinicaAliasFilter]
            )
          : await client.query(`
          SELECT m.*, e.nombre_especialidad
          FROM medicos m
          LEFT JOIN especialidades e ON m.especialidad_id = e.id
          ORDER BY m.nombres ASC
        `);
        const medicos = medicosResult.rows.map(medico => ({
          ...medico,
          especialidad_nombre: medico.nombre_especialidad || 'Especialidad no encontrada'
        }));

        const response: ApiResponse = {
          success: true,
          data: medicos
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

  async createMedico(req: Request<{}, ApiResponse, { nombres: string; apellidos: string; cedula?: string; email: string; telefono: string; especialidad_id: number; clinica_id?: number; sexo?: string; mpps?: string; cm?: string; titulacion?: string; contacto_redes?: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      console.log('📥 Datos recibidos en createMedico:', req.body);
      const { nombres, apellidos, cedula, email, telefono, especialidad_id, sexo, mpps, cm, titulacion, contacto_redes } = req.body;

      console.log('🔍 Validando campos:');
      console.log('  - nombres:', nombres, typeof nombres);
      console.log('  - apellidos:', apellidos, typeof apellidos);
      console.log('  - cedula:', cedula, typeof cedula);
      console.log('  - email:', email, typeof email);
      console.log('  - telefono:', telefono, typeof telefono);
      console.log('  - especialidad_id:', especialidad_id, typeof especialidad_id);

      if (!nombres || !apellidos || !email || !telefono || !especialidad_id) {
        console.log('❌ Validación falló - campos faltantes');
        const response: ApiResponse = {
          success: false,
          error: { message: 'All fields are required' }
        };
        res.status(400).json(response);
        return;
      }

      const client = await postgresPool.connect();
      try {
        await client.query('BEGIN');

        const reqUser = (req as { user?: JwtUser }).user;
        const resolved = await resolveClinicaAltaMedico(
          client,
          (req.body as { clinica_id?: number }).clinica_id,
          reqUser
        );
        if ('error' in resolved) {
          await client.query('ROLLBACK');
          res.status(resolved.status).json({ success: false, error: { message: resolved.error } } as ApiResponse);
          return;
        }
        const clinicaAlias = resolved.alias;

        try {
          await checkLimiteMedicosParaClinica(clinicaAlias);
        } catch (limitError: unknown) {
          await client.query('ROLLBACK');
          const msg = limitError instanceof Error ? limitError.message : 'Límite de médicos alcanzado.';
          res.status(400).json({ success: false, error: { message: msg } } as ApiResponse);
          return;
        }

        const emailTrim = String(email).trim();
        const emailLower = emailTrim.toLowerCase();

        /**
         * Mismo email = misma persona: un solo registro en `medicos` y `usuarios`, varias filas en `medicos_clinicas`.
         * Si el médico ya existe, solo vinculamos la clínica actual (no duplicar usuario ni violar usuarios_email_key).
         */
        let medicoExistente: Record<string, unknown> | null = null;
        const porEmailMedico = await client.query(
          `SELECT * FROM medicos WHERE lower(trim(email)) = $1`,
          [emailLower]
        );
        if (porEmailMedico.rows.length > 0) {
          medicoExistente = porEmailMedico.rows[0] as Record<string, unknown>;
        } else {
          const usuarioMismoEmail = await client.query(
            `SELECT id, medico_id, rol FROM usuarios WHERE lower(trim(email)) = $1`,
            [emailLower]
          );
          if (usuarioMismoEmail.rows.length > 0) {
            const um = usuarioMismoEmail.rows[0] as { medico_id: number | null };
            if (um.medico_id != null) {
              const mByUser = await client.query(`SELECT * FROM medicos WHERE id = $1`, [um.medico_id]);
              if (mByUser.rows.length > 0) {
                medicoExistente = mByUser.rows[0] as Record<string, unknown>;
              }
            } else {
              await client.query('ROLLBACK');
              res.status(400).json({
                success: false,
                error: {
                  message:
                    'Este correo ya tiene una cuenta de usuario (por ejemplo administrador de plataforma o de clínica). Cada acceso debe usar un email distinto; indique otro correo para el médico.'
                }
              } as ApiResponse);
              return;
            }
          }
        }

        if (medicoExistente) {
          const mid = medicoExistente['id'] as number;
          if (
            cedula &&
            medicoExistente['cedula'] &&
            String(cedula).trim() !== String(medicoExistente['cedula']).trim()
          ) {
            await client.query('ROLLBACK');
            res.status(400).json({
              success: false,
              error: { message: 'La cédula no coincide con el médico registrado con este email.' }
            } as ApiResponse);
            return;
          }
          const yaEnClinica = await client.query(
            `SELECT 1 FROM medicos_clinicas WHERE medico_id = $1 AND clinica_alias = $2 AND activo = true`,
            [mid, clinicaAlias]
          );
          if (yaEnClinica.rows.length > 0) {
            await client.query('ROLLBACK');
            res.status(400).json({
              success: false,
              error: { message: 'Este médico ya está asignado a esta clínica.' }
            } as ApiResponse);
            return;
          }
          await client.query(
            `INSERT INTO medicos_clinicas (medico_id, clinica_alias, activo)
             VALUES ($1, $2, true)
             ON CONFLICT (medico_id, clinica_alias) DO UPDATE SET activo = true`,
            [mid, clinicaAlias]
          );
          await client.query('COMMIT');
          res.status(200).json({
            success: true,
            data: {
              medico: medicoExistente,
              vinculado_a_clinica: true,
              message:
                'Médico ya existente asociado a esta clínica. El acceso al sistema sigue siendo el mismo usuario y contraseña.'
            }
          } as ApiResponse);
          return;
        }

        // Verificar si la cédula ya existe (si se proporciona) — médico nuevo
        if (cedula) {
          const cedulaCheck = await client.query(
            'SELECT id FROM medicos WHERE cedula = $1',
            [cedula]
          );

          if (cedulaCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            const response: ApiResponse = {
              success: false,
              error: { message: 'La cédula ya está registrada en el sistema' }
            };
            res.status(400).json(response);
            return;
          }
        }

        // Insertar en medicos
        const medicoResult = await client.query(
          `INSERT INTO medicos (nombres, apellidos, cedula, email, telefono, especialidad_id, sexo, mpps, cm, titulacion, contacto_redes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING *`,
          [
            nombres,
            apellidos,
            cedula || null,
            emailTrim,
            telefono,
            especialidad_id,
            sexo === 'Femenino' || sexo === 'Masculino' ? sexo : null,
            mpps || null,
            cm || null,
            titulacion || null,
            contacto_redes || null
          ]
        );

        const newMedico = medicoResult.rows[0];
        const medicoId = newMedico.id;

        // Insertar en medicos_clinicas (activo tiene default true, fecha_asignacion tiene default)
        await client.query(
          `INSERT INTO medicos_clinicas (medico_id, clinica_alias)
           VALUES ($1, $2)
           ON CONFLICT (medico_id, clinica_alias) DO NOTHING`,
          [medicoId, clinicaAlias]
        );

        // Generar username del email (parte antes del @)
        const username = emailTrim.split('@')[0];
        
        if (!username) {
          throw new Error('Email inválido: no se puede generar username');
        }
        
        // Generar OTP de 8 dígitos
        const otp = Math.floor(10000000 + Math.random() * 90000000).toString();
        
        // Hash del OTP
        const hashedOtp = await bcrypt.hash(otp, 10);
        
        // Crear usuario con OTP temporal dentro de la transacción
        const usuarioResult = await client.query(
          `INSERT INTO usuarios (username, email, password_hash, rol, medico_id, activo, verificado, first_login, password_changed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING *`,
          [username, emailTrim, hashedOtp, 'medico', medicoId, true, false, true, null]
        );

        const newUser = usuarioResult.rows[0];

        // Confirmar transacción (médico, medicos_clinicas y usuario)
        await client.query('COMMIT');

        // Enviar email con OTP
        console.log('🚀 INICIANDO PROCESO DE EMAIL...');
        try {
          console.log('📧 Intentando enviar email a:', emailTrim);
          console.log('📧 Username generado:', username);
          console.log('📧 OTP generado:', otp);
          
          const emailService = new EmailService();
          const sexoMed = (newMedico.sexo || '').toString().toLowerCase();
          const tituloMed = sexoMed === 'femenino' ? 'Dra.' : 'Dr.';
          const tituloNombre = `${tituloMed} ${nombres} ${apellidos}`.trim();
          const emailSent = await emailService.sendMedicoWelcomeEmail(
            emailTrim,
            {
              nombre: `${nombres} ${apellidos}`,
              tituloNombre,
              username,
              userEmail: emailTrim,
              otp,
              expiresIn: '24 horas'
            }
          );

          if (emailSent) {
            console.log('✅ Email enviado exitosamente');
          } else {
            console.warn('⚠️ Email no enviado, pero médico y usuario creados correctamente');
          }
        } catch (emailError) {
          console.error('❌ Error enviando email:', emailError);
          console.error('❌ Detalles del error:', (emailError as Error).message);
          // No fallar la creación si falla el email
        }

        console.log('🏁 FINALIZANDO PROCESO DE EMAIL...');

        const response: ApiResponse = {
          success: true,
          data: {
            medico: newMedico,
            usuario: {
              id: newUser.id,
              username: newUser.username,
              email: newUser.email,
              rol: newUser.rol,
              first_login: newUser.first_login
            },
            message: 'Médico creado exitosamente. Se ha enviado un OTP por email para el primer acceso.'
          }
        };
        res.status(201).json(response);
      } catch (dbError: any) {
        // Revertir transacción en caso de error
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          console.error('❌ Error al hacer rollback:', rollbackError);
        }
        console.error('❌ PostgreSQL error creating medico:', dbError);
        
        // Verificar errores específicos
        if (dbError.code === '23505') { // Unique violation
          const response: ApiResponse = {
            success: false,
            error: { message: 'Ya existe un médico con ese email o cédula' }
          };
          res.status(400).json(response);
          return;
        }
        
        if (dbError.code === '23503') { // Foreign key violation
          const response: ApiResponse = {
            success: false,
            error: { message: 'La especialidad seleccionada no existe' }
          };
          res.status(400).json(response);
          return;
        }
        
        // Error genérico para el usuario
        const response: ApiResponse = {
          success: false,
          error: { message: 'No se pudo crear el médico. Por favor, verifique los datos e intente nuevamente.' }
        };
        res.status(400).json(response);
      } finally {
        client.release();
      }
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(400).json(response);
    }
  }

  async updateMedico(req: Request<{ id: string }, ApiResponse, { nombres?: string; apellidos?: string; cedula?: string; email?: string; telefono?: string; especialidad_id?: number; sexo?: string; mpps?: string; cm?: string; titulacion?: string; contacto_redes?: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const medicoId = parseInt(id);

      if (isNaN(medicoId) || medicoId <= 0) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Invalid medico ID' }
        };
        res.status(400).json(response);
        return;
      }

      const reqUser = (req as { user?: JwtUser }).user;
      const client = await postgresPool.connect();
      try {
        if (
          reqUser &&
          reqUser.clinica_id != null &&
          (isOperadorClinicaJwt(reqUser) || reqUser.rol === 'secretaria')
        ) {
          const allowed = await medicoPerteneceAclinicaUsuario(client, medicoId, reqUser.clinica_id);
          if (!allowed) {
            res.status(403).json({ success: false, error: { message: 'No puede editar médicos de otra clínica' } });
            return;
          }
        }

        // Verificar si el email ya existe en otro médico (si se está actualizando)
        if (updateData.email) {
          const emailCheck = await client.query(
            'SELECT id FROM medicos WHERE email = $1 AND id != $2',
            [updateData.email, medicoId]
          );

          if (emailCheck.rows.length > 0) {
            const response: ApiResponse = {
              success: false,
              error: { message: 'El email ya está registrado en el sistema' }
            };
            res.status(400).json(response);
            return;
          }
        }

        // Verificar si la cédula ya existe en otro médico (si se está actualizando)
        if (updateData.cedula) {
          const cedulaCheck = await client.query(
            'SELECT id FROM medicos WHERE cedula = $1 AND id != $2',
            [updateData.cedula, medicoId]
          );

          if (cedulaCheck.rows.length > 0) {
            const response: ApiResponse = {
              success: false,
              error: { message: 'La cédula ya está registrada en el sistema' }
            };
            res.status(400).json(response);
            return;
          }
        }

        // Construir query dinámico para UPDATE
        const setClauses: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (updateData.nombres !== undefined) {
          setClauses.push(`nombres = $${paramIndex}`);
          values.push(updateData.nombres);
          paramIndex++;
        }
        if (updateData.apellidos !== undefined) {
          setClauses.push(`apellidos = $${paramIndex}`);
          values.push(updateData.apellidos);
          paramIndex++;
        }
        if (updateData.cedula !== undefined) {
          setClauses.push(`cedula = $${paramIndex}`);
          values.push(updateData.cedula);
          paramIndex++;
        }
        if (updateData.email !== undefined) {
          setClauses.push(`email = $${paramIndex}`);
          values.push(updateData.email);
          paramIndex++;
        }
        if (updateData.telefono !== undefined) {
          setClauses.push(`telefono = $${paramIndex}`);
          values.push(updateData.telefono);
          paramIndex++;
        }
        if (updateData.especialidad_id !== undefined) {
          setClauses.push(`especialidad_id = $${paramIndex}`);
          values.push(updateData.especialidad_id);
          paramIndex++;
        }
        if (updateData.sexo !== undefined) {
          setClauses.push(`sexo = $${paramIndex}`);
          values.push(updateData.sexo === 'Femenino' || updateData.sexo === 'Masculino' ? updateData.sexo : null);
          paramIndex++;
        }
        if (updateData.mpps !== undefined) {
          setClauses.push(`mpps = $${paramIndex}`);
          values.push(updateData.mpps);
          paramIndex++;
        }
        if (updateData.cm !== undefined) {
          setClauses.push(`cm = $${paramIndex}`);
          values.push(updateData.cm);
          paramIndex++;
        }
        if (updateData.titulacion !== undefined) {
          setClauses.push(`titulacion = $${paramIndex}`);
          values.push(updateData.titulacion);
          paramIndex++;
        }
        if (updateData.contacto_redes !== undefined) {
          setClauses.push(`contacto_redes = $${paramIndex}`);
          values.push(updateData.contacto_redes);
          paramIndex++;
        }

        if (setClauses.length === 0) {
          const response: ApiResponse = {
            success: false,
            error: { message: 'No hay campos para actualizar' }
          };
          res.status(400).json(response);
          return;
        }

        values.push(medicoId);
        const sqlQuery = `
          UPDATE medicos
          SET ${setClauses.join(', ')}, fecha_actualizacion = CURRENT_TIMESTAMP
          WHERE id = $${paramIndex}
          RETURNING *
        `;

        const result = await client.query(sqlQuery, values);

        if (result.rows.length === 0) {
          const response: ApiResponse = {
            success: false,
            error: { message: 'Médico no encontrado' }
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
        console.error('❌ PostgreSQL error updating medico:', dbError);
        
        if (dbError.code === '23505') { // Unique violation
          const response: ApiResponse = {
            success: false,
            error: { message: 'Ya existe un médico con ese email o cédula' }
          };
          res.status(400).json(response);
          return;
        }
        
        if (dbError.code === '23503') { // Foreign key violation
          const response: ApiResponse = {
            success: false,
            error: { message: 'La especialidad seleccionada no existe' }
          };
          res.status(400).json(response);
          return;
        }
        
        const response: ApiResponse = {
          success: false,
          error: { message: 'No se pudo actualizar el médico. Por favor, verifique los datos e intente nuevamente.' }
        };
        res.status(400).json(response);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('❌ Error updating medico:', error);
      const response: ApiResponse = {
        success: false,
        error: { message: 'No se pudo actualizar el médico. Por favor, verifique los datos e intente nuevamente.' }
      };
      res.status(400).json(response);
    }
  }

  async deleteMedico(req: Request<{ id: string }, ApiResponse>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { id } = req.params;
      const medicoId = parseInt(id);

      if (isNaN(medicoId) || medicoId <= 0) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'ID de médico inválido' }
        };
        res.status(400).json(response);
        return;
      }

      const client = await postgresPool.connect();
      try {
        // Verificar que el médico existe
        const medicoCheck = await client.query(
          'SELECT id, nombres, apellidos, activo FROM medicos WHERE id = $1',
          [medicoId]
        );

        if (medicoCheck.rows.length === 0) {
          const response: ApiResponse = {
            success: false,
            error: { message: 'Médico no encontrado' }
          };
          res.status(404).json(response);
          return;
        }

        const medico = medicoCheck.rows[0];

        const reqUser = (req as { user?: JwtUser }).user;
        if (
          reqUser &&
          reqUser.clinica_id != null &&
          (isOperadorClinicaJwt(reqUser) || reqUser.rol === 'secretaria')
        ) {
          const allowed = await medicoPerteneceAclinicaUsuario(client, medicoId, reqUser.clinica_id);
          if (!allowed) {
            res.status(403).json({ success: false, error: { message: 'No puede eliminar médicos de otra clínica' } });
            return;
          }
        }

        // Verificar si el médico ya está inactivo
        if (!medico.activo) {
          const response: ApiResponse = {
            success: false,
            error: { message: 'El médico ya está inactivo' }
          };
          res.status(400).json(response);
          return;
        }

        // Verificar si el médico tiene pacientes tratados
        const tienePacientesTratados = await this.verificarPacientesTratados(medicoId);

        if (tienePacientesTratados) {
          // Marcar como inactivo en lugar de eliminar
          await this.marcarMedicoComoInactivo(medicoId);
          
          const response: ApiResponse = {
            success: true,
            data: { 
              message: `Médico ${medico.nombres} ${medico.apellidos} marcado como inactivo (tiene pacientes tratados)`,
              accion: 'desactivado'
            }
          };
          res.json(response);
        } else {
          // Eliminación física completa
          await this.eliminarMedicoFisicamente(medicoId);
          
          const response: ApiResponse = {
            success: true,
            data: { 
              message: `Médico ${medico.nombres} ${medico.apellidos} eliminado completamente del sistema`,
              accion: 'eliminado'
            }
          };
          res.json(response);
        }
      } finally {
        client.release();
      }

    } catch (error) {
      console.error('Error eliminando médico:', error);
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(500).json(response);
    }
  }

  /**
   * Verifica si un médico tiene pacientes tratados (solo consultas finalizadas)
   */
  private async verificarPacientesTratados(medicoId: number): Promise<boolean> {
    try {
      const client = await postgresPool.connect();
      try {
        // Verificar consultas FINALIZADAS (estado_consulta = 'finalizada' o tiene fecha_culminacion)
        const consultasResult = await client.query(
          `SELECT id FROM consultas_pacientes 
           WHERE medico_id = $1 
           AND (estado_consulta = 'finalizada' OR estado_consulta = 'completada' OR fecha_culminacion IS NOT NULL)
           LIMIT 1`,
          [medicoId]
        );

        if (consultasResult.rows.length > 0) {
          return true;
        }

        // Verificar historial médico
        const historialResult = await client.query(
          'SELECT id FROM historico_pacientes WHERE medico_id = $1 LIMIT 1',
          [medicoId]
        );

        if (historialResult.rows.length > 0) {
          return true;
        }

        // Verificar informes médicos
        const informesResult = await client.query(
          'SELECT id FROM informes_medicos WHERE medico_id = $1 LIMIT 1',
          [medicoId]
        );

        if (informesResult.rows.length > 0) {
          return true;
        }

        return false;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error en verificarPacientesTratados:', error);
      throw error;
    }
  }

  /**
   * Marca un médico como inactivo
   */
  private async marcarMedicoComoInactivo(medicoId: number): Promise<void> {
    const client = await postgresPool.connect();
    try {
      // Iniciar transacción
      await client.query('BEGIN');

      // Marcar médico como inactivo
      await client.query(
        'UPDATE medicos SET activo = false, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = $1',
        [medicoId]
      );

      // Marcar usuario asociado como inactivo
      await client.query(
        'UPDATE usuarios SET activo = false WHERE medico_id = $1',
        [medicoId]
      );

      // Confirmar transacción
      await client.query('COMMIT');

      console.log(`✅ Médico ${medicoId} marcado como inactivo`);
    } catch (error) {
      // Revertir transacción en caso de error
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('❌ Error al hacer rollback:', rollbackError);
      }
      console.error('Error marcando médico como inactivo:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Elimina físicamente un médico del sistema
   */
  private async eliminarMedicoFisicamente(medicoId: number): Promise<void> {
    const client = await postgresPool.connect();
    try {
      // Iniciar transacción
      await client.query('BEGIN');

      // Eliminar usuario asociado primero (por las foreign keys)
      // La tabla medicos_clinicas se eliminará automáticamente por ON DELETE CASCADE
      await client.query(
        'DELETE FROM usuarios WHERE medico_id = $1',
        [medicoId]
      );

      // Eliminar médico (esto también eliminará medicos_clinicas por CASCADE)
      await client.query(
        'DELETE FROM medicos WHERE id = $1',
        [medicoId]
      );

      // Confirmar transacción
      await client.query('COMMIT');

      console.log(`✅ Médico ${medicoId} eliminado físicamente del sistema`);
    } catch (error) {
      // Revertir transacción en caso de error
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('❌ Error al hacer rollback:', rollbackError);
      }
      console.error('Error eliminando médico físicamente:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Comprueba si el correo puede usarse para un médico nuevo (tabla `medicos` y `usuarios`).
   * Un mismo email no puede estar en dos filas de `usuarios`; si ya existe como admin u otro rol sin `medico_id`, no sirve para crear usuario médico.
   */
  async checkEmailParaMedico(
    req: Request<{}, ApiResponse, {}, { email?: string }>,
    res: Response<ApiResponse>
  ): Promise<void> {
    try {
      const raw = typeof req.query['email'] === 'string' ? req.query['email'].trim() : '';
      if (!raw || !raw.includes('@')) {
        res.status(400).json({ success: false, error: { message: 'Parámetro email válido requerido' } } as ApiResponse);
        return;
      }
      const emailLower = raw.toLowerCase();
      const client = await postgresPool.connect();
      try {
        const med = await client.query(`SELECT id FROM medicos WHERE lower(trim(email)) = $1 LIMIT 1`, [emailLower]);
        const usr = await client.query<{ medico_id: number | null }>(
          `SELECT medico_id FROM usuarios WHERE lower(trim(email)) = $1 LIMIT 1`,
          [emailLower]
        );
        const enMedicos = med.rows.length > 0;
        const u = usr.rows[0];
        const conflictoUsuarioNoMedico = !!u && u.medico_id == null;

        res.json({
          success: true,
          data: {
            enMedicos,
            emailEnUsuarios: !!u,
            usuarioMedicoId: u?.medico_id ?? null,
            conflictoUsuarioNoMedico
          }
        } as ApiResponse);
      } finally {
        client.release();
      }
    } catch (e) {
      res.status(500).json({ success: false, error: { message: (e as Error).message } } as ApiResponse);
    }
  }

  async searchMedicos(req: Request<{}, ApiResponse, {}, { q?: string }>, res: Response<ApiResponse>): Promise<void> {
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

      // Escapar caracteres especiales para la búsqueda
      const searchTerm = q.trim();

      const clinicaAliasFilter = await getClinicaAliasFilterForReq(req);
      const mcJoin = clinicaAliasFilter
        ? `INNER JOIN medicos_clinicas mc ON mc.medico_id = m.id AND mc.clinica_alias = $2`
        : '';

      const client = await postgresPool.connect();
      try {
        let sqlQuery: string;
        const params: any[] = [];
        const searchPattern = `%${searchTerm}%`;

        // Si el término parece un email: igualdad exacta (trim + lower). NO usar %email%: daría
        // falsos positivos (p. ej. "user@gmail.com" coincide dentro de "superuser@gmail.com").
        if (searchTerm.includes('@')) {
          sqlQuery = `
            SELECT m.*, e.nombre_especialidad
            FROM medicos m
            ${mcJoin}
            LEFT JOIN especialidades e ON m.especialidad_id = e.id
            WHERE lower(trim(m.email)) = lower(trim($1))
            ORDER BY m.nombres ASC
          `;
          params.push(searchTerm);
          if (clinicaAliasFilter) params.push(clinicaAliasFilter);
        } else {
          // Para otros términos, buscar en nombres, apellidos y email
          sqlQuery = `
            SELECT m.*, e.nombre_especialidad
            FROM medicos m
            ${mcJoin}
            LEFT JOIN especialidades e ON m.especialidad_id = e.id
            WHERE m.nombres ILIKE $1 
               OR m.apellidos ILIKE $1 
               OR m.email ILIKE $1
            ORDER BY m.nombres ASC
          `;
          params.push(searchPattern);
          if (clinicaAliasFilter) params.push(clinicaAliasFilter);
        }

        const result = await client.query(sqlQuery, params);

        // Combinar médicos con nombres de especialidades
        const medicosWithEspecialidad = result.rows.map(medico => ({
          ...medico,
          especialidad_nombre: medico.nombre_especialidad || 'Especialidad no encontrada'
        }));

        const response: ApiResponse = {
          success: true,
          data: medicosWithEspecialidad
        };
        res.json(response);
      } catch (dbError) {
        console.error('❌ PostgreSQL error in searchMedicos:', dbError);
        const response: ApiResponse = {
          success: false,
          error: { message: 'Error al buscar médicos' }
        };
        res.status(500).json(response);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('❌ Error en searchMedicos:', error);
      const response: ApiResponse = {
        success: false,
        error: { message: (error as Error).message }
      };
      res.status(500).json(response);
    }
  }

  async getMedicosByEspecialidad(req: Request<{ especialidadId: string }, ApiResponse>, res: Response<ApiResponse>): Promise<void> {
    try {
      const { especialidadId } = req.params;
      const id = parseInt(especialidadId);

      if (isNaN(id) || id <= 0) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Invalid especialidad ID' }
        };
        res.status(400).json(response);
        return;
      }

      const clinicaAliasFilter = await getClinicaAliasFilterForReq(req);

      const client = await postgresPool.connect();
      try {
        const mcJoin = clinicaAliasFilter
          ? `INNER JOIN medicos_clinicas mc ON mc.medico_id = m.id AND mc.clinica_alias = $2`
          : '';
        const params = clinicaAliasFilter ? [id, clinicaAliasFilter] : [id];
        const result = await client.query(
          `SELECT m.*, e.nombre_especialidad
           FROM medicos m
           ${mcJoin}
           LEFT JOIN especialidades e ON m.especialidad_id = e.id
           WHERE m.especialidad_id = $1
           ORDER BY m.nombres ASC`,
          params
        );

        const medicos = result.rows.map(medico => ({
          ...medico,
          especialidad_nombre: medico.nombre_especialidad || 'Especialidad no encontrada'
        }));

        const response: ApiResponse = {
          success: true,
          data: medicos
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
}
