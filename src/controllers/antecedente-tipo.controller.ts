import { Request, Response } from 'express';
import { AntecedenteTipoService } from '../services/antecedente-tipo.service.js';
import { MedicoFiltroAntecedente } from '../repositories/antecedente-tipo.repository.js';
import { ApiResponse } from '../types/index.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
  friendlyAntecedenteMedicoTipoMessage,
  postgresErrorCode
} from '../utils/antecedente-medico-tipo-db-message.js';

/** Médico con ficha: solo puede ver/editar ítems con su `medico_id` + globales al completar antecedentes. */
function isRolMedicoConId(user: AuthenticatedRequest['user'] | undefined): boolean {
  return user?.rol === 'medico' && user.medico_id != null;
}

function puedeCrearOEditarCatalogoGlobal(user: AuthenticatedRequest['user'] | undefined): boolean {
  if (!user) return false;
  if (user.rol === 'administrador_clinica' || user.rol === 'secretaria' || user.rol === 'finanzas') return true;
  if (user.rol === 'administrador' && user.clinica_id != null) return true;
  return false;
}

const CODIGO_TIPO_REGEX = /^[a-z][a-z0-9_]*$/;
function isValidCodigoAntecedenteTipo(codigo: string): boolean {
  return codigo.length > 0 && codigo.length <= 64 && CODIGO_TIPO_REGEX.test(codigo);
}

export class AntecedenteTipoController {
  private service: AntecedenteTipoService;

  constructor() {
    this.service = new AntecedenteTipoService();
  }

  async getCategoriaLabels(_req: Request, res: Response<ApiResponse>): Promise<void> {
    try {
      const data = await this.service.getCategoriaLabels();
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: { message: (error as Error).message }
      });
    }
  }

  async getAll(_req: Request, res: Response<ApiResponse>): Promise<void> {
    try {
      const data = await this.service.getAll();
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: { message: (error as Error).message }
      });
    }
  }

  async getByTipo(
    req: Request<{}, ApiResponse, {}, { tipo?: string; activo?: string; medicoId?: string; todos?: string }>,
    res: Response<ApiResponse>
  ): Promise<void> {
    try {
      const tipo = (req.query.tipo || '').trim();
      if (!tipo) {
        res.status(400).json({ success: false, error: { message: 'Query "tipo" es requerido.' } });
        return;
      }
      const soloActivos = req.query.activo !== 'false';
      const user = (req as AuthenticatedRequest).user;
      const todosParam = req.query.todos === '1' || req.query.todos === 'true';
      const midRaw = (req.query.medicoId as string | undefined)?.trim();
      let filtro: MedicoFiltroAntecedente = 'solo_global';

      if (todosParam && puedeCrearOEditarCatalogoGlobal(user)) {
        filtro = 'all';
      } else if (midRaw !== undefined && midRaw !== '') {
        let n = parseInt(midRaw, 10);
        if (!Number.isFinite(n) || n <= 0) {
          res.status(400).json({ success: false, error: { message: 'Query "medicoId" inválido.' } });
          return;
        }
        if (user && isRolMedicoConId(user) && user.medico_id != null && n !== user.medico_id) {
          n = user.medico_id;
        }
        filtro = { globalYMedico: n };
      } else if (user && isRolMedicoConId(user) && user.medico_id != null) {
        filtro = { globalYMedico: user.medico_id };
      } else {
        filtro = 'solo_global';
      }

      const data = await this.service.getByTipo(tipo, soloActivos, filtro);
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: { message: (error as Error).message }
      });
    }
  }

  async getById(req: Request<{ id: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ success: false, error: { message: 'ID inválido.' } });
        return;
      }
      const data = await this.service.getById(id);
      if (!data) {
        res.status(404).json({ success: false, error: { message: 'No encontrado.' } });
        return;
      }
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: { message: (error as Error).message }
      });
    }
  }

  async create(req: Request, res: Response<ApiResponse>): Promise<void> {
    try {
      const user = (req as AuthenticatedRequest).user;
      const body: Record<string, unknown> = { ...req.body };

      if (isRolMedicoConId(user)) {
        body['medico_id'] = user!.medico_id;
      } else if (puedeCrearOEditarCatalogoGlobal(user)) {
        if (body['medico_id'] === undefined) body['medico_id'] = null;
        const mid = body['medico_id'] as number | null | undefined;
        if (mid != null) {
          const n = Number(mid);
          if (!Number.isFinite(n) || n <= 0) {
            res.status(400).json({ success: false, error: { message: 'medico_id inválido' } });
            return;
          }
          body['medico_id'] = n;
        } else {
          body['medico_id'] = null;
        }
      } else {
        res.status(403).json({ success: false, error: { message: 'Sin permiso para crear antecedentes' } });
        return;
      }

      const data = await this.service.create(body as any);
      res.status(201).json({ success: true, data });
    } catch (error) {
      const friendly = friendlyAntecedenteMedicoTipoMessage(error);
      if (friendly) {
        const status = postgresErrorCode(error) === '23505' ? 409 : 400;
        res.status(status).json({ success: false, error: { message: friendly } });
        return;
      }
      res.status(500).json({
        success: false,
        error: { message: (error as Error).message }
      });
    }
  }

  async update(req: Request<{ id: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ success: false, error: { message: 'ID inválido.' } });
        return;
      }
      const user = (req as AuthenticatedRequest).user;
      const existing = await this.service.getById(id);
      if (!existing) {
        res.status(404).json({ success: false, error: { message: 'No encontrado.' } });
        return;
      }
      const canGlobal = puedeCrearOEditarCatalogoGlobal(user);
      if (isRolMedicoConId(user)) {
        if (existing.medico_id == null) {
          res
            .status(403)
            .json({ success: false, error: { message: 'No puede editar ítems de catálogo de clínica' } });
          return;
        }
        if (existing.medico_id !== user!.medico_id) {
          res.status(403).json({ success: false, error: { message: 'No autorizado' } });
          return;
        }
        const body: Record<string, unknown> = { ...req.body };
        body['medico_id'] = user!.medico_id;
        const data = await this.service.update(id, body as any);
        res.json({ success: true, data });
        return;
      }
      if (!canGlobal) {
        res.status(403).json({ success: false, error: { message: 'No autorizado' } });
        return;
      }
      const data = await this.service.update(id, req.body);
      res.json({ success: true, data });
    } catch (error) {
      const friendly = friendlyAntecedenteMedicoTipoMessage(error);
      if (friendly) {
        const status = postgresErrorCode(error) === '23505' ? 409 : 400;
        res.status(status).json({ success: false, error: { message: friendly } });
        return;
      }
      res.status(500).json({
        success: false,
        error: { message: (error as Error).message }
      });
    }
  }

  async delete(req: Request<{ id: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ success: false, error: { message: 'ID inválido.' } });
        return;
      }
      const user = (req as AuthenticatedRequest).user;
      const existing = await this.service.getById(id);
      if (!existing) {
        res.status(404).json({ success: false, error: { message: 'No encontrado.' } });
        return;
      }
      if (isRolMedicoConId(user)) {
        if (existing.medico_id == null) {
          res
            .status(403)
            .json({ success: false, error: { message: 'No puede eliminar ítems de catálogo de clínica' } });
          return;
        }
        if (existing.medico_id !== user!.medico_id) {
          res.status(403).json({ success: false, error: { message: 'No autorizado' } });
          return;
        }
      } else if (!puedeCrearOEditarCatalogoGlobal(user)) {
        res.status(403).json({ success: false, error: { message: 'No autorizado' } });
        return;
      }
      const deleted = await this.service.delete(id);
      if (!deleted) {
        res.status(404).json({ success: false, error: { message: 'No encontrado.' } });
        return;
      }
      res.json({ success: true, data: { message: 'Eliminado.' } });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: { message: (error as Error).message }
      });
    }
  }

  /**
   * Lista todas las categorías (tipos) `antecedentes_tipo_label`, activas o no, para administración.
   * Solo quienes gestionan catálogo de clínica.
   */
  async listTipoLabels(_req: Request, res: Response<ApiResponse>): Promise<void> {
    try {
      const user = (_req as AuthenticatedRequest).user;
      if (!puedeCrearOEditarCatalogoGlobal(user)) {
        res.status(403).json({ success: false, error: { message: 'No autorizado' } });
        return;
      }
      const data = await this.service.getAllTipoLabels();
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: { message: (error as Error).message }
      });
    }
  }

  async createTipoLabel(req: Request, res: Response<ApiResponse>): Promise<void> {
    try {
      const user = (req as AuthenticatedRequest).user;
      if (!puedeCrearOEditarCatalogoGlobal(user)) {
        res.status(403).json({ success: false, error: { message: 'No autorizado' } });
        return;
      }
      const codigo = String(req.body?.codigo ?? '').trim().toLowerCase();
      const etiqueta = String(req.body?.etiqueta ?? '').trim();
      const orden = parseInt(String(req.body?.orden ?? 0), 10);
      const activo = req.body?.activo !== false;
      if (!isValidCodigoAntecedenteTipo(codigo)) {
        res.status(400).json({
          success: false,
          error: {
            message:
              'Código inválido: use solo minúsculas, números y guión bajo, empezando con letra (máx. 64), p. ej. alergias_medicas'
          }
        });
        return;
      }
      if (!etiqueta) {
        res.status(400).json({ success: false, error: { message: 'La etiqueta es requerida.' } });
        return;
      }
      if (!Number.isFinite(orden)) {
        res.status(400).json({ success: false, error: { message: 'Orden inválido.' } });
        return;
      }
      const data = await this.service.createTipoLabel({ codigo, etiqueta, orden, activo });
      res.status(201).json({ success: true, data });
    } catch (error) {
      const code = postgresErrorCode(error);
      if (code === '23505') {
        res.status(409).json({ success: false, error: { message: 'Ya existe una categoría con ese código.' } });
        return;
      }
      res.status(500).json({
        success: false,
        error: { message: (error as Error).message }
      });
    }
  }

  async updateTipoLabel(req: Request<{ id: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      const user = (req as AuthenticatedRequest).user;
      if (!puedeCrearOEditarCatalogoGlobal(user)) {
        res.status(403).json({ success: false, error: { message: 'No autorizado' } });
        return;
      }
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ success: false, error: { message: 'ID inválido.' } });
        return;
      }
      const body = req.body as { etiqueta?: string; orden?: unknown; activo?: boolean };
      const patch: { etiqueta?: string; orden?: number; activo?: boolean } = {};
      if (body.etiqueta !== undefined) {
        const etiqueta = String(body.etiqueta).trim();
        if (!etiqueta) {
          res.status(400).json({ success: false, error: { message: 'La etiqueta no puede quedar vacía.' } });
          return;
        }
        patch.etiqueta = etiqueta;
      }
      if (body.orden !== undefined) {
        const orden = parseInt(String(body.orden), 10);
        if (!Number.isFinite(orden)) {
          res.status(400).json({ success: false, error: { message: 'Orden inválido.' } });
          return;
        }
        patch.orden = orden;
      }
      if (body.activo !== undefined) {
        patch.activo = Boolean(body.activo);
      }
      if (Object.keys(patch).length === 0) {
        res.status(400).json({ success: false, error: { message: 'Nada que actualizar.' } });
        return;
      }
      const data = await this.service.updateTipoLabel(id, patch);
      res.json({ success: true, data });
    } catch (error) {
      if ((error as Error).message === 'NOT_FOUND') {
        res.status(404).json({ success: false, error: { message: 'No encontrado.' } });
        return;
      }
      res.status(500).json({
        success: false,
        error: { message: (error as Error).message }
      });
    }
  }

  async deleteTipoLabel(req: Request<{ id: string }>, res: Response<ApiResponse>): Promise<void> {
    try {
      const user = (req as AuthenticatedRequest).user;
      if (!puedeCrearOEditarCatalogoGlobal(user)) {
        res.status(403).json({ success: false, error: { message: 'No autorizado' } });
        return;
      }
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ success: false, error: { message: 'ID inválido.' } });
        return;
      }
      const result = await this.service.deleteTipoLabel(id);
      if (result === 'not_found') {
        res.status(404).json({ success: false, error: { message: 'No encontrado.' } });
        return;
      }
      res.json({ success: true, data: { message: 'Categoría eliminada.' } });
    } catch (error) {
      if ((error as Error).message === 'ANTEC_TIPO_IN_USE') {
        res.status(409).json({
          success: false,
          error: { message: 'No se puede eliminar: hay antecedentes o ítems de catálogo asociados a este tipo.' }
        });
        return;
      }
      res.status(500).json({
        success: false,
        error: { message: (error as Error).message }
      });
    }
  }
}
