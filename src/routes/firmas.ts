import express from 'express';
import { FirmaController } from '../controllers/firma.controller.js';
import { uploadFirma, uploadSello } from '../middleware/upload.middleware.js';
import { authenticateToken } from '../middleware/auth.js';
import { medicoSecurityMiddleware } from '../middleware/security.js';

const router = express.Router();
const firmaController = new FirmaController();

// Rutas para manejo de firmas digitales
// Solo médicos y administradores pueden gestionar firmas

// POST /api/v1/firmas/:id/subir - Subir firma digital
router.post('/:id/subir', 
  authenticateToken, 
  medicoSecurityMiddleware, 
  uploadFirma.single('firma'), 
  (req: any, res: any) => firmaController.subirFirma(req, res)
);

// POST /api/v1/firmas/:id/sello/subir - Subir sello húmedo (misma carpeta que la firma)
router.post('/:id/sello/subir',
  authenticateToken,
  medicoSecurityMiddleware,
  (req: any, res: any, next: any) => {
    uploadSello.single('sello')(req, res, (err: any) => {
      if (err) {
        console.error('❌ [firmas] Error Multer (sello):', err);
        return res.status(400).json({
          success: false,
          error: { message: err.message || 'Error al subir el archivo del sello. Verifique que sea una imagen (PNG, JPG, máx. 2MB).' }
        });
      }
      next();
    });
  },
  (req: any, res: any) => firmaController.subirSello(req, res)
);

// GET /api/v1/firmas/:id/sello/imagen - Servir imagen del sello húmedo
router.get('/:id/sello/imagen', (req: any, res: any) => firmaController.servirSello(req, res));

// GET /api/v1/firmas/:id/imagen - Servir imagen de la firma digital (sin autenticación para imágenes)
router.get('/:id/imagen', 
  (req: any, res: any) => firmaController.servirFirma(req, res)
);

// GET /api/v1/firmas/:id - Obtener firma digital
router.get('/:id', 
  authenticateToken, 
  medicoSecurityMiddleware, 
  (req: any, res: any) => firmaController.obtenerFirma(req, res)
);

// DELETE /api/v1/firmas/:id - Eliminar firma digital
router.delete('/:id', 
  authenticateToken, 
  medicoSecurityMiddleware, 
  (req: any, res: any) => firmaController.eliminarFirma(req, res)
);

export default router;
