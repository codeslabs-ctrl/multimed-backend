import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ApiResponse } from '../types/index.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: number;
    username: string;
    rol: string;
    medico_id?: number;
    /** MultiMed: alcance por clínica (JWT). */
    clinica_id?: number | null;
  };
}

export const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    const response: ApiResponse = {
      success: false,
      error: { message: 'Token de acceso requerido' }
    };
    res.status(401).json(response);
    return;
  }

  try {
    const secret = process.env['JWT_SECRET'] || 'femimed-secret-key';
    const decoded = jwt.verify(token, secret) as any;
    
    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      rol: decoded.rol,
      medico_id: decoded.medico_id,
      clinica_id: decoded.clinica_id ?? null
    };
    
    next();
  } catch (error: any) {
    // Determinar si es expiración o token inválido
    const isExpired = error.name === 'TokenExpiredError';
    const response: ApiResponse = {
      success: false,
      error: { 
        message: isExpired ? 'Token expirado' : 'Token inválido',
        code: isExpired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID'
      }
    };
    // Usar 401 para token expirado/inválido (no 403)
    res.status(401).json(response);
  }
};
