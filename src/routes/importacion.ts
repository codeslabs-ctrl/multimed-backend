import express, { Request, Response, NextFunction } from 'express';
import { ImportacionController, uploadWordFiles, uploadSingleWordFile } from '../controllers/importacion.controller.js';
import { medicoSecretariaMiddleware } from '../middleware/security.js';
import { ApiResponse } from '../types/index.js';

const router = express.Router();
const importacionController = new ImportacionController();

// Middleware para manejar errores de multer
const handleMulterError = (err: any, _req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  if (err) {
    console.error('❌ Error en multer:', err);
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({
        success: false,
        error: { message: 'El archivo es demasiado grande. Tamaño máximo: 10MB' }
      });
      return;
    }
    if (err.message && err.message.includes('Solo se permiten archivos Word')) {
      res.status(400).json({
        success: false,
        error: { message: err.message }
      });
      return;
    }
    res.status(400).json({
      success: false,
      error: { message: err.message || 'Error al procesar el archivo' }
    });
    return;
  }
  next();
};

// Ruta para importar un solo documento
router.post('/single', 
  medicoSecretariaMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    uploadSingleWordFile(req, res, (err: any) => {
      if (err) {
        return handleMulterError(err, req, res as Response<ApiResponse>, next);
      }
      next();
    });
  },
  (req: any, res: any) => importacionController.importarDocumento(req, res)
);

// Ruta para importar múltiples documentos
router.post('/multiple', 
  (req: Request, _res: Response, next: NextFunction) => {
    console.log('📥 Petición recibida en /importacion/multiple');
    console.log('📋 Headers:', JSON.stringify(req.headers, null, 2));
    next();
  },
  ...medicoSecretariaMiddleware,
  (req: Request, res: Response, next: NextFunction) => {
    console.log('📎 Procesando archivos con multer...');
    uploadWordFiles(req, res, (err: any) => {
      if (err) {
        return handleMulterError(err, req, res as Response<ApiResponse>, next);
      }
      console.log('✅ Archivos procesados correctamente');
      next();
    });
  },
  (req: any, res: any) => {
    console.log('🚀 Llamando a importarMultiplesDocumentos');
    importacionController.importarMultiplesDocumentos(req, res);
  }
);

export default router;

