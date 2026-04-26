import express, { Request, Response } from 'express';
import { ApiResponse } from '../../../types/index.js';
import { requireExternalApiKey } from '../../../middleware/external-api-key.js';
import { postgresPool } from '../../../config/database.js';
import { EmailService } from '../../../services/email.service.js';

const router = express.Router();

// API Key para automatización (N8N u otros)
router.use(requireExternalApiKey('EXTERNAL_N8N_API_KEYS'));

// GET /api/v1/external/v1/broadcast/whatsapp
// Obtiene el mensaje más reciente sin enviar para WhatsApp
router.get('/whatsapp', async (_req: Request, res: Response<ApiResponse>) => {
  const client = await postgresPool.connect();
  try {
    // Consultar el mensaje más reciente programado para WhatsApp con destinatarios pendientes
    const result = await client.query(`
      SELECT 
        md.id as mensaje_id,
        md.titulo,
        md.contenido,
        md.canal,
        md.estado,
        md.fecha_programado,
        md.total_destinatarios,
        md.total_enviados,
        md.clinica_alias,
        json_agg(
          json_build_object(
            'id', mdes.id,
            'paciente_id', mdes.paciente_id,
            'telefono', mdes.telefono,
            'email', mdes.email,
            'estado_envio', mdes.estado_envio,
            'nombres', p.nombres,
            'apellidos', p.apellidos
          )
        ) FILTER (WHERE mdes.estado_envio = 'pendiente' AND mdes.telefono IS NOT NULL) as destinatarios
      FROM mensajes_difusion md
      INNER JOIN mensajes_destinatarios mdes ON md.id = mdes.mensaje_id
      LEFT JOIN pacientes p ON mdes.paciente_id = p.id
      WHERE md.canal = 'whatsapp'
        AND md.estado = 'programado'
        AND (md.fecha_programado IS NULL OR md.fecha_programado <= NOW())
        AND md.total_enviados < md.total_destinatarios
        AND mdes.estado_envio = 'pendiente'
        AND mdes.telefono IS NOT NULL
      GROUP BY md.id
      HAVING COUNT(mdes.id) FILTER (WHERE mdes.estado_envio = 'pendiente' AND mdes.telefono IS NOT NULL) > 0
      ORDER BY md.fecha_programado ASC NULLS LAST, md.fecha_creacion ASC
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      res.json({
        success: true,
        data: {
          mensaje: null,
          message: 'No hay mensajes pendientes para enviar por WhatsApp'
        }
      });
      return;
    }

    const mensaje = result.rows[0];
    const destinatarios = mensaje.destinatarios || [];

    // Actualizar estado del mensaje a 'enviando' si tiene destinatarios
    if (destinatarios.length > 0) {
      await client.query(
        `UPDATE mensajes_difusion 
         SET estado = 'enviando' 
         WHERE id = $1 AND estado = 'programado'`,
        [mensaje.mensaje_id]
      );
    }

    res.json({
      success: true,
      data: {
        mensaje_id: mensaje.mensaje_id,
        titulo: mensaje.titulo,
        contenido: mensaje.contenido,
        canal: mensaje.canal,
        clinica_alias: mensaje.clinica_alias,
        destinatarios: destinatarios,
        total_pendientes: destinatarios.length
      }
    });
  } catch (error: any) {
    console.error('Error fetching WhatsApp broadcast:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Error al obtener mensaje para WhatsApp',
        details: error?.message
      }
    });
  } finally {
    client.release();
  }
});

// POST /api/v1/external/v1/broadcast/whatsapp
// Actualiza el estado de envío después de que N8N procese el mensaje
router.post('/whatsapp', async (req: Request, res: Response<ApiResponse>) => {
  const { mensaje_id, destinatario_id, estado_envio, error_mensaje } = req.body;

  if (!mensaje_id || !destinatario_id || !estado_envio) {
    res.status(400).json({
      success: false,
      error: { message: 'mensaje_id, destinatario_id y estado_envio son requeridos' }
    });
    return;
  }

  const client = await postgresPool.connect();
  try {
    await client.query('BEGIN');

    // Actualizar estado del destinatario
    await client.query(
      `UPDATE mensajes_destinatarios
       SET estado_envio = $1, 
           fecha_envio = CASE WHEN $1 = 'enviado' THEN CURRENT_TIMESTAMP ELSE fecha_envio END,
           error_mensaje = $2,
           intentos = intentos + 1
       WHERE id = $3 AND mensaje_id = $4`,
      [estado_envio, error_mensaje || null, destinatario_id, mensaje_id]
    );

    // Actualizar contadores del mensaje
    const statsResult = await client.query(
      `SELECT 
        COUNT(*) FILTER (WHERE estado_envio = 'enviado') as total_enviados,
        COUNT(*) FILTER (WHERE estado_envio = 'fallido') as total_fallidos,
        COUNT(*) as total_destinatarios
       FROM mensajes_destinatarios
       WHERE mensaje_id = $1`,
      [mensaje_id]
    );

    const stats = statsResult.rows[0];
    const totalEnviados = parseInt(stats.total_enviados) || 0;
    const totalFallidos = parseInt(stats.total_fallidos) || 0;
    const totalDestinatarios = parseInt(stats.total_destinatarios) || 0;

    // Determinar nuevo estado del mensaje
    let nuevoEstado = 'enviando';
    if (totalEnviados + totalFallidos >= totalDestinatarios) {
      nuevoEstado = totalEnviados > 0 ? 'enviado' : 'fallido';
    }

    await client.query(
      `UPDATE mensajes_difusion
       SET estado = $1,
           total_enviados = $2,
           total_fallidos = $3,
           fecha_envio = CASE WHEN $1 = 'enviado' THEN CURRENT_TIMESTAMP ELSE fecha_envio END
       WHERE id = $4`,
      [nuevoEstado, totalEnviados, totalFallidos, mensaje_id]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      data: {
        mensaje_id,
        destinatario_id,
        estado_actualizado: estado_envio,
        total_enviados: totalEnviados,
        total_fallidos: totalFallidos,
        estado_mensaje: nuevoEstado
      }
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error updating WhatsApp broadcast status:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Error al actualizar estado de envío',
        details: error?.message
      }
    });
  } finally {
    client.release();
  }
});

// POST /api/v1/external/v1/broadcast/enviar
// Enviar el mensaje más reciente pendiente (busca automáticamente)
router.post('/enviar', async (_req: Request, res: Response<ApiResponse>) => {
  try {
    const client = await postgresPool.connect();
    
    try {
      // 1. Buscar el mensaje más reciente pendiente
      const mensajeResult = await client.query(`
        SELECT md.*
        FROM mensajes_difusion md
        WHERE md.estado IN ('borrador', 'programado')
          AND md.total_destinatarios > 0
          AND md.total_enviados < md.total_destinatarios
          AND (md.fecha_programado IS NULL OR md.fecha_programado <= NOW())
        ORDER BY 
          CASE WHEN md.fecha_programado IS NOT NULL THEN 0 ELSE 1 END,
          md.fecha_programado ASC NULLS LAST,
          md.fecha_creacion ASC
        LIMIT 1
      `);

      if (mensajeResult.rows.length === 0) {
        res.json({
          success: true,
          data: {
            mensaje_id: null,
            message: 'No hay mensajes pendientes para enviar',
            enviados: 0,
            fallidos: 0,
            total: 0
          }
        });
        return;
      }

      const mensaje = mensajeResult.rows[0];
      const mensajeId = mensaje.id;

      // 2. Obtener todos los destinatarios con sus emails y teléfonos
      const destinatariosResult = await client.query(
        `SELECT 
          md.id,
          md.paciente_id,
          md.email,
          md.telefono,
          md.canal,
          md.estado_envio,
          p.nombres,
          p.apellidos,
          p.email as paciente_email,
          p.telefono as paciente_telefono
        FROM mensajes_destinatarios md
        LEFT JOIN pacientes p ON md.paciente_id = p.id
        WHERE md.mensaje_id = $1`,
        [mensajeId]
      );

      if (destinatariosResult.rows.length === 0) {
        res.status(400).json({
          success: false,
          error: { message: 'No hay destinatarios para este mensaje' }
        });
        return;
      }

      const destinatarios = destinatariosResult.rows;

      // 3. Inicializar EmailService
      const emailService = new EmailService();
      let enviados = 0;
      let fallidos = 0;

      // 4. Enviar mensaje a cada destinatario según su canal
      for (const destinatario of destinatarios) {
        if (!destinatario.id) {
          continue;
        }

        const canal = destinatario.canal || mensaje.canal;
        let canalArray: string[] = [];
        
        // Parsear canal si es JSON string
        try {
          if (typeof canal === 'string' && canal.startsWith('[')) {
            canalArray = JSON.parse(canal);
          } else if (typeof canal === 'string') {
            canalArray = [canal];
          } else if (Array.isArray(canal)) {
            canalArray = canal;
          }
        } catch {
          canalArray = ['email']; // Default
        }

        const email = destinatario.email || destinatario.paciente_email;
        const telefono = destinatario.telefono || destinatario.paciente_telefono;

        // Enviar por cada canal configurado
        for (const canalIndividual of canalArray) {
          if (canalIndividual === 'email' && email) {
            try {
              await emailService.sendEmail({
                to: email,
                subject: mensaje.titulo,
                html: mensaje.contenido,
                text: mensaje.contenido.replace(/<[^>]*>/g, '')
              });

              await client.query(
                `UPDATE mensajes_destinatarios
                 SET estado_envio = 'enviado', fecha_envio = CURRENT_TIMESTAMP
                 WHERE id = $1 AND canal = $2`,
                [destinatario.id, canalIndividual]
              );
              enviados++;
            } catch (error: any) {
              console.error(`Error enviando email a ${email}:`, error);
              await client.query(
                `UPDATE mensajes_destinatarios
                 SET estado_envio = 'fallido', error_mensaje = $1
                 WHERE id = $2 AND canal = $3`,
                [error.message || 'Error al enviar email', destinatario.id, canalIndividual]
              );
              fallidos++;
            }
          } else if ((canalIndividual === 'whatsapp' || canalIndividual === 'sms') && telefono) {
            // Para WhatsApp y SMS, solo marcamos como enviando
            // N8N se encargará del envío real
            await client.query(
              `UPDATE mensajes_destinatarios
               SET estado_envio = 'enviando'
               WHERE id = $1 AND canal = $2`,
              [destinatario.id, canalIndividual]
            );
          } else {
            // No tiene el dato necesario para este canal
            await client.query(
              `UPDATE mensajes_destinatarios
               SET estado_envio = 'fallido', error_mensaje = $1
               WHERE id = $2 AND canal = $3`,
              [`No tiene ${canalIndividual === 'email' ? 'email' : 'teléfono'} disponible`, destinatario.id, canalIndividual]
            );
            fallidos++;
          }
        }
      }

      // 5. Actualizar estado del mensaje
      const totalDestinatarios = destinatarios.length;
      let nuevoEstado = 'enviando';
      if (enviados + fallidos >= totalDestinatarios) {
        nuevoEstado = enviados > 0 ? 'enviado' : 'fallido';
      }

      await client.query(
        `UPDATE mensajes_difusion
         SET estado = $1, total_enviados = $2, total_fallidos = $3,
             fecha_envio = CASE WHEN $1 = 'enviado' THEN CURRENT_TIMESTAMP ELSE fecha_envio END
         WHERE id = $4`,
        [nuevoEstado, enviados, fallidos, mensajeId]
      );

      res.json({
        success: true,
        data: {
          mensaje_id: mensajeId,
          titulo: mensaje.titulo,
          enviados,
          fallidos,
          total: totalDestinatarios,
          estado: nuevoEstado
        }
      });
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Error enviando mensaje automático:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Error al enviar el mensaje',
        details: error?.message
      }
    });
  }
});

// POST /api/v1/external/v1/broadcast/enviar/:id
// Enviar mensaje por ID (para N8N)
router.post('/enviar/:id', async (req: Request, res: Response<ApiResponse>) => {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({
        success: false,
        error: { message: 'ID del mensaje es requerido' }
      });
      return;
    }

    const client = await postgresPool.connect();
    
    try {
      // 1. Obtener el mensaje completo
      const mensajeResult = await client.query(
        'SELECT * FROM mensajes_difusion WHERE id = $1',
        [parseInt(id)]
      );

      if (mensajeResult.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: { message: 'Mensaje no encontrado' }
        });
        return;
      }

      const mensaje = mensajeResult.rows[0];

      // 2. Obtener todos los destinatarios con sus emails y teléfonos
      const destinatariosResult = await client.query(
        `SELECT 
          md.id,
          md.paciente_id,
          md.email,
          md.telefono,
          md.canal,
          md.estado_envio,
          p.nombres,
          p.apellidos,
          p.email as paciente_email,
          p.telefono as paciente_telefono
        FROM mensajes_destinatarios md
        LEFT JOIN pacientes p ON md.paciente_id = p.id
        WHERE md.mensaje_id = $1`,
        [parseInt(id)]
      );

      if (destinatariosResult.rows.length === 0) {
        res.status(400).json({
          success: false,
          error: { message: 'No hay destinatarios para este mensaje' }
        });
        return;
      }

      const destinatarios = destinatariosResult.rows;

      // 3. Inicializar EmailService
      const emailService = new EmailService();
      let enviados = 0;
      let fallidos = 0;

      // 4. Enviar mensaje a cada destinatario según su canal
      for (const destinatario of destinatarios) {
        if (!destinatario.id) {
          continue;
        }

        const canal = destinatario.canal || mensaje.canal;
        let canalArray: string[] = [];
        
        // Parsear canal si es JSON string
        try {
          if (typeof canal === 'string' && canal.startsWith('[')) {
            canalArray = JSON.parse(canal);
          } else if (typeof canal === 'string') {
            canalArray = [canal];
          } else if (Array.isArray(canal)) {
            canalArray = canal;
          }
        } catch {
          canalArray = ['email']; // Default
        }

        const email = destinatario.email || destinatario.paciente_email;
        const telefono = destinatario.telefono || destinatario.paciente_telefono;

        // Enviar por cada canal configurado
        for (const canalIndividual of canalArray) {
          if (canalIndividual === 'email' && email) {
            try {
              await emailService.sendEmail({
                to: email,
                subject: mensaje.titulo,
                html: mensaje.contenido,
                text: mensaje.contenido.replace(/<[^>]*>/g, '')
              });

              await client.query(
                `UPDATE mensajes_destinatarios
                 SET estado_envio = 'enviado', fecha_envio = CURRENT_TIMESTAMP
                 WHERE id = $1 AND canal = $2`,
                [destinatario.id, canalIndividual]
              );
              enviados++;
            } catch (error: any) {
              console.error(`Error enviando email a ${email}:`, error);
              await client.query(
                `UPDATE mensajes_destinatarios
                 SET estado_envio = 'fallido', error_mensaje = $1
                 WHERE id = $2 AND canal = $3`,
                [error.message || 'Error al enviar email', destinatario.id, canalIndividual]
              );
              fallidos++;
            }
          } else if ((canalIndividual === 'whatsapp' || canalIndividual === 'sms') && telefono) {
            // Para WhatsApp y SMS, solo marcamos como pendiente
            // N8N se encargará del envío real
            await client.query(
              `UPDATE mensajes_destinatarios
               SET estado_envio = 'enviando'
               WHERE id = $1 AND canal = $2`,
              [destinatario.id, canalIndividual]
            );
          } else {
            // No tiene el dato necesario para este canal
            await client.query(
              `UPDATE mensajes_destinatarios
               SET estado_envio = 'fallido', error_mensaje = $1
               WHERE id = $2 AND canal = $3`,
              [`No tiene ${canalIndividual === 'email' ? 'email' : 'teléfono'} disponible`, destinatario.id, canalIndividual]
            );
            fallidos++;
          }
        }
      }

      // 5. Actualizar estado del mensaje
      const totalDestinatarios = destinatarios.length;
      let nuevoEstado = 'enviando';
      if (enviados + fallidos >= totalDestinatarios) {
        nuevoEstado = enviados > 0 ? 'enviado' : 'fallido';
      }

      await client.query(
        `UPDATE mensajes_difusion
         SET estado = $1, total_enviados = $2, total_fallidos = $3,
             fecha_envio = CASE WHEN $1 = 'enviado' THEN CURRENT_TIMESTAMP ELSE fecha_envio END
         WHERE id = $4`,
        [nuevoEstado, enviados, fallidos, parseInt(id)]
      );

      res.json({
        success: true,
        data: {
          mensaje_id: parseInt(id),
          enviados,
          fallidos,
          total: totalDestinatarios,
          estado: nuevoEstado
        }
      });
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Error enviando mensaje:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Error al enviar el mensaje',
        details: error?.message
      }
    });
  }
});

export default router;


