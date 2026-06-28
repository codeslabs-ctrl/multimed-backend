import { postgresPool } from '../config/database.js';

export interface InformeMedico {
  id?: number;
  numero_informe: string;
  titulo: string;
  tipo_informe: string;
  contenido: string;
  paciente_id: number;
  medico_id: number;
  template_id?: number;
  estado: 'borrador' | 'finalizado' | 'firmado' | 'enviado';
  fecha_emision: Date;
  fecha_creacion: Date;
  fecha_actualizacion: Date;
  fecha_envio?: Date | string;
  clinica_alias: string;
  clinica_atencion_id?: number | null;
  observaciones?: string;
  numero_secuencial?: number;
  creado_por: number;
}

export interface TemplateInforme {
  id?: number;
  nombre: string;
  descripcion: string;
  tipo_informe: string;
  contenido_template: string;
  especialidad_id?: number;
  activo: boolean;
  fecha_creacion: Date;
  clinica_alias: string;
}

export interface AnexoInforme {
  id?: number;
  informe_id: number;
  nombre_archivo: string;
  tipo_archivo: string;
  tamaño_archivo: number;
  ruta_archivo: string;
  fecha_subida: Date;
  descripcion?: string;
}

export interface EnvioInforme {
  id?: number;
  informe_id: number;
  paciente_id: number;
  metodo_envio: 'email' | 'sms' | 'whatsapp' | 'presencial';
  estado_envio: 'pendiente' | 'enviado' | 'fallido' | 'entregado';
  fecha_envio: Date;
  fecha_entrega?: Date;
  observaciones?: string;
  destinatario: string;
}

export class InformeMedicoService {
  // =====================================================
  // INFORMES MÉDICOS
  // =====================================================

  /**
   * Limpia el contenido antes de guardar en BD: quita bloques de firma y nombre del médico al final.
   * El nombre del médico ya se muestra en el bloque de firma del PDF, no debe persistirse en contenido.
   */
  private limpiarContenidoParaGuardar(contenido: string | undefined): string {
    if (!contenido || typeof contenido !== 'string') return contenido ?? '';
    let out = contenido;
    // Bloques de firma (el frontend los añade al guardar; no los persistimos)
    out = out.replace(/<div[^>]*class="[^"]*firma-sistema[^"]*"[^>]*>[\s\S]*?<\/div>\s*/gi, '');
    out = out.replace(/<div[^>]*class="[^"]*firma-personalizada[^"]*"[^>]*>[\s\S]*?<\/div>\s*/gi, '');
    out = out.replace(/<div[^>]*class="[^"]*firma-medica[^"]*"[^>]*>[\s\S]*?<\/div>\s*/gi, '');
    out = out.replace(/<p[^>]*>\s*Firma Digital del Sistema\s*<\/p>/gi, '');
    out = out.replace(/<p[^>]*>\s*Documento generado electrónicamente\s*<\/p>/gi, '');
    out = out.replace(/<p[^>]*>\s*Fecha:\s*[^<]*<\/p>/gi, '');
    // Nombre del médico al final (párrafo suelto o al final de un párrafo)
    out = out.replace(/\s*<p[^>]*>\s*(<strong>\s*)?Dr\.\s+[\w\sáéíóúñÁÉÍÓÚÑ]+(\s*<\/strong>)?\s*<\/p>\s*$/gi, '');
    out = out.replace(/([."])\s*Dr\.\s+[\w\sáéíóúñÁÉÍÓÚÑ]+\s*<\/p>/gi, '$1</p>');
    return out.trim();
  }

  async crearInforme(informe: Omit<InformeMedico, 'id' | 'fecha_creacion' | 'fecha_actualizacion' | 'numero_informe' | 'numero_secuencial'>): Promise<InformeMedico> {
    const maxIntentos = 3;
    const client = await postgresPool.connect();
    
    try {
      for (let intentos = 0; intentos < maxIntentos; intentos++) {
        try {
          console.log(`🔄 Creando informe (intento ${intentos + 1}/${maxIntentos})`);
          
          await client.query('BEGIN');
          
          // Obtener el siguiente número secuencial
          const configResult = await client.query(
            'SELECT * FROM configuracion_informes WHERE clinica_alias = $1',
            [informe.clinica_alias]
          );

          if (configResult.rows.length === 0) {
            throw new Error(`Configuración no encontrada para clínica: ${informe.clinica_alias}. Por favor, crea un registro en la tabla configuracion_informes para esta clínica.`);
          }

          const config = configResult.rows[0];

          // Generar número de informe
          const numeroSecuencial = (config.contador_actual || 0) + 1;
          const numeroInforme = `${config.prefijo_numero || 'INF'}-${numeroSecuencial.toString().padStart(6, '0')}`;
          
          console.log(`📋 Generando número de informe: ${numeroInforme} (secuencial: ${numeroSecuencial})`);

          // ACTUALIZAR CONFIGURACIÓN ANTES de insertar (para evitar duplicados)
          await client.query(
            'UPDATE configuracion_informes SET contador_actual = $1 WHERE clinica_alias = $2',
            [numeroSecuencial, informe.clinica_alias]
          );

          console.log(`✅ Configuración actualizada: contador_actual = ${numeroSecuencial}`);

          // Crear el informe (contenido sin firma ni nombre del médico; el PDF los añade en su bloque de firma)
          const contenidoLimpio = this.limpiarContenidoParaGuardar(informe.contenido);
          const insertResult = await client.query(
            `INSERT INTO informes_medicos (
              numero_informe, titulo, tipo_informe, contenido, paciente_id, medico_id, 
              template_id, estado, fecha_emision, clinica_alias, clinica_atencion_id, observaciones, creado_por
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *`,
            [
              numeroInforme,
              informe.titulo,
              informe.tipo_informe,
              contenidoLimpio,
              informe.paciente_id,
              informe.medico_id,
              informe.template_id || null,
              informe.estado,
              informe.fecha_emision,
              informe.clinica_alias,
              informe.clinica_atencion_id ?? null,
              informe.observaciones || null,
              informe.creado_por || informe.medico_id
            ]
          );

          await client.query('COMMIT');

          console.log(`✅ Informe creado exitosamente: ${numeroInforme}`);
          return insertResult.rows[0];
          
        } catch (error: any) {
          await client.query('ROLLBACK');
          console.error(`❌ Error en crearInforme (intento ${intentos + 1}):`, error);
          
          // Verificar si es error de clave duplicada
          if (error.code === '23505' && error.message.includes('numero_informe')) {
            console.log(`⚠️ Número de informe duplicado. Reintentando...`);
            
            // Si es el último intento, lanzar error
            if (intentos >= maxIntentos - 1) {
              throw new Error(`Error creando informe: ${error.message}`);
            }
            
            // Esperar un poco antes de reintentar (backoff exponencial)
            const delay = 100 * Math.pow(2, intentos); // 100ms, 200ms, 400ms
            console.log(`⏳ Esperando ${delay}ms antes del siguiente intento...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw error;
        }
      }
      
      // Si llegamos aquí, agotamos todos los intentos
      throw new Error('No se pudo crear el informe después de múltiples intentos');
    } finally {
      client.release();
    }
  }

  async obtenerInformes(filtros: {
    clinica_alias: string;
    medico_id?: number;
    paciente_id?: number;
    estado?: string;
    tipo_informe?: string;
    fecha_desde?: string;
    fecha_hasta?: string;
    busqueda?: string;
  }): Promise<InformeMedico[]> {
    try {
      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
        let sqlQuery = `
          SELECT 
            im.*,
            json_build_object(
              'id', p.id,
              'nombres', p.nombres,
              'apellidos', p.apellidos,
              'cedula', p.cedula
            ) as pacientes,
            json_build_object(
              'id', m.id,
              'nombres', m.nombres,
              'apellidos', m.apellidos,
              'especialidad_id', m.especialidad_id
            ) as medicos,
            json_build_object(
              'id', t.id,
              'nombre', t.nombre,
              'descripcion', t.descripcion
            ) as templates_informes
          FROM informes_medicos im
          LEFT JOIN pacientes p ON im.paciente_id = p.id
          LEFT JOIN medicos m ON im.medico_id = m.id
          LEFT JOIN templates_informes t ON im.template_id = t.id
          WHERE im.clinica_alias = $1
        `;
        
        const params: any[] = [filtros.clinica_alias];
        let paramIndex = 2;

        // Aplicar filtros
        if (filtros.medico_id) {
          sqlQuery += ` AND im.medico_id = $${paramIndex}`;
          params.push(filtros.medico_id);
          paramIndex++;
        }
        if (filtros.paciente_id) {
          sqlQuery += ` AND im.paciente_id = $${paramIndex}`;
          params.push(filtros.paciente_id);
          paramIndex++;
        }
        if (filtros.estado) {
          sqlQuery += ` AND im.estado = $${paramIndex}`;
          params.push(filtros.estado);
          paramIndex++;
        }
        if (filtros.tipo_informe) {
          sqlQuery += ` AND im.tipo_informe = $${paramIndex}`;
          params.push(filtros.tipo_informe);
          paramIndex++;
        }
        if (filtros.fecha_desde) {
          sqlQuery += ` AND im.fecha_emision >= $${paramIndex}`;
          params.push(filtros.fecha_desde);
          paramIndex++;
        }
        if (filtros.fecha_hasta) {
          sqlQuery += ` AND im.fecha_emision <= $${paramIndex}`;
          params.push(filtros.fecha_hasta);
          paramIndex++;
        }
        if (filtros.busqueda) {
          sqlQuery += ` AND (im.titulo ILIKE $${paramIndex} OR im.numero_informe ILIKE $${paramIndex})`;
          params.push(`%${filtros.busqueda}%`);
          paramIndex++;
        }

        sqlQuery += ` ORDER BY im.fecha_creacion DESC`;

        const result = await client.query(sqlQuery, params);
        
        // Transformar los resultados para que coincidan con el formato esperado
        return result.rows.map((row: any) => ({
          ...row,
          pacientes: row.pacientes,
          medicos: row.medicos,
          templates_informes: row.templates_informes
        }));
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error en obtenerInformes:', error);
      throw error;
    }
  }

  async obtenerInformePorId(id: number, clinicaAlias?: string): Promise<InformeMedico | null> {
    const client = await postgresPool.connect();
    try {
      let query = `
        SELECT 
          im.*,
          json_build_object(
            'id', p.id,
            'nombres', p.nombres,
            'apellidos', p.apellidos,
            'cedula', p.cedula,
            'email', p.email,
            'telefono', p.telefono
          ) as pacientes,
          json_build_object(
            'id', m.id,
            'nombres', m.nombres,
            'apellidos', m.apellidos,
            'especialidad_id', m.especialidad_id
          ) as medicos,
          json_build_object(
            'id', t.id,
            'nombre', t.nombre,
            'descripcion', t.descripcion,
            'contenido_template', t.contenido_template
          ) as templates_informes
        FROM informes_medicos im
        LEFT JOIN pacientes p ON im.paciente_id = p.id
        LEFT JOIN medicos m ON im.medico_id = m.id
        LEFT JOIN templates_informes t ON im.template_id = t.id
        WHERE im.id = $1
      `;
      
      const params: any[] = [id];
      
      // Si se proporciona clinica_alias, agregar filtro
      if (clinicaAlias) {
        query += ` AND im.clinica_alias = $2`;
        params.push(clinicaAlias);
      }
      
      const result = await client.query(query, params);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      console.error('Error en obtenerInformePorId:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async actualizarInforme(id: number, informe: Partial<InformeMedico>): Promise<InformeMedico> {
    const client = await postgresPool.connect();
    try {
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      Object.keys(informe).forEach(key => {
        if (key !== 'id' && key !== 'fecha_creacion' && informe[key as keyof InformeMedico] !== undefined) {
          updateFields.push(`${key} = $${paramIndex}`);
          const value = key === 'contenido'
            ? this.limpiarContenidoParaGuardar(informe.contenido)
            : informe[key as keyof InformeMedico];
          values.push(value);
          paramIndex++;
        }
      });

      updateFields.push(`fecha_actualizacion = $${paramIndex}`);
      values.push(new Date().toISOString());
      paramIndex++;

      values.push(id);

      const result = await client.query(
        `UPDATE informes_medicos SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        throw new Error('Informe no encontrado');
      }

      return result.rows[0];
    } catch (error) {
      console.error('Error en actualizarInforme:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async eliminarInforme(id: number): Promise<boolean> {
    const client = await postgresPool.connect();
    try {
      const result = await client.query(
        'DELETE FROM informes_medicos WHERE id = $1',
        [id]
      );

      return result.rowCount !== null && result.rowCount > 0;
    } catch (error) {
      console.error('Error en eliminarInforme:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // =====================================================
  // TEMPLATES DE INFORMES
  // =====================================================

  async obtenerTemplates(filtros: {
    clinica_alias: string;
    especialidad_id?: number;
    tipo_informe?: string;
    activo?: boolean;
  }): Promise<TemplateInforme[]> {
    const client = await postgresPool.connect();
    try {
      let sqlQuery = 'SELECT * FROM templates_informes WHERE clinica_alias = $1';
      const params: any[] = [filtros.clinica_alias];
      let paramIndex = 2;

      if (filtros.especialidad_id) {
        sqlQuery += ` AND especialidad_id = $${paramIndex}`;
        params.push(filtros.especialidad_id);
        paramIndex++;
      }
      if (filtros.tipo_informe) {
        sqlQuery += ` AND tipo_informe = $${paramIndex}`;
        params.push(filtros.tipo_informe);
        paramIndex++;
      }
      if (filtros.activo !== undefined) {
        sqlQuery += ` AND activo = $${paramIndex}`;
        params.push(filtros.activo);
        paramIndex++;
      }

      sqlQuery += ' ORDER BY nombre';

      const result = await client.query(sqlQuery, params);

      return result.rows || [];
    } catch (error) {
      console.error('Error en obtenerTemplates:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async crearTemplate(template: Omit<TemplateInforme, 'id' | 'fecha_creacion' | 'clinica_alias'>): Promise<TemplateInforme> {
    const client = await postgresPool.connect();
    try {
      const clinicaAlias = process.env['CLINICA_ALIAS'] || 'femimed';
      
      const result = await client.query(
        `INSERT INTO templates_informes (nombre, descripcion, tipo_informe, contenido_template, especialidad_id, activo, clinica_alias)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          template.nombre,
          template.descripcion,
          template.tipo_informe,
          template.contenido_template,
          template.especialidad_id || null,
          template.activo,
          clinicaAlias
        ]
      );

      return result.rows[0];
    } catch (error) {
      console.error('Error en crearTemplate:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async obtenerTemplate(id: number): Promise<TemplateInforme> {
    const client = await postgresPool.connect();
    try {
      const clinicaAlias = process.env['CLINICA_ALIAS'] || 'femimed';
      
      const result = await client.query(
        'SELECT * FROM templates_informes WHERE id = $1 AND clinica_alias = $2',
        [id, clinicaAlias]
      );

      if (result.rows.length === 0) {
        throw new Error('Template no encontrado');
      }

      return result.rows[0];
    } catch (error) {
      console.error('Error en obtenerTemplate:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async actualizarTemplate(id: number, template: Omit<TemplateInforme, 'id' | 'fecha_creacion' | 'clinica_alias'>): Promise<TemplateInforme> {
    const client = await postgresPool.connect();
    try {
      const clinicaAlias = process.env['CLINICA_ALIAS'] || 'femimed';
      
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (template.nombre !== undefined) {
        updateFields.push(`nombre = $${paramIndex}`);
        values.push(template.nombre);
        paramIndex++;
      }
      if (template.descripcion !== undefined) {
        updateFields.push(`descripcion = $${paramIndex}`);
        values.push(template.descripcion);
        paramIndex++;
      }
      if (template.tipo_informe !== undefined) {
        updateFields.push(`tipo_informe = $${paramIndex}`);
        values.push(template.tipo_informe);
        paramIndex++;
      }
      if (template.contenido_template !== undefined) {
        updateFields.push(`contenido_template = $${paramIndex}`);
        values.push(template.contenido_template);
        paramIndex++;
      }
      if (template.especialidad_id !== undefined) {
        updateFields.push(`especialidad_id = $${paramIndex}`);
        values.push(template.especialidad_id);
        paramIndex++;
      }
      if (template.activo !== undefined) {
        updateFields.push(`activo = $${paramIndex}`);
        values.push(template.activo);
        paramIndex++;
      }

      if (updateFields.length === 0) {
        throw new Error('No hay campos para actualizar');
      }

      values.push(id, clinicaAlias);

      const result = await client.query(
        `UPDATE templates_informes SET ${updateFields.join(', ')} WHERE id = $${paramIndex} AND clinica_alias = $${paramIndex + 1} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        throw new Error('Template no encontrado');
      }

      return result.rows[0];
    } catch (error) {
      console.error('Error en actualizarTemplate:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async eliminarTemplate(id: number): Promise<boolean> {
    const client = await postgresPool.connect();
    try {
      const clinicaAlias = process.env['CLINICA_ALIAS'] || 'femimed';
      
      const result = await client.query(
        'DELETE FROM templates_informes WHERE id = $1 AND clinica_alias = $2',
        [id, clinicaAlias]
      );

      return result.rowCount !== null && result.rowCount > 0;
    } catch (error) {
      console.error('Error en eliminarTemplate:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // =====================================================
  // ANEXOS
  // =====================================================

  async obtenerAnexosPorInforme(informeId: number): Promise<AnexoInforme[]> {
    const client = await postgresPool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM anexos_informes WHERE informe_id = $1 ORDER BY fecha_subida DESC',
        [informeId]
      );

      return result.rows || [];
    } catch (error) {
      console.error('Error en obtenerAnexosPorInforme:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async agregarAnexo(anexo: Omit<AnexoInforme, 'id' | 'fecha_subida'>): Promise<AnexoInforme> {
    const client = await postgresPool.connect();
    try {
      const result = await client.query(
        `INSERT INTO anexos_informes (informe_id, nombre_archivo, tipo_archivo, tamaño_archivo, ruta_archivo, descripcion)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          anexo.informe_id,
          anexo.nombre_archivo,
          anexo.tipo_archivo,
          anexo.tamaño_archivo,
          anexo.ruta_archivo,
          anexo.descripcion || null
        ]
      );

      return result.rows[0];
    } catch (error) {
      console.error('Error en agregarAnexo:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async eliminarAnexo(id: number): Promise<boolean> {
    const client = await postgresPool.connect();
    try {
      const result = await client.query(
        'DELETE FROM anexos_informes WHERE id = $1',
        [id]
      );

      return result.rowCount !== null && result.rowCount > 0;
    } catch (error) {
      console.error('Error en eliminarAnexo:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // =====================================================
  // ENVÍOS
  // =====================================================

  async obtenerEnviosPorInforme(informeId: number): Promise<EnvioInforme[]> {
    const client = await postgresPool.connect();
    try {
      const result = await client.query(`
        SELECT 
          e.*,
          json_build_object(
            'id', p.id,
            'nombres', p.nombres,
            'apellidos', p.apellidos,
            'email', p.email,
            'telefono', p.telefono
          ) as pacientes
        FROM envios_informes e
        LEFT JOIN pacientes p ON e.paciente_id = p.id
        WHERE e.informe_id = $1
        ORDER BY e.fecha_envio DESC
      `, [informeId]);

      return result.rows || [];
    } catch (error) {
      console.error('Error en obtenerEnviosPorInforme:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async enviarInforme(envio: Omit<EnvioInforme, 'id' | 'fecha_envio'>): Promise<EnvioInforme> {
    const client = await postgresPool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO envios_informes (informe_id, paciente_id, metodo_envio, estado_envio, fecha_entrega, observaciones, destinatario)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          envio.informe_id,
          envio.paciente_id,
          envio.metodo_envio,
          envio.estado_envio,
          envio.fecha_entrega || null,
          envio.observaciones || null,
          envio.destinatario
        ]
      );

      // Actualizar estado del informe
      await client.query(
        'UPDATE informes_medicos SET estado = $1 WHERE id = $2',
        ['enviado', envio.informe_id]
      );

      await client.query('COMMIT');

      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error en enviarInforme:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // =====================================================
  // FIRMA DIGITAL
  // =====================================================

  async firmarInforme(informeId: number, medicoId: number, certificadoDigital: string, clinicaAlias?: string, ipFirma?: string, userAgent?: string): Promise<boolean> {
    const client = await postgresPool.connect();
    try {
      await client.query('BEGIN');

      // Obtener contenido del informe
      const informe = await this.obtenerInformePorId(informeId, clinicaAlias);
      if (!informe) {
        throw new Error('Informe no encontrado');
      }

      // Generar hash del documento
      const crypto = require('crypto');
      const hashDocumento = crypto.createHash('sha256').update(informe.contenido).digest('hex');

      // Insertar firma digital
      await client.query(
        `INSERT INTO firmas_digitales (informe_id, medico_id, firma_hash, certificado_digital, ip_firma, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          informeId,
          medicoId,
          hashDocumento,
          certificadoDigital,
          ipFirma || null,
          userAgent || null
        ]
      );

      // Actualizar estado del informe
      await client.query(
        'UPDATE informes_medicos SET estado = $1 WHERE id = $2',
        ['firmado', informeId]
      );

      await client.query('COMMIT');

      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error en firmarInforme:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async verificarFirmaDigital(informeId: number): Promise<{
    valida: boolean;
    firma_hash: string;
    fecha_firma: Date;
    certificado_digital: string;
  }> {
    const client = await postgresPool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM verificar_firma_digital_actual($1)',
        [informeId]
      );

      return result.rows[0] || { valida: false, firma_hash: '', fecha_firma: new Date(), certificado_digital: '' };
    } catch (error) {
      console.error('Error en verificarFirmaDigital:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // =====================================================
  // ESTADÍSTICAS
  // =====================================================

  async obtenerEstadisticas(_clinicaAlias: string): Promise<{
    total_informes: number;
    informes_firmados: number;
    informes_sin_firma: number;
    porcentaje_firmados: number;
  }> {
    const client = await postgresPool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM obtener_estadisticas_firmas()'
      );

      return result.rows[0] || { total_informes: 0, informes_firmados: 0, informes_sin_firma: 0, porcentaje_firmados: 0 };
    } catch (error) {
      console.error('Error en obtenerEstadisticas:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async obtenerEstadisticasPorMedico(_clinicaAlias: string, medicoId: number): Promise<{
    medico_id: number;
    medico_nombres: string;
    medico_apellidos: string;
    total_informes: number;
    informes_firmados: number;
    informes_sin_firma: number;
    porcentaje_firmados: number;
  }> {
    const client = await postgresPool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM obtener_estadisticas_medico($1)',
        [medicoId]
      );

      return result.rows[0] || { 
        medico_id: medicoId, 
        medico_nombres: '', 
        medico_apellidos: '', 
        total_informes: 0, 
        informes_firmados: 0, 
        informes_sin_firma: 0, 
        porcentaje_firmados: 0 
      };
    } catch (error) {
      console.error('Error en obtenerEstadisticasPorMedico:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async obtenerEstadisticasTodosMedicos(_clinicaAlias: string): Promise<Array<{
    medico_id: number;
    medico_nombres: string;
    medico_apellidos: string;
    total_informes: number;
    informes_firmados: number;
    informes_sin_firma: number;
    porcentaje_firmados: number;
  }>> {
    const client = await postgresPool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM obtener_estadisticas_todos_medicos()'
      );

      return result.rows || [];
    } catch (error) {
      console.error('Error en obtenerEstadisticasTodosMedicos:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

export default new InformeMedicoService();
