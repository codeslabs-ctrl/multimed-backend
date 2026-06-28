import { Request, Response } from 'express';
import informeMedicoService from '../services/informe-medico.service';
import { PDFService } from '../services/pdf.service';
import { EmailService } from '../services/email.service.js';
import { postgresPool } from '../config/database.js';
import { config } from '../config/environment.js';
import { toFechaEmisionVenezuela } from '../utils/fecha-venezuela.js';

export class InformeMedicoController {
  // =====================================================
  // INFORMES MÉDICOS
  // =====================================================

  crearInforme = async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        titulo,
        tipo_informe,
        contenido,
        paciente_id,
        medico_id,
        template_id,
        estado,
        fecha_emision,
        observaciones,
        creado_por,
        clinica_atencion_id
      } = req.body;

      const clinicaAlias = req.clinicaAlias;

      if (!clinicaAlias) {
        res.status(400).json({ success: false, message: 'CLINICA_ALIAS no está configurada' });
        return;
      }

      // creado_por: body, o userId del JWT, o medico_id (FK en BD es usuarios.id; si no hay userId usamos medico_id)
      const usuarioCreador = creado_por ?? (req as any).user?.userId ?? medico_id;
      if (usuarioCreador == null || usuarioCreador === undefined || (typeof usuarioCreador === 'number' && Number.isNaN(usuarioCreador))) {
        res.status(400).json({ success: false, error: { message: 'Falta el campo "creado_por" o no se pudo determinar el usuario creador (medico_id o userId).' } });
        return;
      }

      const informe = await informeMedicoService.crearInforme({
        titulo,
        tipo_informe,
        contenido,
        paciente_id,
        medico_id,
        template_id,
        estado: estado || 'borrador',
        fecha_emision: toFechaEmisionVenezuela(fecha_emision),
        clinica_alias: clinicaAlias,
        clinica_atencion_id: clinica_atencion_id ?? null,
        observaciones,
        creado_por: usuarioCreador
      });

      res.status(201).json({
        success: true,
        message: 'Informe médico creado exitosamente',
        data: informe
      });
    } catch (error: any) {
      console.error('Error en crearInforme:', error);
      const msg = error?.message ?? String(error);
      const isConfigFaltante =
        typeof msg === 'string' && msg.includes('Configuración no encontrada');
      res.status(isConfigFaltante ? 400 : 500).json({
        success: false,
        message: isConfigFaltante ? msg : 'Error creando informe médico',
        error: { message: msg, code: error?.code }
      });
    }
  };

  obtenerInformes = async (req: Request, res: Response): Promise<void> => {
    try {
      const clinicaAlias = req.clinicaAlias;
      const user = (req as any).user;
      const {
        medico_id,
        paciente_id,
        estado,
        tipo_informe,
        fecha_desde,
        fecha_hasta,
        busqueda
      } = req.query;

      if (!clinicaAlias) {
        res.status(400).json({ success: false, message: 'CLINICA_ALIAS no está configurada' });
        return;
      }

      // Si el usuario es médico, solo puede ver sus propios informes
      // Si es administrador o secretaria, puede ver todos o filtrar por medico_id si lo especifica
      let medicoIdFiltro: number | undefined;
      if (user?.rol === 'medico' && user?.medico_id) {
        // Médico solo ve sus propios informes
        medicoIdFiltro = user.medico_id;
      } else if (medico_id) {
        // Administrador o secretaria puede filtrar por medico_id si lo especifica en query
        medicoIdFiltro = parseInt(medico_id as string);
      }
      // Si no es médico y no hay medico_id en query, no se filtra (ve todos)

      const informes = await informeMedicoService.obtenerInformes({
        clinica_alias: clinicaAlias,
        ...(medicoIdFiltro && { medico_id: medicoIdFiltro }),
        ...(paciente_id && { paciente_id: parseInt(paciente_id as string) }),
        ...(estado && { estado: estado as string }),
        ...(tipo_informe && { tipo_informe: tipo_informe as string }),
        ...(fecha_desde && { fecha_desde: fecha_desde as string }),
        ...(fecha_hasta && { fecha_hasta: fecha_hasta as string }),
        ...(busqueda && { busqueda: busqueda as string })
      });

      res.json({
        success: true,
        data: informes,
        total: informes.length
      });
    } catch (error: any) {
      console.error('Error en obtenerInformes:', error);
      res.status(500).json({
        success: false,
        message: 'Error obteniendo informes médicos',
        error: error.message
      });
    }
  };

  obtenerInformePorId = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const informeId = parseInt(id!);
      const clinicaAlias = req.clinicaAlias;

      if (isNaN(informeId)) {
        res.status(400).json({ success: false, message: 'ID de informe inválido' });
        return;
      }

      if (!clinicaAlias) {
        res.status(400).json({ success: false, message: 'CLINICA_ALIAS no está configurada' });
        return;
      }

      const informe = await informeMedicoService.obtenerInformePorId(informeId, clinicaAlias);

      if (!informe) {
        res.status(404).json({ success: false, message: 'Informe médico no encontrado' });
        return;
      }

      res.json({
        success: true,
        data: informe
      });
    } catch (error: any) {
      console.error('Error en obtenerInformePorId:', error);
      res.status(500).json({
        success: false,
        message: 'Error obteniendo informe médico',
        error: error.message
      });
    }
  };

  actualizarInforme = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const informeId = parseInt(id!);
      const actualizaciones = req.body;

      if (isNaN(informeId)) {
        res.status(400).json({ success: false, message: 'ID de informe inválido' });
        return;
      }

      const payload = actualizaciones.fecha_emision !== undefined
        ? { ...actualizaciones, fecha_emision: toFechaEmisionVenezuela(actualizaciones.fecha_emision) }
        : actualizaciones;
      const informe = await informeMedicoService.actualizarInforme(informeId, payload);

      res.json({
        success: true,
        message: 'Informe médico actualizado exitosamente',
        data: informe
      });
    } catch (error: any) {
      console.error('Error en actualizarInforme:', error);
      res.status(500).json({
        success: false,
        message: 'Error actualizando informe médico',
        error: error.message
      });
    }
  };

  eliminarInforme = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const informeId = parseInt(id!);

      if (isNaN(informeId)) {
        res.status(400).json({ success: false, message: 'ID de informe inválido' });
        return;
      }

      await informeMedicoService.eliminarInforme(informeId);

      res.json({
        success: true,
        message: 'Informe médico eliminado exitosamente'
      });
    } catch (error: any) {
      console.error('Error en eliminarInforme:', error);
      res.status(500).json({
        success: false,
        message: 'Error eliminando informe médico',
        error: error.message
      });
    }
  };

  // =====================================================
  // TEMPLATES DE INFORMES
  // =====================================================

  obtenerTemplates = async (req: Request, res: Response): Promise<void> => {
    try {
      const clinicaAlias = req.clinicaAlias;
      const { especialidad_id, tipo_informe, activa } = req.query;

      if (!clinicaAlias) {
        res.status(400).json({ success: false, message: 'CLINICA_ALIAS no está configurada' });
        return;
      }

      const templates = await informeMedicoService.obtenerTemplates({
        clinica_alias: clinicaAlias,
        ...(especialidad_id && { especialidad_id: parseInt(especialidad_id as string) }),
        ...(tipo_informe && { tipo_informe: tipo_informe as string }),
        ...(activa !== undefined && { activa: activa === 'true' })
      });

      res.json({
        success: true,
        data: templates,
        total: templates.length
      });
    } catch (error: any) {
      console.error('Error en obtenerTemplates:', error);
      res.status(500).json({
        success: false,
        message: 'Error obteniendo templates de informes',
        error: error.message
      });
    }
  };

  crearTemplate = async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        nombre,
        descripcion,
        tipo_informe,
        contenido_template,
        especialidad_id,
        activo
      } = req.body;

      const clinicaAlias = req.clinicaAlias;

      if (!clinicaAlias) {
        res.status(400).json({ success: false, message: 'CLINICA_ALIAS no está configurada' });
        return;
      }

      const template = await informeMedicoService.crearTemplate({
        nombre,
        descripcion,
        tipo_informe,
        contenido_template,
        especialidad_id,
        activo: activo !== undefined ? activo : true
      });

      res.status(201).json({
        success: true,
        message: 'Template de informe creado exitosamente',
        data: template
      });
    } catch (error: any) {
      console.error('Error en crearTemplate:', error);
      res.status(500).json({
        success: false,
        message: 'Error creando template de informe',
        error: error.message
      });
    }
  };

  obtenerTemplate = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ success: false, message: 'ID de template requerido' });
        return;
      }
      const templateId = parseInt(id);

      if (isNaN(templateId)) {
        res.status(400).json({ success: false, message: 'ID de template inválido' });
        return;
      }

      const template = await informeMedicoService.obtenerTemplate(templateId);

      res.json({
        success: true,
        data: template
      });
    } catch (error: any) {
      console.error('Error en obtenerTemplate:', error);
      res.status(500).json({
        success: false,
        message: 'Error obteniendo template de informe',
        error: error.message
      });
    }
  };

  actualizarTemplate = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ success: false, message: 'ID de template requerido' });
        return;
      }
      const templateId = parseInt(id);

      if (isNaN(templateId)) {
        res.status(400).json({ success: false, message: 'ID de template inválido' });
        return;
      }

      const {
        nombre,
        descripcion,
        tipo_informe,
        contenido_template,
        especialidad_id,
        activo
      } = req.body;

      const template = await informeMedicoService.actualizarTemplate(templateId, {
        nombre,
        descripcion,
        tipo_informe,
        contenido_template,
        especialidad_id,
        activo: activo !== undefined ? activo : true
      });

      res.json({
        success: true,
        message: 'Template de informe actualizado exitosamente',
        data: template
      });
    } catch (error: any) {
      console.error('Error en actualizarTemplate:', error);
      res.status(500).json({
        success: false,
        message: 'Error actualizando template de informe',
        error: error.message
      });
    }
  };

  eliminarTemplate = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ success: false, message: 'ID de template requerido' });
        return;
      }
      const templateId = parseInt(id);

      if (isNaN(templateId)) {
        res.status(400).json({ success: false, message: 'ID de template inválido' });
        return;
      }

      await informeMedicoService.eliminarTemplate(templateId);

      res.json({
        success: true,
        message: 'Template de informe eliminado exitosamente'
      });
    } catch (error: any) {
      console.error('Error en eliminarTemplate:', error);
      res.status(500).json({
        success: false,
        message: 'Error eliminando template de informe',
        error: error.message
      });
    }
  };

  // =====================================================
  // ANEXOS
  // =====================================================

  obtenerAnexosPorInforme = async (req: Request, res: Response): Promise<void> => {
    try {
      const { informeId } = req.params;
      const id = parseInt(informeId!);

      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'ID de informe inválido' });
        return;
      }

      const anexos = await informeMedicoService.obtenerAnexosPorInforme(id);

      res.json({
        success: true,
        data: anexos,
        total: anexos.length
      });
    } catch (error: any) {
      console.error('Error en obtenerAnexosPorInforme:', error);
      res.status(500).json({
        success: false,
        message: 'Error obteniendo anexos del informe',
        error: error.message
      });
    }
  };

  agregarAnexo = async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        informe_id,
        nombre_archivo,
        tipo_archivo,
        tamaño_archivo,
        ruta_archivo,
        descripcion
      } = req.body;

      const anexo = await informeMedicoService.agregarAnexo({
        informe_id,
        nombre_archivo,
        tipo_archivo,
        tamaño_archivo,
        ruta_archivo,
        descripcion
      });

      res.status(201).json({
        success: true,
        message: 'Anexo agregado exitosamente',
        data: anexo
      });
    } catch (error: any) {
      console.error('Error en agregarAnexo:', error);
      res.status(500).json({
        success: false,
        message: 'Error agregando anexo al informe',
        error: error.message
      });
    }
  };

  eliminarAnexo = async (req: Request, res: Response): Promise<void> => {
    try {
      const { anexoId } = req.params;
      const id = parseInt(anexoId!);

      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'ID de anexo inválido' });
        return;
      }

      await informeMedicoService.eliminarAnexo(id);

      res.json({
        success: true,
        message: 'Anexo eliminado exitosamente'
      });
    } catch (error: any) {
      console.error('Error en eliminarAnexo:', error);
      res.status(500).json({
        success: false,
        message: 'Error eliminando anexo del informe',
        error: error.message
      });
    }
  };

  // =====================================================
  // ENVÍOS
  // =====================================================

  obtenerEnviosPorInforme = async (req: Request, res: Response): Promise<void> => {
    try {
      const { informeId } = req.params;
      const id = parseInt(informeId!);

      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'ID de informe inválido' });
        return;
      }

      const envios = await informeMedicoService.obtenerEnviosPorInforme(id);

      res.json({
        success: true,
        data: envios,
        total: envios.length
      });
    } catch (error: any) {
      console.error('Error en obtenerEnviosPorInforme:', error);
      res.status(500).json({
        success: false,
        message: 'Error obteniendo envíos del informe',
        error: error.message
      });
    }
  };

  enviarInforme = async (req: Request, res: Response): Promise<void> => {
    try {
      console.log('📧 [enviarInforme] Inicio handler');
      console.log('📧 [enviarInforme] Headers:', req.headers);
      // Permitir tanto envío con body (flujo antiguo) como solo por :informeId
      const { informeId: informeIdParam, id: idParam } = req.params as any;
      const bodyInformeId = req.body?.informe_id;
      console.log('📧 [enviarInforme] params/body:', { params: req.params, body: req.body });
      const informeId = Number(informeIdParam ?? idParam ?? bodyInformeId);

      if (!Number.isFinite(informeId) || informeId <= 0) {
        console.warn('⚠️ [enviarInforme] ID inválido:', { informeIdParam, idParam, bodyInformeId, parsed: informeId });
        res.status(400).json({ success: false, message: 'ID de informe inválido' });
        return;
      }

      console.log('📧 [enviarInforme] ID válido:', informeId);
      // Obtener informe
      const clinicaAlias = req.clinicaAlias;
      if (!clinicaAlias) {
        res.status(400).json({ success: false, message: 'CLINICA_ALIAS no está configurada' });
        return;
      }
      const informe = await informeMedicoService.obtenerInformePorId(informeId, clinicaAlias);
      console.log('📧 [enviarInforme] Informe obtenido:', !!informe, informe ? { id: informe.id, numero: informe.numero_informe } : null);
      if (!informe) {
        res.status(404).json({ success: false, message: 'Informe no encontrado' });
        return;
      }

      // Obtener datos del paciente (email y nombre) (PostgreSQL)
      const pacienteId = informe.paciente_id;
      console.log('📧 [enviarInforme] Buscando paciente:', pacienteId);
      const pacienteClient = await postgresPool.connect();
      let paciente: any;
      try {
        const pacienteResult = await pacienteClient.query(
          'SELECT email, nombres, apellidos FROM pacientes WHERE id = $1 LIMIT 1',
          [pacienteId]
        );

        if (pacienteResult.rows.length === 0 || !pacienteResult.rows[0]?.email) {
          console.warn('⚠️ [enviarInforme] Paciente sin email o no encontrado');
          res.status(400).json({ success: false, message: 'Paciente sin email registrado' });
          return;
        }

        paciente = pacienteResult.rows[0];
      } finally {
        pacienteClient.release();
      }

      // Generar PDF con el servicio existente
      const pdfService = new PDFService();
      console.log('📧 [enviarInforme] Generando PDF...');
      const pdfBuffer = await pdfService.generarPDFInforme(informeId);
      console.log('📧 [enviarInforme] PDF generado. Bytes:', pdfBuffer?.length);

      // Preparar correo: fecha_emision ya se guarda en zona Venezuela, solo formatear para mostrar
      const emailService = new EmailService();
      const fechaEmision = new Date(informe.fecha_emision).toLocaleDateString('es-ES');
      const clinicaNombre = config.sistema.clinicaNombre || 'Clínica';
      const template = emailService.getInformePacienteTemplate();

      console.log('📧 [enviarInforme] Enviando email (template) a:', paciente.email);
      const enviado = await emailService.sendTemplateEmail(
        paciente.email,
        template,
        {
          pacienteNombre: `${paciente.nombres} ${paciente.apellidos}`,
          numero_informe: informe.numero_informe,
          fecha_emision: fechaEmision,
          clinicaNombre
        },
        {
          attachments: [
            {
              filename: `informe-${informe.numero_informe}.pdf`,
              content: pdfBuffer,
              contentType: 'application/pdf'
            }
          ]
        }
      );

      if (!enviado) {
        console.error('❌ [enviarInforme] Falló el envío de email');
        res.status(500).json({ success: false, message: 'No se pudo enviar el email' });
        return;
      }

      // Registrar envío (si existe bitácora) y actualizar estado del informe a 'enviado'
      try {
        console.log('📧 [enviarInforme] Actualizando estado del informe a enviado');
        const fechaEnvio = new Date().toISOString();
        await informeMedicoService.actualizarInforme(informeId, { 
          estado: 'enviado',
          fecha_envio: fechaEnvio
        });
      } catch (e) {
        console.warn('No se pudo actualizar estado del informe a enviado:', e);
      }

      console.log('✅ [enviarInforme] Proceso completado OK');
      res.status(201).json({
        success: true,
        message: 'Informe enviado por email exitosamente',
      });
    } catch (error: any) {
      console.error('❌ [enviarInforme] Error:', error);
      res.status(500).json({
        success: false,
        message: 'Error enviando informe',
        error: error.message
      });
    }
  };

  // =====================================================
  // FIRMA DIGITAL
  // =====================================================

  firmarInforme = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const informeId = parseInt(id!);
      const { certificado_digital } = req.body;
      const medicoId = (req as any).user?.medico_id;
      const clinicaAlias = req.clinicaAlias;

      if (isNaN(informeId)) {
        res.status(400).json({ success: false, message: 'ID de informe inválido' });
        return;
      }

      if (!clinicaAlias) {
        res.status(400).json({ success: false, message: 'CLINICA_ALIAS no está configurada' });
        return;
      }

      if (!medicoId) {
        res.status(400).json({ success: false, message: 'ID de médico no encontrado' });
        return;
      }

      if (!certificado_digital) {
        res.status(400).json({ success: false, message: 'Certificado digital requerido' });
        return;
      }

      const ipFirma = req.ip || req.connection.remoteAddress;
      const userAgent = req.get('User-Agent');

      await informeMedicoService.firmarInforme(
        informeId,
        medicoId,
        certificado_digital,
        clinicaAlias,
        ipFirma,
        userAgent
      );

      res.json({
        success: true,
        message: 'Informe firmado digitalmente exitosamente'
      });
    } catch (error: any) {
      console.error('Error en firmarInforme:', error);
      res.status(500).json({
        success: false,
        message: 'Error firmando informe digitalmente',
        error: error.message
      });
    }
  };

  verificarFirmaDigital = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const informeId = parseInt(id!);

      if (isNaN(informeId)) {
        res.status(400).json({ success: false, message: 'ID de informe inválido' });
        return;
      }

      const verificacion = await informeMedicoService.verificarFirmaDigital(informeId);

      res.json({
        success: true,
        data: verificacion
      });
    } catch (error: any) {
      console.error('Error en verificarFirmaDigital:', error);
      res.status(500).json({
        success: false,
        message: 'Error verificando firma digital',
        error: error.message
      });
    }
  };

  // =====================================================
  // ESTADÍSTICAS
  // =====================================================

  obtenerEstadisticas = async (req: Request, res: Response): Promise<void> => {
    try {
      const clinicaAlias = req.clinicaAlias;

      if (!clinicaAlias) {
        res.status(400).json({ success: false, message: 'CLINICA_ALIAS no está configurada' });
        return;
      }

      const estadisticas = await informeMedicoService.obtenerEstadisticas(clinicaAlias);

      res.json({
        success: true,
        data: estadisticas
      });
    } catch (error: any) {
      console.error('Error en obtenerEstadisticas:', error);
      res.status(500).json({
        success: false,
        message: 'Error obteniendo estadísticas de informes',
        error: error.message
      });
    }
  };

  obtenerEstadisticasPorMedico = async (req: Request, res: Response): Promise<void> => {
    try {
      const clinicaAlias = req.clinicaAlias;
      const { medico_id } = req.query;

      if (!clinicaAlias) {
        res.status(400).json({ success: false, message: 'CLINICA_ALIAS no está configurada' });
        return;
      }

      if (!medico_id) {
        res.status(400).json({ success: false, message: 'medico_id es requerido' });
        return;
      }

      const estadisticas = await informeMedicoService.obtenerEstadisticasPorMedico(clinicaAlias, parseInt(medico_id as string));

      res.json({
        success: true,
        data: estadisticas
      });
    } catch (error: any) {
      console.error('Error en obtenerEstadisticasPorMedico:', error);
      res.status(500).json({
        success: false,
        message: 'Error obteniendo estadísticas del médico',
        error: error.message
      });
    }
  };

  obtenerEstadisticasTodosMedicos = async (req: Request, res: Response): Promise<void> => {
    try {
      const clinicaAlias = req.clinicaAlias;

      if (!clinicaAlias) {
        res.status(400).json({ success: false, message: 'CLINICA_ALIAS no está configurada' });
        return;
      }

      const estadisticas = await informeMedicoService.obtenerEstadisticasTodosMedicos(clinicaAlias);

      res.json({
        success: true,
        data: estadisticas
      });
    } catch (error: any) {
      console.error('Error en obtenerEstadisticasTodosMedicos:', error);
      res.status(500).json({
        success: false,
        message: 'Error obteniendo estadísticas de todos los médicos',
        error: error.message
      });
    }
  };
}

export default new InformeMedicoController();
