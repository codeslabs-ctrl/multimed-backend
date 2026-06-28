import { Request, Response } from 'express';
import { ClinicaService } from '../services/clinica.service.js';
import { isAdminClinica } from '../utils/roles.js';

export class ClinicaController {
  private clinicaService: ClinicaService;

  constructor() {
    this.clinicaService = new ClinicaService();
  }

  /**
   * Obtener información de la clínica actual
   */
  getCurrentClinica = async (_req: Request, res: Response): Promise<void> => {
    try {
      const clinica = await this.clinicaService.getCurrentClinicaInfo();
      
      if (!clinica) {
        res.status(404).json({
          success: false,
          message: 'Clínica no encontrada'
        });
        return;
      }

      res.json({
        success: true,
        data: clinica
      });
    } catch (error) {
      console.error('Error en getCurrentClinica:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  /**
   * Obtener médicos de la clínica actual
   */
  getMedicosByClinica = async (_req: Request, res: Response): Promise<void> => {
    try {
      const medicos = await this.clinicaService.getMedicosByClinica();
      
      res.json({
        success: true,
        data: medicos
      });
    } catch (error) {
      console.error('Error en getMedicosByClinica:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  /**
   * Obtener especialidades de la clínica actual
   */
  getEspecialidadesByClinica = async (_req: Request, res: Response): Promise<void> => {
    try {
      const especialidades = await this.clinicaService.getEspecialidadesByClinica();
      
      res.json({
        success: true,
        data: especialidades
      });
    } catch (error) {
      console.error('Error en getEspecialidadesByClinica:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  /**
   * Verificar que un médico pertenece a la clínica actual
   */
  verifyMedicoClinica = async (req: Request, res: Response): Promise<void> => {
    try {
      const { medicoId } = req.params;
      
      if (!medicoId) {
        res.status(400).json({
          success: false,
          message: 'ID de médico requerido'
        });
        return;
      }

      const belongs = await this.clinicaService.verifyMedicoClinica(parseInt(medicoId));
      
      res.json({
        success: true,
        data: {
          medico_id: parseInt(medicoId),
          belongs_to_clinica: belongs
        }
      });
    } catch (error) {
      console.error('Error en verifyMedicoClinica:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  /**
   * Verificar que una especialidad está disponible en la clínica actual
   */
  verifyEspecialidadClinica = async (req: Request, res: Response): Promise<void> => {
    try {
      const { especialidadId } = req.params;
      
      if (!especialidadId) {
        res.status(400).json({
          success: false,
          message: 'ID de especialidad requerido'
        });
        return;
      }

      const available = await this.clinicaService.verifyEspecialidadClinica(parseInt(especialidadId));
      
      res.json({
        success: true,
        data: {
          especialidad_id: parseInt(especialidadId),
          available_in_clinica: available
        }
      });
    } catch (error) {
      console.error('Error en verifyEspecialidadClinica:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  /**
   * Asignar médico a la clínica actual
   */
  asignarMedicoClinica = async (req: Request, res: Response): Promise<void> => {
    try {
      const { medicoId } = req.body;
      
      if (!medicoId) {
        res.status(400).json({
          success: false,
          message: 'ID de médico requerido'
        });
        return;
      }

      const success = await this.clinicaService.asignarMedicoClinica(medicoId);
      
      if (!success) {
        res.status(400).json({
          success: false,
          message: 'Error asignando médico a la clínica'
        });
        return;
      }

      res.json({
        success: true,
        message: 'Médico asignado correctamente a la clínica'
      });
    } catch (error) {
      console.error('Error en asignarMedicoClinica:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  /**
   * Asignar especialidad a la clínica actual
   */
  asignarEspecialidadClinica = async (req: Request, res: Response): Promise<void> => {
    try {
      const { especialidadId } = req.body;
      
      if (!especialidadId) {
        res.status(400).json({
          success: false,
          message: 'ID de especialidad requerido'
        });
        return;
      }

      const success = await this.clinicaService.asignarEspecialidadClinica(especialidadId);
      
      if (!success) {
        res.status(400).json({
          success: false,
          message: 'Error asignando especialidad a la clínica'
        });
        return;
      }

      res.json({
        success: true,
        message: 'Especialidad asignada correctamente a la clínica'
      });
    } catch (error) {
      console.error('Error en asignarEspecialidadClinica:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  /**
   * Catálogo para alta de médicos: admin de clínica o secretaría con clinica_id (una); plataforma usa /clinicas-platform.
   */
  listCatalogo = async (req: Request, res: Response): Promise<void> => {
    try {
      const u = (req as { user?: { rol?: string; clinica_id?: number | null } }).user;
      const rol = (u?.rol || '').trim();
      const scopedClinica =
        u?.clinica_id != null && (isAdminClinica(rol) || rol === 'secretaria');
      if (scopedClinica) {
        const c = await this.clinicaService.getClinicaById(Number(u.clinica_id));
        res.json({ success: true, data: c ? [c] : [] });
        return;
      }
      const rows = await this.clinicaService.listClinicasActivas();
      res.json({ success: true, data: rows });
    } catch (error) {
      console.error('Error en listCatalogo:', error);
      res.status(500).json({
        success: false,
        error: { message: (error as Error).message }
      });
    }
  };

  /**
   * Marca de clínica para navbar (JWT): `clinica_id` del usuario o primera clínica del médico en `medicos_clinicas`.
   */
  getContextForUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const u = (req as { user?: { clinica_id?: number | null; medico_id?: number | null } }).user;
      const data = await this.clinicaService.getClinicaBrandingForSession(u?.clinica_id, u?.medico_id ?? null);
      res.json({ success: true, data });
    } catch (error) {
      console.error('Error en getContextForUser:', error);
      res.status(500).json({
        success: false,
        error: { message: (error as Error).message }
      });
    }
  };
}
