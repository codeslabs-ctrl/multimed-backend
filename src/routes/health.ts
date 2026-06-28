import express, { Request, Response } from 'express';
import { postgresPool } from '../config/database.js';
import { ApiResponse } from '../types/index.js';

const router = express.Router();

// Health check with database connection test
router.get('/', async (_req: Request, res: Response<ApiResponse>) => {
  try {
    let dbStatus = 'unknown';
    let dbType = 'PostgreSQL';
    
    // Test PostgreSQL connection
    try {
      const client = await postgresPool.connect();
      await client.query('SELECT NOW()');
      client.release();
      dbStatus = 'connected';
    } catch (pgError) {
      dbStatus = 'disconnected';
    }
    
    const response: ApiResponse = {
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: process.env['NODE_ENV'] || 'development',
        services: {
          server: 'running',
          database: {
            type: dbType,
            status: dbStatus
          }
        },
        version: '1.0.0'
      }
    };
    
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Health check failed',
        details: (error as Error).message
      }
    };
    res.status(500).json(response);
  }
});

// Detailed health check
router.get('/detailed', async (_req: Request, res: Response<ApiResponse>) => {
  try {
    let dbInfo: any = {};
    
    // Test PostgreSQL connection and get database info
    try {
      const client = await postgresPool.connect();
      const versionResult = await client.query('SELECT version() as pg_version');
      const tableCountResult = await client.query(`
        SELECT COUNT(*) as table_count 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
      client.release();
      
      dbInfo = {
        type: 'PostgreSQL',
        status: 'connected',
        version: versionResult.rows[0]?.pg_version || 'unknown',
        tables: parseInt(tableCountResult.rows[0]?.table_count || '0'),
        host: process.env['POSTGRES_HOST'],
        database: process.env['POSTGRES_DB']
      };
    } catch (pgError) {
      dbInfo = {
        type: 'PostgreSQL',
        status: 'error',
        error: (pgError as Error).message
      };
    }

    const response: ApiResponse = {
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: process.env['NODE_ENV'] || 'development',
        services: {
          server: {
            status: 'running',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            version: process.version
          },
          database: dbInfo
        },
        version: '1.0.0'
      }
    };
    
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        message: 'Detailed health check failed',
        details: (error as Error).message
      }
    };
    res.status(500).json(response);
  }
});

export default router;
