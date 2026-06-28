import { Request, Response } from 'express';
import { PlantillaHistoriaService } from '../services/plantilla-historia.service.js';
import { ApiResponse } from '../types/index.js';

const plantillaHistoriaService = new PlantillaHistoriaService();

export class PlantillaHistoriaController {
  
  /**
   * Obtiene todas las plantillas del médico autenticado
   * GET /api/v1/plantillas-historias
   */
  obtenerPlantillas = async (req: Request, res: Response): Promise<void> => {
    try {
      const medicoId = (req as any).user?.medico_id;
      
      if (!medicoId) {
        res.status(401).json({
          success: false,
          error: { message: 'Médico no autenticado' }
        });
        return;
      }

      const soloActivas = req.query['activas'] !== 'false';
      const plantillas = await plantillaHistoriaService.obtenerPlantillasPorMedico(medicoId, soloActivas);

      const response: ApiResponse = {
        success: true,
        data: plantillas
      };
      res.json(response);
    } catch (error: any) {
      console.error('Error en obtenerPlantillas:', error);
      res.status(500).json({
        success: false,
        error: { message: error.message || 'Error obteniendo plantillas' }
      });
    }
  };

  /**
   * Obtiene una plantilla por su ID
   * GET /api/v1/plantillas-historias/:id
   */
  obtenerPlantillaPorId = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params['id'];
      if (!id) {
        res.status(400).json({
          success: false,
          error: { message: 'ID de plantilla requerido' }
        });
        return;
      }
      const plantillaId = parseInt(id);
      const medicoId = (req as any).user?.medico_id;

      if (isNaN(plantillaId)) {
        res.status(400).json({
          success: false,
          error: { message: 'ID de plantilla inválido' }
        });
        return;
      }

      if (!medicoId) {
        res.status(401).json({
          success: false,
          error: { message: 'Médico no autenticado' }
        });
        return;
      }

      const plantilla = await plantillaHistoriaService.obtenerPlantillaPorId(plantillaId, medicoId);

      if (!plantilla) {
        res.status(404).json({
          success: false,
          error: { message: 'Plantilla no encontrada' }
        });
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: plantilla
      };
      res.json(response);
    } catch (error: any) {
      console.error('Error en obtenerPlantillaPorId:', error);
      res.status(500).json({
        success: false,
        error: { message: error.message || 'Error obteniendo plantilla' }
      });
    }
  };

  /**
   * Crea una nueva plantilla
   * POST /api/v1/plantillas-historias
   */
  crearPlantilla = async (req: Request, res: Response): Promise<void> => {
    try {
      const medicoId = (req as any).user?.medico_id;

      if (!medicoId) {
        res.status(401).json({
          success: false,
          error: { message: 'Médico no autenticado' }
        });
        return;
      }

      const { nombre, descripcion, motivo_consulta_template, diagnostico_template, conclusiones_template, plan_template, activo } = req.body;

      if (!nombre || nombre.trim() === '') {
        res.status(400).json({
          success: false,
          error: { message: 'El nombre de la plantilla es requerido' }
        });
        return;
      }

      const plantilla = await plantillaHistoriaService.crearPlantilla({
        medico_id: medicoId,
        nombre: nombre.trim(),
        descripcion: descripcion?.trim() || null,
        motivo_consulta_template: motivo_consulta_template || null,
        diagnostico_template: diagnostico_template || null,
        conclusiones_template: conclusiones_template || null,
        plan_template: plan_template || null,
        activo: activo !== undefined ? activo : true
      });

      const response: ApiResponse = {
        success: true,
        data: plantilla
      };
      res.status(201).json(response);
    } catch (error: any) {
      console.error('Error en crearPlantilla:', error);
      res.status(500).json({
        success: false,
        error: { message: error.message || 'Error creando plantilla' }
      });
    }
  };

  /**
   * Actualiza una plantilla existente
   * PUT /api/v1/plantillas-historias/:id
   */
  actualizarPlantilla = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params['id'];
      if (!id) {
        res.status(400).json({
          success: false,
          error: { message: 'ID de plantilla requerido' }
        });
        return;
      }
      const plantillaId = parseInt(id);
      const medicoId = (req as any).user?.medico_id;

      if (isNaN(plantillaId)) {
        res.status(400).json({
          success: false,
          error: { message: 'ID de plantilla inválido' }
        });
        return;
      }

      if (!medicoId) {
        res.status(401).json({
          success: false,
          error: { message: 'Médico no autenticado' }
        });
        return;
      }

      const { nombre, descripcion, motivo_consulta_template, diagnostico_template, conclusiones_template, plan_template, activo } = req.body;

      const plantilla = await plantillaHistoriaService.actualizarPlantilla(plantillaId, medicoId, {
        nombre: nombre?.trim(),
        descripcion: descripcion?.trim(),
        motivo_consulta_template,
        diagnostico_template,
        conclusiones_template,
        plan_template,
        activo
      });

      const response: ApiResponse = {
        success: true,
        data: plantilla
      };
      res.json(response);
    } catch (error: any) {
      console.error('Error en actualizarPlantilla:', error);
      res.status(500).json({
        success: false,
        error: { message: error.message || 'Error actualizando plantilla' }
      });
    }
  };

  /**
   * Elimina una plantilla (soft delete)
   * DELETE /api/v1/plantillas-historias/:id
   */
  eliminarPlantilla = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params['id'];
      if (!id) {
        res.status(400).json({
          success: false,
          error: { message: 'ID de plantilla requerido' }
        });
        return;
      }
      const plantillaId = parseInt(id);
      const medicoId = (req as any).user?.medico_id;

      if (isNaN(plantillaId)) {
        res.status(400).json({
          success: false,
          error: { message: 'ID de plantilla inválido' }
        });
        return;
      }

      if (!medicoId) {
        res.status(401).json({
          success: false,
          error: { message: 'Médico no autenticado' }
        });
        return;
      }

      const eliminada = await plantillaHistoriaService.eliminarPlantilla(plantillaId, medicoId);

      if (!eliminada) {
        res.status(404).json({
          success: false,
          error: { message: 'Plantilla no encontrada' }
        });
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: { message: 'Plantilla eliminada exitosamente' }
      };
      res.json(response);
    } catch (error: any) {
      console.error('Error en eliminarPlantilla:', error);
      res.status(500).json({
        success: false,
        error: { message: error.message || 'Error eliminando plantilla' }
      });
    }
  };
}

export default new PlantillaHistoriaController();

