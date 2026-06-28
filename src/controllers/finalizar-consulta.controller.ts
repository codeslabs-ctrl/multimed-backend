import { postgresPool } from '../config/database.js';
import menuService from '../services/menu.service.js';

export class FinalizarConsultaController {
  
  // POST /api/v1/consultas/:id/finalizar - Finalizar consulta
  async finalizarConsulta(req: any, res: any) {
    try {
      const { id } = req.params;
      const { servicios } = req.body;
      
      console.log('🔍 Finalizando consulta ID:', id);
      console.log('🔍 Servicios recibidos:', servicios);
      
      // Validaciones
      console.log('🔍 Validando servicios...');
      if (!servicios || !Array.isArray(servicios) || servicios.length === 0) {
        console.log('❌ Error: No hay servicios seleccionados');
        return res.status(400).json({ 
          success: false, 
          error: 'Debe seleccionar al menos un servicio' 
        });
      }
      console.log('✅ Servicios válidos:', servicios.length);
      
      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
          await client.query('BEGIN');
          
          // 1. Verificar que la consulta existe y está en estado correcto
          const consultaQuery = `
            SELECT 
              cp.*,
              m.especialidad_id
            FROM consultas_pacientes cp
            LEFT JOIN medicos m ON cp.medico_id = m.id
            WHERE cp.id = $1
          `;
          
          const consultaResult = await client.query(consultaQuery, [parseInt(id)]);
          
          if (consultaResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Consulta no encontrada' });
          }
          
          const consulta = consultaResult.rows[0];
          
          // Verificar permiso según Gestión de Perfiles (puede_finalizar para Consultas)
          const user = (req as any).user;
          const rol = user?.rol;
          if (!rol) {
            await client.query('ROLLBACK');
            return res.status(403).json({ success: false, error: 'Usuario no autenticado' });
          }
          const puedeFinalizar = await menuService.puedeFinalizarConsulta(rol);
          if (!puedeFinalizar) {
            await client.query('ROLLBACK');
            return res.status(403).json({
              success: false,
              error: 'No tiene permiso para finalizar consultas'
            });
          }

          // Verificar que la consulta está en estado "completada" (no "finalizada")
          if (consulta.estado_consulta === 'finalizada') {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, error: 'La consulta ya está finalizada' });
          }

          if (consulta.estado_consulta !== 'completada') {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
              success: false, 
              error: 'Solo se pueden finalizar consultas en estado "completada"' 
            });
          }
          
          // Obtener especialidad_id
          const especialidadId = consulta.especialidad_id;
          
          if (!especialidadId) {
            await client.query('ROLLBACK');
            console.error('❌ No se pudo determinar especialidad_id. Consulta:', JSON.stringify(consulta, null, 2));
            return res.status(400).json({ success: false, error: 'No se pudo determinar la especialidad de la consulta' });
          }
          
          // 2. Obtener tipo de cambio actual
          const tipoCambioQuery = `
            SELECT usd_to_ves 
            FROM tipos_cambio 
            WHERE fecha = CURRENT_DATE 
              AND activo = true 
            LIMIT 1
          `;
          const tipoCambioResult = await client.query(tipoCambioQuery);
          const tipoCambioActual = tipoCambioResult.rows[0]?.usd_to_ves || 36.50;
          
          // 3. Procesar servicios: manejar servicio predeterminado (ID -1)
          const serviciosProcesados: any[] = [];
          
          for (const servicio of servicios) {
            let servicioIdReal = servicio.servicio_id;
            
            // Si el servicio_id es -1, es un servicio predeterminado "Consulta"
            if (servicio.servicio_id === -1 || servicio.servicio_id === 0) {
              console.log('📝 Detectado servicio predeterminado (ID: -1), buscando o creando servicio "Consulta"');
              
              // Buscar si ya existe un servicio "Consulta" para esta especialidad
              const servicioExistenteQuery = `
                SELECT id, nombre_servicio, monto_base, moneda 
                FROM servicios 
                WHERE nombre_servicio = 'Consulta' 
                  AND especialidad_id = $1 
                  AND activo = true 
                LIMIT 1
              `;
              const servicioExistenteResult = await client.query(servicioExistenteQuery, [especialidadId]);
              
              if (servicioExistenteResult.rows.length > 0) {
                // Usar el servicio existente
                console.log('✅ Servicio "Consulta" encontrado:', servicioExistenteResult.rows[0].id);
                servicioIdReal = servicioExistenteResult.rows[0].id;
              } else {
                // Crear el servicio "Consulta" si no existe
                console.log('📝 Creando nuevo servicio "Consulta" para especialidad:', especialidadId);
                const nuevoServicioQuery = `
                  INSERT INTO servicios (nombre_servicio, especialidad_id, monto_base, moneda, activo)
                  VALUES ('Consulta', $1, 80, $2, true)
                  RETURNING id, nombre_servicio, monto_base, moneda
                `;
                const nuevoServicioResult = await client.query(nuevoServicioQuery, [
                  especialidadId,
                  servicio.moneda || 'USD'
                ]);
                
                if (nuevoServicioResult.rows.length === 0) {
                  await client.query('ROLLBACK');
                  return res.status(500).json({ 
                    success: false, 
                    error: 'Error al crear servicio predeterminado'
                  });
                }
                
                console.log('✅ Servicio "Consulta" creado exitosamente:', nuevoServicioResult.rows[0].id);
                servicioIdReal = nuevoServicioResult.rows[0].id;
              }
            }
            
            serviciosProcesados.push({
              ...servicio,
              servicio_id: servicioIdReal
            });
          }
          
          // Validar que todos los servicios procesados existen
          const servicioIdsReales = serviciosProcesados.map((s: any) => s.servicio_id);
          const serviciosValidosQuery = `
            SELECT id, nombre_servicio, monto_base, moneda 
            FROM servicios 
            WHERE id = ANY($1::int[]) 
              AND activo = true
          `;
          const serviciosValidosResult = await client.query(serviciosValidosQuery, [servicioIdsReales]);
          
          if (serviciosValidosResult.rows.length !== servicioIdsReales.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
              success: false, 
              error: 'Uno o más servicios seleccionados no son válidos' 
            });
          }
          
          // 4. Validar montos y monedas (0 permitido: consulta gratuita / cortesía)
          for (const servicio of serviciosProcesados) {
            const montoNum = parseFloat(servicio.monto_pagado);
            if (
              servicio.monto_pagado === null ||
              servicio.monto_pagado === undefined ||
              servicio.monto_pagado === '' ||
              Number.isNaN(montoNum) ||
              montoNum < 0
            ) {
              await client.query('ROLLBACK');
              return res.status(400).json({ 
                success: false, 
                error: `El monto para el servicio ${servicio.servicio_id} debe ser un número mayor o igual a 0` 
              });
            }
            
            if (!['USD', 'VES'].includes(servicio.moneda)) {
              await client.query('ROLLBACK');
              return res.status(400).json({ 
                success: false, 
                error: `La moneda para el servicio ${servicio.servicio_id} debe ser USD o VES` 
              });
            }
          }
          
          // 5. Verificar si ya existen servicios para esta consulta
          const serviciosExistentesQuery = 'SELECT id FROM servicios_consulta WHERE consulta_id = $1';
          const serviciosExistentesResult = await client.query(serviciosExistentesQuery, [parseInt(id)]);
          
          if (serviciosExistentesResult.rows.length > 0) {
            console.log('⚠️ Ya existen servicios para esta consulta, eliminando anteriores...');
            await client.query('DELETE FROM servicios_consulta WHERE consulta_id = $1', [parseInt(id)]);
          }
          
          // 6. Insertar servicios de la consulta
          const serviciosInsertados: any[] = [];
          for (const servicio of serviciosProcesados) {
            // Validar que todos los campos requeridos estén presentes (monto_pagado puede ser 0)
            const montoIns = parseFloat(servicio.monto_pagado);
            if (
              !servicio.servicio_id ||
              servicio.monto_pagado === null ||
              servicio.monto_pagado === undefined ||
              servicio.monto_pagado === '' ||
              Number.isNaN(montoIns) ||
              montoIns < 0 ||
              !servicio.moneda
            ) {
              await client.query('ROLLBACK');
              console.error('❌ Error: Faltan campos requeridos en el servicio:', servicio);
              return res.status(400).json({ 
                success: false, 
                error: 'Todos los servicios deben tener servicio_id, monto_pagado y moneda' 
              });
            }
            
            const insertQuery = `
              INSERT INTO servicios_consulta (consulta_id, servicio_id, monto_pagado, moneda_pago, tipo_cambio, observaciones)
              VALUES ($1, $2, $3, $4, $5, $6)
              RETURNING id, monto_pagado, moneda_pago, tipo_cambio, observaciones
            `;
            const insertResult = await client.query(insertQuery, [
              parseInt(id),
              parseInt(servicio.servicio_id),
              parseFloat(servicio.monto_pagado),
              servicio.moneda,
              tipoCambioActual,
              servicio.observaciones || null
            ]);
            
            // Verificar que el INSERT fue exitoso
            if (!insertResult.rows || insertResult.rows.length === 0) {
              await client.query('ROLLBACK');
              console.error('❌ Error: No se pudo insertar el servicio en servicios_consulta');
              return res.status(500).json({ 
                success: false, 
                error: 'Error al guardar el servicio en la base de datos' 
              });
            }
            
            console.log('✅ Servicio insertado en servicios_consulta:', {
              id: insertResult.rows[0].id,
              consulta_id: parseInt(id),
              servicio_id: servicio.servicio_id,
              monto: servicio.monto_pagado,
              moneda: servicio.moneda
            });
            
            // Obtener datos del servicio asociado
            const servicioDataQuery = `
              SELECT id, nombre_servicio, monto_base, moneda 
              FROM servicios 
              WHERE id = $1
            `;
            const servicioDataResult = await client.query(servicioDataQuery, [parseInt(servicio.servicio_id)]);
            
            if (!servicioDataResult.rows || servicioDataResult.rows.length === 0) {
              await client.query('ROLLBACK');
              console.error('❌ Error: No se encontró el servicio con ID:', servicio.servicio_id);
              return res.status(500).json({ 
                success: false, 
                error: 'Error al obtener datos del servicio' 
              });
            }
            
            serviciosInsertados.push({
              ...insertResult.rows[0],
              servicios: servicioDataResult.rows[0]
            });
          }
          
          // Verificar que se insertaron todos los servicios
          if (serviciosInsertados.length === 0) {
            await client.query('ROLLBACK');
            console.error('❌ Error: No se insertó ningún servicio');
            return res.status(500).json({ 
              success: false, 
              error: 'No se pudieron insertar los servicios en la base de datos' 
            });
          }
          
          console.log('✅ Total servicios insertados en servicios_consulta:', serviciosInsertados.length);
          
          // 7. Actualizar estado de la consulta
          console.log('🔍 Actualizando estado de consulta a "finalizada"...');
          const updateQuery = `
            UPDATE consultas_pacientes 
            SET estado_consulta = 'finalizada',
                fecha_culminacion = CURRENT_TIMESTAMP,
                fecha_pago = CURRENT_DATE,
                metodo_pago = 'Efectivo',
                fecha_actualizacion = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING *
          `;
          await client.query(updateQuery, [parseInt(id)]);
          
          // 8. Calcular totales
          console.log('🔍 Calculando totales de la consulta...');
          const totalesQuery = `
            SELECT 
              COUNT(*) as cantidad_servicios,
              SUM(CASE WHEN moneda_pago = 'USD' THEN monto_pagado ELSE 0 END) as total_usd,
              SUM(CASE WHEN moneda_pago = 'VES' THEN monto_pagado ELSE 0 END) as total_ves
            FROM servicios_consulta
            WHERE consulta_id = $1
          `;
          const totalesResult = await client.query(totalesQuery, [parseInt(id)]);
          const totales = totalesResult.rows[0] || { total_usd: 0, total_ves: 0, cantidad_servicios: 0 };
          
          // 9. Verificar que los servicios se guardaron correctamente antes del COMMIT
          const verificacionQuery = `
            SELECT COUNT(*) as total
            FROM servicios_consulta
            WHERE consulta_id = $1
          `;
          const verificacionResult = await client.query(verificacionQuery, [parseInt(id)]);
          const totalServiciosGuardados = parseInt(verificacionResult.rows[0]?.total || '0');
          
          if (totalServiciosGuardados !== serviciosInsertados.length) {
            await client.query('ROLLBACK');
            console.error('❌ Error: No se guardaron todos los servicios. Esperados:', serviciosInsertados.length, 'Guardados:', totalServiciosGuardados);
            return res.status(500).json({ 
              success: false, 
              error: 'Error: No se guardaron todos los servicios correctamente' 
            });
          }
          
          console.log('✅ Verificación: Todos los servicios se guardaron correctamente en servicios_consulta');
          
          await client.query('COMMIT');
          
          console.log('✅ Consulta finalizada exitosamente con', serviciosInsertados.length, 'servicios guardados');
          res.json({ 
            success: true, 
            data: {
              consulta_id: parseInt(id),
              servicios: serviciosInsertados,
              totales: totales,
              mensaje: 'Consulta finalizada exitosamente',
              servicios_guardados: totalServiciosGuardados
            }
          });
        } catch (dbError) {
          await client.query('ROLLBACK');
          console.error('❌ PostgreSQL error finalizing consulta:', dbError);
          res.status(500).json({ 
            success: false, 
            error: 'Error al finalizar consulta' 
          });
        } finally {
          client.release();
        }
      
    } catch (error) {
      console.error('Error finalizando consulta:', error);
      res.status(500).json({ success: false, error: 'Error interno del servidor' });
    }
  }
  
  // GET /api/v1/consultas/:id/servicios - Obtener servicios de una consulta
  async getServiciosConsulta(req: any, res: any) {
    const client = await postgresPool.connect();
    try {
      const { id } = req.params;
      
      const result = await client.query(`
        SELECT 
          sc.id,
          sc.monto_pagado,
          sc.moneda_pago,
          sc.tipo_cambio,
          sc.observaciones,
          sc.created_at,
          json_build_object(
            'id', s.id,
            'nombre_servicio', s.nombre_servicio,
            'monto_base', s.monto_base,
            'moneda', s.moneda,
            'descripcion', s.descripcion
          ) as servicios
        FROM servicios_consulta sc
        INNER JOIN servicios s ON sc.servicio_id = s.id
        WHERE sc.consulta_id = $1
        ORDER BY sc.created_at ASC
      `, [parseInt(id)]);
      
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error('Error obteniendo servicios de consulta:', error);
      res.status(500).json({ success: false, error: 'Error interno del servidor' });
    } finally {
      client.release();
    }
  }
  
  // GET /api/v1/consultas/:id/totales - Obtener totales de una consulta
  async getTotalesConsulta(req: any, res: any) {
    const client = await postgresPool.connect();
    try {
      const { id } = req.params;
      
      const result = await client.query(
        'SELECT * FROM calcular_total_consulta($1)',
        [parseInt(id)]
      );
      
      res.json({ success: true, data: result.rows[0] || { total_usd: 0, total_ves: 0, cantidad_servicios: 0 } });
    } catch (error) {
      console.error('Error calculando totales:', error);
      res.status(500).json({ success: false, error: 'Error interno del servidor' });
    } finally {
      client.release();
    }
  }
  
  // GET /api/v1/consultas/:id/detalle-finalizacion - Obtener detalle completo de finalización
  async getDetalleFinalizacion(req: any, res: any) {
    const client = await postgresPool.connect();
    try {
      const { id } = req.params;
      
      // Obtener información de la consulta
      const consultaResult = await client.query(`
        SELECT 
          cp.id,
          cp.estado_consulta as estado,
          cp.fecha_pautada as fecha_consulta,
          cp.fecha_culminacion as fecha_finalizacion,
          cp.observaciones,
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
          ) as medicos
        FROM consultas_pacientes cp
        INNER JOIN pacientes p ON cp.paciente_id = p.id
        LEFT JOIN medicos m ON cp.medico_id = m.id
        WHERE cp.id = $1
      `, [parseInt(id)]);
      
      if (consultaResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Consulta no encontrada' });
      }
      
      const consulta = consultaResult.rows[0];
      
      // Obtener servicios de la consulta
      const serviciosResult = await client.query(`
        SELECT 
          sc.id,
          sc.monto_pagado,
          sc.moneda_pago,
          sc.tipo_cambio,
          sc.observaciones,
          sc.created_at,
          json_build_object(
            'id', s.id,
            'nombre_servicio', s.nombre_servicio,
            'monto_base', s.monto_base,
            'moneda', s.moneda,
            'descripcion', s.descripcion
          ) as servicios
        FROM servicios_consulta sc
        INNER JOIN servicios s ON sc.servicio_id = s.id
        WHERE sc.consulta_id = $1
        ORDER BY sc.created_at ASC
      `, [parseInt(id)]);
      
      // Calcular totales
      const totalesResult = await client.query(
        'SELECT * FROM calcular_total_consulta($1)',
        [parseInt(id)]
      );
      
      res.json({ 
        success: true, 
        data: {
          consulta,
          servicios: serviciosResult.rows || [],
          totales: totalesResult.rows[0] || { total_usd: 0, total_ves: 0, cantidad_servicios: 0 }
        }
      });
    } catch (error) {
      console.error('Error obteniendo detalle de finalización:', error);
      res.status(500).json({ success: false, error: 'Error interno del servidor' });
    } finally {
      client.release();
    }
  }
}

export default new FinalizarConsultaController();
