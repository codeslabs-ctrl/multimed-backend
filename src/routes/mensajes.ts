import { Router } from 'express';
import { MensajeController } from '../controllers/mensaje.controller.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// Aplicar autenticación a todas las rutas de mensajes
router.use(authenticateToken);

// Obtener todos los mensajes
router.get('/', MensajeController.getMensajes);

// Obtener pacientes para difusión (DEBE estar antes de /:id)
router.get('/pacientes', MensajeController.getPacientesParaDifusion);

// Obtener estadísticas (DEBE estar antes de /:id)
router.get('/estadisticas', MensajeController.getEstadisticas);

// Sincronizar contadores
router.post('/sincronizar-contadores', MensajeController.sincronizarContadores);

// Diagnosticar destinatarios de un mensaje
router.get('/:id/diagnosticar', MensajeController.diagnosticarDestinatarios);

// Crear mensaje
router.post('/', MensajeController.crearMensaje);

// Obtener mensaje por ID
router.get('/:id', MensajeController.getMensajeById);

// Actualizar mensaje
router.put('/:id', MensajeController.actualizarMensaje);

// Eliminar mensaje
router.delete('/:id', MensajeController.eliminarMensaje);

// Enviar mensaje
router.post('/:id/enviar', MensajeController.enviarMensaje);

// Programar mensaje
router.post('/:id/programar', MensajeController.programarMensaje);

// Obtener destinatarios de un mensaje
router.get('/:id/destinatarios', MensajeController.getDestinatarios);

// Obtener destinatarios actuales con información completa
router.get('/:id/destinatarios-actuales', MensajeController.getDestinatariosActuales);

// Agregar nuevos destinatarios
router.post('/:id/destinatarios/agregar', MensajeController.agregarDestinatarios);

// Eliminar destinatario específico
router.delete('/:id/destinatarios/:pacienteId', MensajeController.eliminarDestinatario);

// Duplicar mensaje
router.post('/:id/duplicar', MensajeController.duplicarMensaje);

export default router;
