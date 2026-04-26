import { Router } from 'express';
import { FinanzasController } from '../controllers/finanzas.controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireFinanzasRole } from '../middleware/roleAuth.js';

const router = Router();

// Todas las rutas requieren autenticación y rol de finanzas
router.use(authenticateToken);
router.use(requireFinanzasRole);

// Obtener consultas financieras
router.post('/consultas', FinanzasController.getConsultasFinancieras);

// Obtener resumen financiero
router.post('/resumen', FinanzasController.getResumenFinanciero);

// Marcar consulta como pagada
router.post('/consultas/:id/pagar', FinanzasController.marcarConsultaPagada);

// Exportar reporte
router.post('/exportar', FinanzasController.exportarReporte);

// Exportar reporte avanzado
router.post('/exportar-avanzado', FinanzasController.exportarReporteAvanzado);

export default router;
