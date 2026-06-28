import { Request, Response, NextFunction } from 'express';

// Interfaz para extender Request con información de clínica
declare global {
  namespace Express {
    interface Request {
      clinicaAlias?: string;
    }
  }
}

/**
 * Middleware para verificar y establecer la clínica actual
 * Basado en la variable de entorno CLINICA_ALIAS
 */
export const verifyClinica = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const clinicaAlias = process.env['CLINICA_ALIAS'];
    
    if (!clinicaAlias) {
      res.status(500).json({
        success: false,
        message: 'CLINICA_ALIAS no está configurada en las variables de entorno'
      });
      return;
    }

    // Agregar la clínica al request para uso en controladores
    req.clinicaAlias = clinicaAlias;
    
    console.log(`🏥 Clínica actual: ${clinicaAlias}`);
    
    next();
  } catch (error) {
    console.error('Error en middleware de clínica:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * Middleware para verificar que un médico pertenece a la clínica actual
 */
export const verifyMedicoClinica = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const clinicaAlias = req.clinicaAlias;
    const medicoId = req.params['medicoId'] || req.body['medico_id'] || req.query['medico_id'];
    
    if (!medicoId) {
      res.status(400).json({
        success: false,
        message: 'ID de médico requerido'
      });
      return;
    }

    // TODO: Implementar verificación en base de datos
    // Por ahora, permitir el acceso
    console.log(`👨‍⚕️ Verificando médico ${medicoId} en clínica ${clinicaAlias}`);
    
    next();
  } catch (error) {
    console.error('Error verificando médico-clínica:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * Middleware para verificar que una especialidad está disponible en la clínica actual
 */
export const verifyEspecialidadClinica = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const clinicaAlias = req.clinicaAlias;
    const especialidadId = req.params['especialidadId'] || req.body['especialidad_id'] || req.query['especialidad_id'];
    
    if (!especialidadId) {
      res.status(400).json({
        success: false,
        message: 'ID de especialidad requerido'
      });
      return;
    }

    // TODO: Implementar verificación en base de datos
    // Por ahora, permitir el acceso
    console.log(`🏥 Verificando especialidad ${especialidadId} en clínica ${clinicaAlias}`);
    
    next();
  } catch (error) {
    console.error('Error verificando especialidad-clínica:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

/**
 * Función helper para obtener la clínica actual
 */
export const getCurrentClinica = (): string => {
  const clinicaAlias = process.env['CLINICA_ALIAS'];
  if (!clinicaAlias) {
    throw new Error('CLINICA_ALIAS no está configurada');
  }
  return clinicaAlias;
};

/**
 * Función helper para crear filtros automáticos por clínica
 */
export const createClinicaFilter = (clinicaAlias: string) => {
  return {
    clinica_alias: clinicaAlias
  };
};
