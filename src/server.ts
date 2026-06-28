import express from 'express';
import morgan from 'morgan';
import compression from 'compression';
import fs from 'fs';
import path from 'path';
import { config } from './config/environment.js';
import { testConnection } from './config/database.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { 
  securityHeaders, 
  corsMiddleware
} from './middleware/security.js';
// import { ApiResponse } from './types/index.js';

// Import routes
import apiRoutes from './routes/index.js';
import healthRoutes from './routes/health.js';

const app = express();

// Body parsing middleware (debe ir antes de los middlewares de seguridad para algunos casos)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware para agregar headers CORS a archivos estáticos
// Usa las mismas variables de entorno que el middleware de seguridad principal
const normalizeOrigin = (value: string): string =>
  value.trim().toLowerCase().replace(/\/$/, '');

const envOriginsRaw = [
  process.env['CORS_ORIGIN'],
  process.env['FRONTEND_URL']
].filter(Boolean) as string[];

const envOrigins = envOriginsRaw
  .flatMap(v => v.split(','))
  .map(normalizeOrigin)
  .filter(Boolean);

const allowedStaticOrigins = Array.from(new Set([
  ...envOrigins,
  // FallBacks / compat
  'https://demomed.codes-labs.com',
  'https://www.demomed.codes-labs.com',
  'http://localhost:4200',
  'http://localhost:3000'  // Desarrollo frontend alternativo
].map(normalizeOrigin)));

const staticCorsMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction): void => {
  const origin = req.headers.origin;
  
  if (origin) {
    const normalizedOrigin = normalizeOrigin(origin);
    if (allowedStaticOrigins.includes(normalizedOrigin)) {
      res.header('Access-Control-Allow-Origin', origin);
    } else {
      console.warn(`⚠️ CORS bloqueado para origen en archivos estáticos: ${origin}`);
      res.header('Access-Control-Allow-Origin', '*');
    }
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Credentials', 'true');
  // Establecer CORP explícitamente para permitir acceso cross-origin
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  
  // Manejar preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  
  next();
};

// Endpoint personalizado para servir firmas con headers CORP correctos
app.get('/assets/firmas/:filename', (req: express.Request, res: express.Response) => {
  const filename = req.params['filename'];
  if (!filename) {
    res.status(400).json({ error: 'Filename required' });
    return;
  }
  
  // Establecer headers CORS y CORP ANTES de cualquier otra cosa
  const origin = req.headers.origin;
  if (origin) {
    const normalizedOrigin = normalizeOrigin(origin);
    if (allowedStaticOrigins.includes(normalizedOrigin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  
  // Manejar preflight
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  
  console.log(`📸 [Firma Endpoint] Solicitud para: ${filename}`);
  console.log(`📸 [Firma Endpoint] Origen: ${req.headers.origin || 'none'}`);
  
  // Buscar el archivo en múltiples ubicaciones posibles
  // 1. assets/firmas/ (desarrollo - donde se guardan los archivos nuevos)
  // 2. dist/assets/firmas/ (producción - después de compilación)
  const devAssetsPath = path.join(process.cwd(), 'assets', 'firmas', filename);
  const distAssetsPath = path.join(process.cwd(), 'dist', 'assets', 'firmas', filename);
  
  let filePath: string | null = null;
  
  if (fs.existsSync(devAssetsPath)) {
    filePath = devAssetsPath;
    console.log(`✅ [Firma Endpoint] Archivo encontrado en desarrollo: ${devAssetsPath}`);
  } else if (fs.existsSync(distAssetsPath)) {
    filePath = distAssetsPath;
    console.log(`✅ [Firma Endpoint] Archivo encontrado en dist: ${distAssetsPath}`);
  } else {
    console.error(`❌ [Firma Endpoint] Archivo no encontrado en ninguna ubicación:`);
    console.error(`   - Desarrollo: ${devAssetsPath}`);
    console.error(`   - Producción: ${distAssetsPath}`);
    // Enviar respuesta 404 con headers CORS correctos
    res.status(404).json({ error: 'File not found', filename: filename });
    return;
  }
  
  // Determinar el tipo de contenido
  const ext = path.extname(filename).toLowerCase();
  const contentTypeMap: { [key: string]: string } = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
  };
  const contentType = contentTypeMap[ext] || 'application/octet-stream';
  
  res.setHeader('Content-Type', contentType);
  console.log(`✅ [Firma Endpoint] Enviando archivo: ${filename} (${contentType})`);
  
  // Usar sendFile con opciones para manejar errores
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error(`❌ [Firma Endpoint] Error enviando archivo:`, err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error sending file', message: err.message });
      }
    }
  });
});

// Serve static files from uploads directory (ANTES de Helmet para evitar conflictos)
app.use('/uploads', staticCorsMiddleware, express.static('uploads'));

// Serve static files from assets directory EXCEPTO /assets/firmas (ya manejado arriba)
app.use('/assets', (req: express.Request, _res: express.Response, next: express.NextFunction) => {
  // Si es una firma, ya fue manejada por el endpoint personalizado
  if (req.path.startsWith('/firmas/')) {
    return next('route'); // Skip this middleware
  }
  next();
}, staticCorsMiddleware, express.static('assets'));

// Aplicar middlewares de seguridad (DESPUÉS de archivos estáticos)
app.use(securityHeaders);
app.use(corsMiddleware);

// Compression middleware
app.use(compression());

// Logging middleware
if (config.nodeEnv === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Health check endpoints
app.use('/health', healthRoutes);

// API routes
app.use(`/api/${config.api.version}`, apiRoutes);

// 404 handler
app.use(notFound);

// Error handling middleware
app.use(errorHandler);

// Start server
const startServer = async (): Promise<void> => {
  try {
    // Test database connection
    await testConnection();
    
    app.listen(config.port, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${config.port}`);
      console.log(`📊 Environment: ${config.nodeEnv}`);
      console.log(`🌐 Listening on: 0.0.0.0:${config.port}`);
      
      // Mostrar URL apropiada según el entorno
      if (config.nodeEnv === 'production') {
        const productionUrl = process.env['API_URL'] || `https://api.demomed.codes-labs.com:${config.port}`;
        console.log(`🔗 API Base URL: ${productionUrl}/api/${config.api.version}`);
      } else {
        console.log(`🔗 API Base URL: http://localhost:${config.port}/api/${config.api.version}`);
        console.log(`🔗 Login endpoint: http://localhost:${config.port}/api/${config.api.version}/auth/login`);
      }
    });
  } catch (error) {
    console.error('❌ Failed to start server:', (error as Error).message);
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on('uncaughtException', (err: Error) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err: Error) => {
  console.error('Unhandled Rejection:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

startServer();
