import { Request, Response, NextFunction } from 'express';

// Middleware para verificar roles específicos
export const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;
    
    if (!user) {
      res.status(401).json({
        success: false,
        error: { message: 'Usuario no autenticado' }
      });
      return;
    }

    if (!allowedRoles.includes(user.rol)) {
      res.status(403).json({
        success: false,
        error: { message: 'Acceso denegado: Rol insuficiente' }
      });
      return;
    }

    next();
  };
};

// Middleware específico para finanzas (admin clínica y finanzas ven todo; médico solo sus datos)
export const requireFinanzasRole = requireRole(['finanzas', 'administrador_clinica', 'medico']);

// Middleware específico para médicos
export const requireMedicoRole = requireRole(['medico', 'administrador_clinica']);

/** Gestión de menús/perfiles: operación de clínica (no superadmin plataforma). */
export const requireAdminRole = requireRole(['administrador_clinica']);

