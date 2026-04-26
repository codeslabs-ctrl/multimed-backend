import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types/index.js';

function parseKeys(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Middleware genérico para validar API Keys para integraciones externas.
 * - Header esperado: X-API-Key
 * - Env var: lista separada por comas (permite rotación) ej:
 *   EXTERNAL_PATIENT_APP_API_KEYS=key1,key2
 */
export function requireExternalApiKey(envVarName: string) {
  return (req: Request, res: Response<ApiResponse>, next: NextFunction): void => {
    const provided = (req.header('x-api-key') || req.header('X-API-Key') || '').trim();
    if (!provided) {
      res.status(401).json({ success: false, error: { message: 'X-API-Key requerido' } });
      return;
    }

    const allowed = parseKeys(process.env[envVarName]);
    if (allowed.length === 0) {
      // Seguridad: si no hay keys configuradas, negar por defecto.
      res.status(503).json({ success: false, error: { message: `External API no configurada (${envVarName})` } });
      return;
    }

    if (!allowed.includes(provided)) {
      res.status(403).json({ success: false, error: { message: 'X-API-Key inválida' } });
      return;
    }

    next();
  };
}


