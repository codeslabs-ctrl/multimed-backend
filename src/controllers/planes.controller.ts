import { Request, Response } from 'express';
import { postgresPool } from '../config/database.js';
import { ApiResponse } from '../types/index.js';

/**
 * Controlador público para planes y add-ons (sin autenticación).
 * Usado en la página de login para "Conoce nuestros planes".
 * Planes desde planes_comparativos; add-ons desde addons_progresivos.
 */
export class PlanesController {
  static async getPlanesComparativa(_req: Request, res: Response): Promise<void> {
    try {
      const result = await postgresPool.query(
        `SELECT id, plan, costo_base, medicos_incluidos, pacientes_incluidos, almacenamiento, orden
         FROM planes_comparativos
         ORDER BY orden ASC`
      );
      res.json({ success: true, data: result.rows } as ApiResponse<typeof result.rows>);
    } catch (error) {
      console.error('getPlanesComparativa error:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error al obtener planes comparativos' }
      } as ApiResponse<null>);
    }
  }

  static async getAddonsProgresivos(_req: Request, res: Response): Promise<void> {
    try {
      const result = await postgresPool.query(
        `SELECT id, complemento, en_plan_profesional, en_plan_clinica_core, en_plan_clinica_pro, orden
         FROM addons_progresivos
         ORDER BY orden ASC`
      );
      res.json({ success: true, data: result.rows } as ApiResponse<typeof result.rows>);
    } catch (error) {
      console.error('getAddonsProgresivos error:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error al obtener add-ons' }
      } as ApiResponse<null>);
    }
  }
}
