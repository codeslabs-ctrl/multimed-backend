import express from 'express';
import catalogRoutes from './catalog.js';
import broadcastRoutes from './broadcast.js';
import patientsRoutes from './patients.js';
import appointmentsRoutes from './appointments.js';
import reportsRoutes from './reports.js';

const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', service: 'external-api', version: 'v1' } });
});

router.use('/catalog', catalogRoutes);
router.use('/broadcast', broadcastRoutes);
router.use('/patients', patientsRoutes);
router.use('/appointments', appointmentsRoutes);
router.use('/reports', reportsRoutes);

export default router;


