import { postgresPool } from '../config/database.js';

export interface PlantillaHistoria {
  id?: number;
  medico_id: number;
  nombre: string;
  descripcion?: string;
  motivo_consulta_template?: string;
  diagnostico_template?: string;
  conclusiones_template?: string;
  plan_template?: string;
  activo: boolean;
  fecha_creacion?: Date;
  fecha_actualizacion?: Date;
}

export class PlantillaHistoriaService {
  
  /**
   * Obtiene todas las plantillas de un médico
   */
  async obtenerPlantillasPorMedico(medicoId: number, soloActivas: boolean = true): Promise<PlantillaHistoria[]> {
    const client = await postgresPool.connect();
    try {
      let query = 'SELECT * FROM plantillas_historias_medicas WHERE medico_id = $1';
      const params: any[] = [medicoId];
      
      if (soloActivas) {
        query += ' AND activo = true';
      }
      
      query += ' ORDER BY nombre ASC';
      
      const result = await client.query(query, params);
      return result.rows || [];
    } catch (error) {
      console.error('Error en obtenerPlantillasPorMedico:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Obtiene una plantilla por su ID
   */
  async obtenerPlantillaPorId(plantillaId: number, medicoId: number): Promise<PlantillaHistoria | null> {
    const client = await postgresPool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM plantillas_historias_medicas WHERE id = $1 AND medico_id = $2',
        [plantillaId, medicoId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      console.error('Error en obtenerPlantillaPorId:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Crea una nueva plantilla
   */
  async crearPlantilla(plantilla: Omit<PlantillaHistoria, 'id' | 'fecha_creacion' | 'fecha_actualizacion'>): Promise<PlantillaHistoria> {
    const client = await postgresPool.connect();
    try {
      const result = await client.query(
        `INSERT INTO plantillas_historias_medicas (
          medico_id, nombre, descripcion, 
          motivo_consulta_template, diagnostico_template, 
          conclusiones_template, plan_template, activo
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          plantilla.medico_id,
          plantilla.nombre,
          plantilla.descripcion || null,
          plantilla.motivo_consulta_template || null,
          plantilla.diagnostico_template || null,
          plantilla.conclusiones_template || null,
          plantilla.plan_template || null,
          plantilla.activo !== undefined ? plantilla.activo : true
        ]
      );

      return result.rows[0];
    } catch (error) {
      console.error('Error en crearPlantilla:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Actualiza una plantilla existente
   */
  async actualizarPlantilla(
    plantillaId: number, 
    medicoId: number, 
    plantilla: Partial<Omit<PlantillaHistoria, 'id' | 'medico_id' | 'fecha_creacion' | 'fecha_actualizacion'>>
  ): Promise<PlantillaHistoria> {
    const client = await postgresPool.connect();
    try {
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (plantilla.nombre !== undefined) {
        updateFields.push(`nombre = $${paramIndex}`);
        values.push(plantilla.nombre);
        paramIndex++;
      }
      if (plantilla.descripcion !== undefined) {
        updateFields.push(`descripcion = $${paramIndex}`);
        values.push(plantilla.descripcion);
        paramIndex++;
      }
      if (plantilla.motivo_consulta_template !== undefined) {
        updateFields.push(`motivo_consulta_template = $${paramIndex}`);
        values.push(plantilla.motivo_consulta_template);
        paramIndex++;
      }
      if (plantilla.diagnostico_template !== undefined) {
        updateFields.push(`diagnostico_template = $${paramIndex}`);
        values.push(plantilla.diagnostico_template);
        paramIndex++;
      }
      if (plantilla.conclusiones_template !== undefined) {
        updateFields.push(`conclusiones_template = $${paramIndex}`);
        values.push(plantilla.conclusiones_template);
        paramIndex++;
      }
      if (plantilla.plan_template !== undefined) {
        updateFields.push(`plan_template = $${paramIndex}`);
        values.push(plantilla.plan_template);
        paramIndex++;
      }
      if (plantilla.activo !== undefined) {
        updateFields.push(`activo = $${paramIndex}`);
        values.push(plantilla.activo);
        paramIndex++;
      }

      if (updateFields.length === 0) {
        throw new Error('No hay campos para actualizar');
      }

      values.push(plantillaId, medicoId);

      const result = await client.query(
        `UPDATE plantillas_historias_medicas 
         SET ${updateFields.join(', ')} 
         WHERE id = $${paramIndex} AND medico_id = $${paramIndex + 1} 
         RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        throw new Error('Plantilla no encontrada o no pertenece al médico');
      }

      return result.rows[0];
    } catch (error) {
      console.error('Error en actualizarPlantilla:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Elimina una plantilla (soft delete - marca como inactiva)
   */
  async eliminarPlantilla(plantillaId: number, medicoId: number): Promise<boolean> {
    const client = await postgresPool.connect();
    try {
      const result = await client.query(
        'UPDATE plantillas_historias_medicas SET activo = false WHERE id = $1 AND medico_id = $2',
        [plantillaId, medicoId]
      );

      return result.rowCount !== null && result.rowCount > 0;
    } catch (error) {
      console.error('Error en eliminarPlantilla:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Elimina permanentemente una plantilla
   */
  async eliminarPlantillaPermanente(plantillaId: number, medicoId: number): Promise<boolean> {
    const client = await postgresPool.connect();
    try {
      const result = await client.query(
        'DELETE FROM plantillas_historias_medicas WHERE id = $1 AND medico_id = $2',
        [plantillaId, medicoId]
      );

      return result.rowCount !== null && result.rowCount > 0;
    } catch (error) {
      console.error('Error en eliminarPlantillaPermanente:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

export default new PlantillaHistoriaService();

