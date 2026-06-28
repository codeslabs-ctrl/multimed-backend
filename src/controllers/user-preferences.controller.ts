import { Request, Response } from 'express';
import { ApiResponse } from '../types/index.js';
import { UserPreferencesService } from '../services/user-preferences.service.js';

export class UserPreferencesController {
  private prefsService: UserPreferencesService;

  constructor() {
    this.prefsService = new UserPreferencesService();
  }

  getMyPreferences = async (req: Request, res: Response<ApiResponse>): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, error: { message: 'Usuario no autenticado' } });
        return;
      }

      const preferences = await this.prefsService.getPreferences(Number(userId));
      res.json({ success: true, data: { preferences } });
    } catch (error) {
      res.status(500).json({ success: false, error: { message: (error as Error).message } });
    }
  };

  updateMyPreference = async (req: Request, res: Response<ApiResponse>): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, error: { message: 'Usuario no autenticado' } });
        return;
      }

      const { key, value } = req.body || {};
      const saved = await this.prefsService.setPreference(Number(userId), key, value);

      res.json({
        success: true,
        data: {
          message: 'Preferencia guardada',
          key: saved.key,
          value: saved.value
        }
      });
    } catch (error) {
      const msg = (error as Error).message;
      const status = msg.includes('debe') || msg.includes('requerida') || msg.includes('larga') ? 400 : 500;
      res.status(status).json({ success: false, error: { message: msg } });
    }
  };
}


