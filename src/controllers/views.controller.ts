import { Request, Response } from 'express';
import { postgresPool } from '../config/database.js';
import { ApiResponse } from '../types/index.js';

export class ViewsController {
  // Obtener estadísticas por especialidad
  static async getEstadisticasEspecialidad(req: Request, res: Response): Promise<void> {
    try {
      console.log('📊 Getting estadísticas especialidad...');
      
      const { especialidad_id } = req.query;
      
      const client = await postgresPool.connect();
      try {
        let sql = 'SELECT * FROM vista_estadisticas_especialidad';
        const params: any[] = [];
        
        if (especialidad_id) {
          sql += ' WHERE id_especialidad = $1';
          params.push(especialidad_id);
        }
        
        const result = await client.query(sql, params);
        
        console.log('✅ Estadísticas obtenidas:', result.rows.length, 'especialidades');
        
        res.json({
          success: true,
          data: result.rows
        } as ApiResponse<typeof result.rows>);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('❌ Error in getEstadisticasEspecialidad:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      } as ApiResponse<null>);
    }
  }

  // Obtener médicos con información completa
  static async getMedicosCompleta(req: Request, res: Response): Promise<void> {
    try {
      console.log('👨‍⚕️ Getting médicos completa...');
      
      const { page = 1, limit = 10, activo } = req.query;
      const offset = (Number(page) - 1) * Number(limit);
      
      const client = await postgresPool.connect();
      try {
        let sql = 'SELECT * FROM vista_medicos_completa';
        const params: any[] = [];
        let paramIndex = 1;
        
        if (activo !== undefined) {
          sql += ` WHERE activo = $${paramIndex}`;
          params.push(activo === 'true');
          paramIndex++;
        }
        
        sql += ` ORDER BY id LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(Number(limit), offset);
        
        const result = await client.query(sql, params);
        
        console.log('✅ Médicos obtenidos:', result.rows.length);
        
        res.json({
          success: true,
          data: result.rows
        } as ApiResponse<typeof result.rows>);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('❌ Error in getMedicosCompleta:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error interno del servidor' }
      } as ApiResponse<null>);
    }
  }
}
