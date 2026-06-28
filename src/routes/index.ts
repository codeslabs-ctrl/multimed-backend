import express, { Request, Response } from 'express';
import authRoutes from './auth.js';
import dataRoutes from './data.js';
import patientRoutes from './patients.js';
import appointmentRoutes from './appointments.js';
import remisionRoutes from './remisiones.js';
import historicoRoutes from './historico.js';
import medicoRoutes from './medicos.js';
import especialidadRoutes from './especialidades.js';
import viewsRoutes from './views.js';
import consultaRoutes from './consultas.js';
import archivoRoutes from './archivos.js';
import mensajeRoutes from './mensajes.js';
import authRecoveryRoutes from './auth-recovery.js';
import clinicaRoutes from './clinica.js';
import clinicasCatalogoRoutes from './clinicas-catalogo.js';
import clinicasPlatformRoutes from './clinicas-platform.js';
import clinicaAtencionRoutes from './clinica-atencion.js';
import informeMedicoRoutes from './informes-medicos.js';
import contextualDataRoutes from './contextual-data.js';
import pdfRoutes from './pdf.js';
import serviciosRoutes from './servicios.js';
import finanzasRoutes from './finanzas.js';
import firmasRoutes from './firmas.js';
import importacionRoutes from './importacion.js';
import plantillaHistoriaRoutes from './plantilla-historia.js';
import usersRoutes from './users.js';
import menuRoutes from './menu.js';
import antecedentesTipoRoutes from './antecedentes-tipo.js';
import planesRoutes from './planes.js';
import externalV1Routes from './external/v1/index.js';
import { ApiResponse } from '../types/index.js';
import { config } from '../config/environment.js';

const router = express.Router();

// API documentation endpoint
router.get('/', (_req: Request, res: Response) => {
  const response: ApiResponse = {
    success: true,
    data: {
      message: `${config.sistema.clinicaNombre} API - Medical Management System`,
      version: '1.0.0',
      architecture: 'Service Layer Pattern',
          endpoints: {
            auth: '/auth',
            patients: '/patients',
            appointments: '/appointments',
            remisiones: '/remisiones',
            historico: '/historico',
            medicos: '/medicos',
            especialidades: '/especialidades',
            consultas: '/consultas',
            archivos: '/archivos',
            mensajes: '/mensajes',
            authRecovery: '/auth-recovery',
            views: '/views',
            data: '/data',
            clinica: '/clinica',
            informesMedicos: '/informes-medicos',
            contextualData: '/contextual-data',
                   pdf: '/pdf',
                   servicios: '/servicios',
            finanzas: '/finanzas',
            firmas: '/firmas',
            plantillasHistorias: '/plantillas-historias',
            health: '/health'
          },
      documentation: 'https://github.com/your-repo/femimed-backend',
      database: {
        type: 'PostgreSQL',
        tables: [
          'usuarios', 'pacientes', 'medicos', 'consultas_pacientes',
          'historico_pacientes', 'remisiones', 'medicamentos',
          'especialidades', 'servicios'
        ]
      },
      features: [
        'User Authentication',
        'Patient Management',
        'Appointment Scheduling',
        'Medical Records',
        'Real-time Database',
        'TypeScript Support'
      ]
    }
  };
  res.json(response);
});

// Mount route modules
router.use('/auth', authRoutes);
router.use('/patients', patientRoutes);
router.use('/appointments', appointmentRoutes);
router.use('/remisiones', remisionRoutes);
router.use('/historico', historicoRoutes);
router.use('/medicos', medicoRoutes);
router.use('/especialidades', especialidadRoutes);
router.use('/consultas', consultaRoutes);
router.use('/archivos', archivoRoutes);
router.use('/mensajes', mensajeRoutes);
router.use('/auth-recovery', authRecoveryRoutes);
router.use('/views', viewsRoutes);
router.use('/data', dataRoutes);
router.use('/clinica', clinicaRoutes);
router.use('/clinicas-catalogo', clinicasCatalogoRoutes);
router.use('/clinicas-platform', clinicasPlatformRoutes);
router.use('/clinica-atencion', clinicaAtencionRoutes);
router.use('/informes-medicos', informeMedicoRoutes);
router.use('/contextual-data', contextualDataRoutes);
router.use('/pdf', pdfRoutes);
router.use('/servicios', serviciosRoutes);
router.use('/finanzas', finanzasRoutes);
router.use('/firmas', firmasRoutes);
router.use('/importacion', importacionRoutes);
router.use('/plantillas-historias', plantillaHistoriaRoutes);
router.use('/users', usersRoutes);
router.use('/menu', menuRoutes);
router.use('/antecedentes-tipo', antecedentesTipoRoutes);
router.use('/planes', planesRoutes);
router.use('/external/v1', externalV1Routes);

export default router;
