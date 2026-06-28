import { Router } from 'express';
import { ArchivoController, uploadMiddleware } from '../controllers/archivo.controller.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Subir archivo
router.post('/upload', authenticateToken, uploadMiddleware, ArchivoController.uploadArchivo);

// Obtener archivos por historia
router.get('/historia/:historiaId', authenticateToken, ArchivoController.getArchivosByHistoria);

// Obtener archivo por ID
router.get('/:id', authenticateToken, ArchivoController.getArchivoById);

// Actualizar archivo
router.put('/:id', authenticateToken, ArchivoController.updateArchivo);

// Eliminar archivo
router.delete('/:id', authenticateToken, ArchivoController.deleteArchivo);

// Descargar archivo
router.get('/:id/download', authenticateToken, ArchivoController.downloadArchivo);

export default router;
