import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import Joi from 'joi';
import jwt from 'jsonwebtoken';
import { authenticateToken as authAuthenticateToken } from './auth.js';
import { isPlataformaAdminUser } from '../utils/roles.js';

// Extender Request interface
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

// Headers de seguridad
// Deshabilitar CORP en Helmet - lo manejamos manualmente en el middleware de archivos estáticos
export const securityHeaders = helmet({
  crossOriginResourcePolicy: false,
  crossOriginEmbedderPolicy: false
});

// CORS configurado para DemoMed
const allowedOrigins = [
  process.env['FRONTEND_URL'] || 'http://localhost:4200',
  'https://demomed.codes-labs.com',
  'https://www.demomed.codes-labs.com',
  'http://localhost:4200', // Desarrollo Angular por defecto
  'http://localhost:3000'  // Desarrollo frontend alternativo
].filter(Boolean); // Elimina valores undefined/null

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Permitir requests sin origen (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }
    
    // Verificar si el origen está permitido
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`⚠️ CORS bloqueado para origen: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Content-Length']
});

// Rate limiting eliminado - No se aplican límites de tiempo a las peticiones

// Middleware de autenticación JWT
export const authenticateToken = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Token de acceso requerido' });
    return;
  }

  jwt.verify(token, process.env['JWT_SECRET'] || 'default-secret', (err: any, user: any) => {
    if (err) {
      res.status(403).json({ error: 'Token inválido' });
      return;
    }
    req.user = user;
    next();
  });
};

// Middleware de autorización por roles
export const requireRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Usuario no autenticado' });
      return;
    }

    const userRole = (req.user as any).rol;
    
    // Mapeo de roles de la base de datos a roles del middleware
    const roleMapping: { [key: string]: string[] } = {
      'administrador': [
        'admin',
        'administrador',
        'administrador_plataforma',
        'administrador_clinica'
      ],
      'medico': ['medico'],
      'admin': ['admin', 'administrador', 'administrador_plataforma', 'administrador_clinica']
    };
    
    // Verificar si el rol del usuario está permitido
    const allowedRoles = roles.flatMap(role => roleMapping[role] || [role]);
    
    if (!allowedRoles.includes(userRole)) {
      console.log(`🚫 Acceso denegado: Usuario rol="${userRole}", Roles requeridos=${roles.join(',')}`);
      res.status(403).json({ 
        error: 'Acceso denegado',
        details: `Rol requerido: ${roles.join(' o ')}, Rol actual: ${userRole}`
      });
      return;
    }

    next();
  };
};

/**
 * Superadmin de plataforma no usa rutas operativas de una clínica (médicos, listados filtrados, etc.).
 * Debe ir después de authenticateToken.
 */
export const rejectPlataformaEnOperativaClinica = (req: Request, res: Response, next: NextFunction): void => {
  const u = req.user as { rol?: string; clinica_id?: number | null } | undefined;
  if (isPlataformaAdminUser(u)) {
    res.status(403).json({
      success: false,
      error: {
        message:
          'El administrador de plataforma solo gestiona clínicas a nivel global. Use un administrador de clínica o secretaría para esta operación.'
      }
    });
    return;
  }
  next();
};

// Middleware de validación de input (respuesta con mismo formato que el controller: success + error.message)
export const validateInput = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error } = schema.validate(req.body);
    if (error) {
      const msg = error.details.map(d => d.message).join('; ') || 'Error de validación';
      res.status(400).json({ success: false, error: { message: msg } });
      return;
    }
    next();
  };
};

// Validación específica para login
export const validateLogin = validateInput(Joi.object({
  username: Joi.string().min(3).required(),
  password: Joi.string().min(6).required()
}));

// Validación específica para informes médicos (titulo y tipo_informe opcionales para evitar 400).
// creado_por es opcional: el controller lo rellena con medico_id o req.user.userId (p. ej. desde el chatbot).
export const validateInforme = validateInput(Joi.object({
  titulo: Joi.string().min(0).max(200).allow('', null).optional(),
  tipo_informe: Joi.string().allow('', null).optional(),
  contenido: Joi.string().min(10).max(100000).required(),
  paciente_id: Joi.number().required(),
  medico_id: Joi.number().required(),
  template_id: Joi.number().optional(),
  estado: Joi.string().valid('borrador', 'finalizado', 'firmado', 'enviado').default('borrador'),
  fecha_emision: Joi.string().allow('').optional(),
  observaciones: Joi.string().allow('').optional(),
  creado_por: Joi.number().optional()
}).unknown(true));

// Validación para actualización de informes (campos opcionales)
export const validateInformeUpdate = validateInput(Joi.object({
  titulo: Joi.string().allow('', null).max(200).optional(),
  tipo_informe: Joi.string().allow('', null).optional(),
  contenido: Joi.string().min(0).allow('', null).optional(),
  paciente_id: Joi.number().optional(),
  medico_id: Joi.number().optional(),
  template_id: Joi.number().optional(),
  estado: Joi.string().valid('borrador', 'finalizado', 'firmado', 'enviado').optional(),
  fecha_emision: Joi.string().allow('').optional(),
  fecha_envio: Joi.string().isoDate().optional(),
  observaciones: Joi.string().allow('').optional(),
  creado_por: Joi.number().optional(),
  clinica_atencion_id: Joi.number().allow(null).optional()
}).unknown(true));

// Validación específica para pacientes (solo datos básicos). unknown(true) permite campos extra del formulario.
export const validatePaciente = validateInput(Joi.object({
  nombres: Joi.string().min(2).required(),
  apellidos: Joi.string().min(2).required(),
  cedula: Joi.string().min(7).optional(),
  email: Joi.string().email().required(),
  telefono: Joi.string().min(8).required(),
  edad: Joi.number().integer().min(0).max(150).required(),
  sexo: Joi.string().valid('Masculino', 'Femenino', 'Otro').required(),
  remitido_por: Joi.string().max(150).allow('').optional(),
  activo: Joi.boolean().optional()
}).unknown(true));

// Validación para actualización de pacientes. unknown(true) evita 400 cuando el front envía id, fecha_creacion, etc.
// allow('') en strings opcionales para que campos vacíos del formulario no fallen.
export const validatePacienteUpdate = validateInput(Joi.object({
  nombres: Joi.string().min(2).allow('').optional(),
  apellidos: Joi.string().min(2).allow('').optional(),
  cedula: Joi.string().min(7).allow('').optional(),
  email: Joi.string().email().allow('').optional(),
  telefono: Joi.string().min(8).allow('').optional(),
  edad: Joi.number().integer().min(0).max(150).optional(),
  sexo: Joi.string().valid('Masculino', 'Femenino', 'Otro').optional(),
  remitido_por: Joi.string().max(150).allow('').optional(),
  motivo_consulta: Joi.string().allow('').optional(),
  diagnostico: Joi.string().allow('').optional(),
  conclusiones: Joi.string().allow('').optional(),
  plan: Joi.string().allow('').optional()
}).unknown(true));

// Validación específica para consultas
export const validateConsulta = validateInput(Joi.object({
  paciente_id: Joi.number().required(),
  medico_id: Joi.number().required(),
  fecha_consulta: Joi.date().required(),
  motivo: Joi.string().min(5).required(),
  estado: Joi.string().valid('programada', 'en_proceso', 'completada', 'cancelada').default('programada')
}));

// Middleware de seguridad para autenticación
export const authSecurityMiddleware = [authenticateToken];

// Middleware de seguridad para médicos
export const medicoSecurityMiddleware = [authAuthenticateToken, requireRole(['medico', 'administrador_clinica'])];

/** Operativa dentro de clínica (excluye superadmin plataforma). Antes: solo "administrador". */
export const clinicOperationalSecurityMiddleware = [
  authAuthenticateToken,
  rejectPlataformaEnOperativaClinica,
  requireRole(['administrador_clinica', 'secretaria', 'finanzas'])
];

// Alias: rutas que antes usaban adminSecurityMiddleware
export const adminSecurityMiddleware = clinicOperationalSecurityMiddleware;

// Middleware de seguridad para secretaria
export const secretariaSecurityMiddleware = [authAuthenticateToken, requireRole(['secretaria', 'administrador_clinica'])];

// Middleware de seguridad para finanzas
export const finanzasSecurityMiddleware = [authAuthenticateToken, requireRole(['finanzas', 'administrador_clinica'])];

// Middleware para médicos y secretaria (acceso a pacientes/consultas)
export const medicoSecretariaMiddleware = [
  authAuthenticateToken,
  rejectPlataformaEnOperativaClinica,
  requireRole(['medico', 'secretaria', 'administrador_clinica'])
];

// Middleware para roles que pueden ver reportes
export const reportesSecurityMiddleware = [
  authAuthenticateToken,
  rejectPlataformaEnOperativaClinica,
  requireRole(['medico', 'secretaria', 'finanzas', 'administrador_clinica'])
];

export const eliminarMedicoSecurityMiddleware = [authAuthenticateToken, requireRole(['administrador_clinica', 'secretaria'])];

/** Alta/edición de médicos: solo admin de clínica y secretaría (no plataforma). */
export const gestionMedicosSecurityMiddleware = [authAuthenticateToken, requireRole(['administrador_clinica', 'secretaria'])];

/** Solo superadmin de plataforma (`administrador_plataforma` o legado `administrador` sin clinica_id en JWT). */
export const requirePlataformaAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ success: false, error: { message: 'Usuario no autenticado' } });
    return;
  }
  if (!isPlataformaAdminUser(req.user as { rol?: string; clinica_id?: number | null })) {
    console.log(
      `🚫 requirePlataformaAdmin: denegado rol="${(req.user as any).rol}" clinica_id=${(req.user as any).clinica_id}`
    );
    res.status(403).json({
      success: false,
      error: {
        message: 'Acceso denegado',
        details: 'Se requiere administrador de plataforma'
      }
    });
    return;
  }
  next();
};

/** Solo superadmin: crear/editar clínicas a nivel plataforma. */
export const platformAdminSecurityMiddleware = [authAuthenticateToken, requirePlataformaAdmin];