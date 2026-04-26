import { Request, Response } from 'express';
import { ApiResponse } from '../types/index.js';
import menuService from '../services/menu.service.js';

export class MenuController {
  /**
   * GET /api/v1/menu/items
   * Obtiene todos los items del menú (solo admin)
   */
  async getMenuItems(_req: Request, res: Response): Promise<void> {
    try {
      const items = await menuService.getMenuItems();
      res.json({
        success: true,
        data: items
      } as ApiResponse<typeof items>);
    } catch (error) {
      console.error('Error obteniendo items del menú:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error al obtener items del menú' }
      } as ApiResponse<null>);
    }
  }

  /**
   * GET /api/v1/menu/perfil/:perfilNombre
   * Obtiene el menú filtrado por perfil
   */
  async getMenuByPerfil(req: Request, res: Response): Promise<void> {
    try {
      const { perfilNombre } = req.params;
      if (!perfilNombre) {
        res.status(400).json({
          success: false,
          error: { message: 'perfilNombre es requerido' }
        } as ApiResponse<null>);
        return;
      }
      const items = await menuService.getMenuByPerfil(perfilNombre);
      res.json({
        success: true,
        data: items
      } as ApiResponse<typeof items>);
    } catch (error) {
      console.error('Error obteniendo menú por perfil:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error al obtener menú del perfil' }
      } as ApiResponse<null>);
    }
  }

  /**
   * GET /api/v1/admin/menu/perfiles
   * Obtiene todos los perfiles (solo admin)
   */
  async getPerfiles(_req: Request, res: Response): Promise<void> {
    try {
      const perfiles = await menuService.getPerfiles();
      res.json({
        success: true,
        data: perfiles
      } as ApiResponse<typeof perfiles>);
    } catch (error) {
      console.error('Error obteniendo perfiles:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error al obtener perfiles' }
      } as ApiResponse<null>);
    }
  }

  /**
   * GET /api/v1/admin/menu/perfiles/:perfilId/permisos
   * Obtiene permisos de un perfil (solo admin)
   */
  async getPermisosByPerfil(req: Request, res: Response): Promise<void> {
    try {
      const { perfilId } = req.params;
      if (!perfilId) {
        res.status(400).json({
          success: false,
          error: { message: 'perfilId es requerido' }
        } as ApiResponse<null>);
        return;
      }
      const permisos = await menuService.getPermisosByPerfil(parseInt(perfilId));
      res.json({
        success: true,
        data: permisos
      } as ApiResponse<typeof permisos>);
    } catch (error) {
      console.error('Error obteniendo permisos del perfil:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error al obtener permisos del perfil' }
      } as ApiResponse<null>);
    }
  }

  /**
   * PUT /api/v1/admin/menu/perfiles/:perfilId/permisos/:menuItemId
   * Actualiza permisos de un perfil para un item del menú (solo admin)
   */
  async updatePermisos(req: Request, res: Response): Promise<void> {
    try {
      const { perfilId, menuItemId } = req.params;
      if (!perfilId || !menuItemId) {
        res.status(400).json({
          success: false,
          error: { message: 'perfilId y menuItemId son requeridos' }
        } as ApiResponse<null>);
        return;
      }
      const permisos = req.body;

      const updated = await menuService.updatePermisos(
        parseInt(perfilId),
        parseInt(menuItemId),
        permisos
      );

      res.json({
        success: true,
        data: updated
      } as ApiResponse<typeof updated>);
    } catch (error) {
      console.error('Error actualizando permisos:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error al actualizar permisos' }
      } as ApiResponse<null>);
    }
  }

  /**
   * PUT /api/v1/admin/menu/perfiles/:perfilId/permisos
   * Actualiza múltiples permisos de un perfil (solo admin)
   */
  async updatePermisosBulk(req: Request, res: Response): Promise<void> {
    try {
      const { perfilId } = req.params;
      if (!perfilId) {
        res.status(400).json({
          success: false,
          error: { message: 'perfilId es requerido' }
        } as ApiResponse<null>);
        return;
      }
      const { permisos } = req.body;

      if (!Array.isArray(permisos)) {
        res.status(400).json({
          success: false,
          error: { message: 'permisos debe ser un array' }
        } as ApiResponse<null>);
        return;
      }

      await menuService.updatePermisosBulk(parseInt(perfilId), permisos);

      res.json({
        success: true,
        data: { message: 'Permisos actualizados correctamente' }
      } as ApiResponse<{ message: string }>);
    } catch (error) {
      console.error('Error actualizando permisos en bulk:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Error al actualizar permisos' }
      } as ApiResponse<null>);
    }
  }
}

export default new MenuController();

