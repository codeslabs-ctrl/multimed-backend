import dotenv from 'dotenv';
import { Config } from '../types/index.js';

// Load environment variables
dotenv.config({ path: './config.env' });

export const config: Config = {
  // Server configuration
  port: parseInt(process.env.PORT || '3000'),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Supabase configuration
  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || ''
  },
  
  // API configuration
  api: {
    version: process.env.API_VERSION || 'v1',
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100')
    }
  },
  
  // CORS configuration
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: process.env.CORS_CREDENTIALS === 'true'
  }
};

// Validate required environment variables
const requiredEnvVars: string[] = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}
