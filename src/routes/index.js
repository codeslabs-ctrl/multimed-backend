import express, { Request, Response } from 'express';
import authRoutes from './auth.js';
import dataRoutes from './data.js';
import { ApiResponse } from '../types/index.js';
import { config } from '../config/environment.js';

const router = express.Router();

// API documentation endpoint
router.get('/', (req: Request, res: Response) => {
  const response: ApiResponse = {
    success: true,
    data: {
      message: `${config.sistema.clinicaNombre} API`,
      version: '1.0.0',
      endpoints: {
        auth: '/auth',
        data: '/data',
        health: '/health'
      },
      documentation: 'https://github.com/your-repo/femimed-backend'
    }
  };
  res.json(response);
});

// Mount route modules
router.use('/auth', authRoutes);
router.use('/data', dataRoutes);

export default router;
