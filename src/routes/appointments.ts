import express from 'express';
import { AppointmentController } from '../controllers/appointment.controller.js';

const router = express.Router();
const appointmentController = new AppointmentController();

// Appointment routes
router.get('/', (req, res) => appointmentController.getAllAppointments(req, res));
router.get('/statistics', (req, res) => appointmentController.getAppointmentStatistics(req, res));
router.get('/upcoming', (req, res) => appointmentController.getUpcomingAppointments(req, res));
router.get('/date-range', (req, res) => appointmentController.getAppointmentsByDateRange(req, res));
router.get('/status', (req, res) => appointmentController.getAppointmentsByStatus(req, res));
router.get('/patient/:patientId', (req, res) => appointmentController.getAppointmentsByPatient(req, res));
router.get('/doctor/:doctorId', (req, res) => appointmentController.getAppointmentsByDoctor(req, res));
router.get('/:id', (req, res) => appointmentController.getAppointmentById(req, res));
router.post('/', (req, res) => appointmentController.createAppointment(req, res));
router.put('/:id', (req, res) => appointmentController.updateAppointment(req, res));
router.put('/:id/cancel', (req, res) => appointmentController.cancelAppointment(req, res));
router.put('/:id/complete', (req, res) => appointmentController.completeAppointment(req, res));
router.delete('/:id', (req, res) => appointmentController.deleteAppointment(req, res));

export default router;

