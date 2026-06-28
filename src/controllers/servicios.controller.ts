import { postgresPool } from '../config/database.js';

export class ServiciosController {

  // GET /api/v1/servicios - Listar servicios
  async getServicios(req: any, res: any) {
    try {
      const { especialidad_id, activo } = req.query;

      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
        let sqlQuery = `
          SELECT 
            id,
            nombre_servicio,
            monto_base,
            moneda,
            descripcion,
            activo,
            especialidad_id
          FROM servicios
          WHERE 1=1
        `;

        const params: any[] = [];
        let paramIndex = 1;

        if (especialidad_id) {
          sqlQuery += ` AND especialidad_id = $${paramIndex}`;
          params.push(parseInt(especialidad_id));
          paramIndex++;
        }

        if (activo !== undefined) {
          sqlQuery += ` AND activo = $${paramIndex}`;
          params.push(activo === 'true');
          paramIndex++;
        }

        sqlQuery += ` ORDER BY nombre_servicio ASC`;

        console.log('🔍 PostgreSQL query:', sqlQuery);
        console.log('🔍 Params:', params);

        const result = await client.query(sqlQuery, params);
        console.log('✅ Datos obtenidos:', result.rows.length, 'servicios');

        res.json({ success: true, data: result.rows });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error obteniendo servicios:', error);
      res.status(500).json({ success: false, error: 'Error interno del servidor' });
    }
  }

  // POST /api/v1/servicios - Crear servicio
  async createServicio(req: any, res: any) {
    try {
      const { nombre_servicio, especialidad_id, monto_base, moneda, descripcion } = req.body;

      // Validaciones (monto_base puede ser 0, no usar !monto_base)
      const montoValido = monto_base !== undefined && monto_base !== null && monto_base !== '';
      if (!nombre_servicio || !especialidad_id || !montoValido || !moneda) {
        return res.status(400).json({ 
          success: false, 
          error: 'Faltan campos requeridos: nombre_servicio, especialidad_id, monto_base, moneda' 
        });
      }

      if (!['USD', 'VES'].includes(moneda)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Moneda debe ser USD o VES' 
        });
      }

      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
        await client.query('BEGIN');

        // Insertar el servicio
        const insertQuery = `
          INSERT INTO servicios (nombre_servicio, especialidad_id, monto_base, moneda, descripcion, activo)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id, nombre_servicio, monto_base, moneda, descripcion, activo, especialidad_id
        `;
        
        const insertResult = await client.query(insertQuery, [
          nombre_servicio,
          parseInt(especialidad_id),
          parseFloat(monto_base),
          moneda,
          descripcion || null,
          true // activo por defecto
        ]);

        // Obtener la especialidad asociada
        const especialidadQuery = `
          SELECT id, nombre_especialidad
          FROM especialidades
          WHERE id = $1
        `;
        const especialidadResult = await client.query(especialidadQuery, [parseInt(especialidad_id)]);

        await client.query('COMMIT');

        const servicio = insertResult.rows[0];
        const especialidad = especialidadResult.rows[0] || null;

        const response = {
          ...servicio,
          especialidades: especialidad ? {
            id: especialidad.id,
            nombre_especialidad: especialidad.nombre_especialidad
          } : null
        };

        res.status(201).json({ success: true, data: response });
      } catch (dbError: any) {
        await client.query('ROLLBACK');
        console.error('❌ PostgreSQL error in createServicio:', dbError);
        
        // Manejar errores de constraint
        if (dbError.code === '23505') {
          return res.status(400).json({ 
            success: false, 
            error: 'Ya existe un servicio con ese nombre para esta especialidad' 
          });
        }
        if (dbError.code === '23503') {
          return res.status(400).json({ 
            success: false, 
            error: 'La especialidad especificada no existe' 
          });
        }
        
        res.status(500).json({ 
          success: false, 
          error: 'Error al crear el servicio' 
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error creando servicio:', error);
      res.status(500).json({ success: false, error: 'Error interno del servidor' });
    }
  }

  // PUT /api/v1/servicios/:id - Actualizar servicio
  async updateServicio(req: any, res: any) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
        // Validar que el servicio existe
        const checkQuery = 'SELECT id FROM servicios WHERE id = $1';
        const checkResult = await client.query(checkQuery, [parseInt(id)]);

        if (checkResult.rows.length === 0) {
          return res.status(404).json({ success: false, error: 'Servicio no encontrado' });
        }

        // Construir query dinámico de actualización
        const allowedFields = ['nombre_servicio', 'especialidad_id', 'monto_base', 'moneda', 'descripcion', 'activo'];
        const updateFields: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;

        for (const field of allowedFields) {
          if (updateData[field] !== undefined) {
            updateFields.push(`${field} = $${paramIndex}`);
            if (field === 'especialidad_id') {
              params.push(parseInt(updateData[field]));
            } else if (field === 'monto_base') {
              params.push(parseFloat(updateData[field]));
            } else if (field === 'activo') {
              params.push(updateData[field] === true || updateData[field] === 'true');
            } else {
              params.push(updateData[field]);
            }
            paramIndex++;
          }
        }

        if (updateFields.length === 0) {
          return res.status(400).json({ success: false, error: 'No hay campos para actualizar' });
        }

        params.push(parseInt(id));
        const updateQuery = `
          UPDATE servicios 
          SET ${updateFields.join(', ')}
          WHERE id = $${paramIndex}
          RETURNING id, nombre_servicio, monto_base, moneda, descripcion, activo, especialidad_id
        `;

        const updateResult = await client.query(updateQuery, params);

        // Obtener la especialidad asociada
        const especialidadQuery = `
          SELECT id, nombre_especialidad
          FROM especialidades
          WHERE id = $1
        `;
        const especialidadResult = await client.query(especialidadQuery, [updateResult.rows[0].especialidad_id]);

        const servicio = updateResult.rows[0];
        const especialidad = especialidadResult.rows[0] || null;

        const response = {
          ...servicio,
          especialidades: especialidad ? {
            id: especialidad.id,
            nombre_especialidad: especialidad.nombre_especialidad
          } : null
        };

        res.json({ success: true, data: response });
      } catch (dbError: any) {
        console.error('❌ PostgreSQL error in updateServicio:', dbError);
        res.status(500).json({ 
          success: false, 
          error: 'Error al actualizar el servicio' 
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error actualizando servicio:', error);
      res.status(500).json({ success: false, error: 'Error interno del servidor' });
    }
  }

  // DELETE /api/v1/servicios/:id - Eliminar servicio
  async deleteServicio(req: any, res: any) {
    try {
      const { id } = req.params;

      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
        // Verificar que el servicio existe
        const checkQuery = 'SELECT id FROM servicios WHERE id = $1';
        const checkResult = await client.query(checkQuery, [parseInt(id)]);

        if (checkResult.rows.length === 0) {
          return res.status(404).json({ success: false, error: 'Servicio no encontrado' });
        }

        // Verificar si el servicio está siendo usado en consultas
        const usoQuery = 'SELECT id FROM servicios_consulta WHERE servicio_id = $1 LIMIT 1';
        const usoResult = await client.query(usoQuery, [parseInt(id)]);

        if (usoResult.rows.length > 0) {
          return res.status(400).json({ 
            success: false, 
            error: 'No se puede eliminar el servicio porque está siendo usado en consultas' 
          });
        }

        // Eliminar el servicio
        const deleteQuery = 'DELETE FROM servicios WHERE id = $1';
        await client.query(deleteQuery, [parseInt(id)]);

        res.json({ success: true, message: 'Servicio eliminado exitosamente' });
      } catch (dbError: any) {
        console.error('❌ PostgreSQL error in deleteServicio:', dbError);
        res.status(500).json({ 
          success: false, 
          error: 'Error al eliminar el servicio' 
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error eliminando servicio:', error);
      res.status(500).json({ success: false, error: 'Error interno del servidor' });
    }
  }

  // GET /api/v1/servicios/por-especialidad/:especialidad_id
  async getServiciosPorEspecialidad(req: any, res: any) {
    try {
      const { especialidad_id } = req.params;

      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
        const query = `
          SELECT 
            s.id,
            s.nombre_servicio,
            s.monto_base,
            s.moneda,
            s.descripcion,
            s.activo,
            s.especialidad_id
          FROM servicios s
          WHERE s.especialidad_id = $1
            AND s.activo = true
          ORDER BY s.nombre_servicio ASC
        `;

        const result = await client.query(query, [parseInt(especialidad_id)]);
        res.json({ success: true, data: result.rows });
      } catch (dbError: any) {
        console.error('❌ PostgreSQL error in getServiciosPorEspecialidad:', dbError);
        res.status(500).json({ 
          success: false, 
          error: 'Error al obtener servicios por especialidad' 
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error obteniendo servicios por especialidad:', error);
      res.status(500).json({ success: false, error: 'Error interno del servidor' });
    }
  }

  // GET /api/v1/servicios/:id - Obtener servicio por ID
  async getServicioById(req: any, res: any) {
    try {
      const { id } = req.params;

      // PostgreSQL implementation
      const client = await postgresPool.connect();
      try {
        const query = `
          SELECT 
            s.id,
            s.nombre_servicio,
            s.monto_base,
            s.moneda,
            s.descripcion,
            s.activo,
            s.especialidad_id,
            e.id as especialidad_id_detail,
            e.nombre_especialidad,
            e.descripcion as especialidad_descripcion
          FROM servicios s
          LEFT JOIN especialidades e ON s.especialidad_id = e.id
          WHERE s.id = $1
        `;

        const result = await client.query(query, [parseInt(id)]);

        if (result.rows.length === 0) {
          return res.status(404).json({ success: false, error: 'Servicio no encontrado' });
        }

        const servicio = result.rows[0];
        const response = {
          id: servicio.id,
          nombre_servicio: servicio.nombre_servicio,
          monto_base: servicio.monto_base,
          moneda: servicio.moneda,
          descripcion: servicio.descripcion,
          activo: servicio.activo,
          especialidades: servicio.especialidad_id_detail ? {
            id: servicio.especialidad_id_detail,
            nombre_especialidad: servicio.nombre_especialidad,
            descripcion: servicio.especialidad_descripcion
          } : null
        };

        res.json({ success: true, data: response });
      } catch (dbError: any) {
        console.error('❌ PostgreSQL error in getServicioById:', dbError);
        res.status(500).json({ 
          success: false, 
          error: 'Error al obtener el servicio' 
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error obteniendo servicio:', error);
      res.status(500).json({ success: false, error: 'Error interno del servidor' });
    }
  }
}

export default new ServiciosController();
