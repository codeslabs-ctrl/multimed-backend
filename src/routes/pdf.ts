import { Router } from 'express';
import { PDFController } from '../controllers/pdf.controller';
import { authenticateToken } from '../middleware/auth';
import { verifyClinica } from '../middleware/clinica.middleware';

const router = Router();
const pdfController = new PDFController();

// Aplicar middleware de autenticación y clínica a todas las rutas
router.use(authenticateToken);
router.use(verifyClinica);

/**
 * @route GET /api/v1/pdf/informe/:id
 * @desc Genera y descarga un PDF de un informe médico
 * @access Private
 */
router.get('/informe/:id', pdfController.generarPDFInforme.bind(pdfController));

/**
 * POST /api/v1/pdf/receta-medico/enviar-email
 * Mismo cuerpo que receta-medico + email (destinatario).
 */
router.post('/receta-medico/enviar-email', pdfController.enviarRecetaMedicoPorEmail.bind(pdfController));

/**
 * POST /api/v1/pdf/receta-medico
 * Genera PDF de récipe o indicaciones (solo médico autenticado).
 */
router.post('/receta-medico', pdfController.generarPDFRecetaMedico.bind(pdfController));

export default router;


