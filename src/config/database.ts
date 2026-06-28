import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';

// Misma convención que environment.ts: config.dev.env en desarrollo, config.env en producción
import path from 'path';
const configDir = process.cwd();
const useProductionConfig = process.env['NODE_ENV'] === 'production';
const configFile = useProductionConfig
  ? path.join(configDir, 'config.env')
  : path.join(configDir, 'config.dev.env');
dotenv.config({ path: configFile });

/** Esquema PostgreSQL (ej. multimed). Las consultas sin prefijo resuelven tablas en este esquema. */
const postgresSchema = (process.env['POSTGRES_SCHEMA'] || '').trim();

// PostgreSQL Direct Connection Configuration
const postgresConfig = {
  host: process.env['POSTGRES_HOST'] || 'localhost',
  port: parseInt(process.env['POSTGRES_PORT'] || '5432'),
  database: process.env['POSTGRES_DB'] || '',
  user: process.env['POSTGRES_USER'] || '',
  password: process.env['POSTGRES_PASSWORD'] || '',
  ssl: process.env['POSTGRES_SSL'] === 'true' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: parseInt(process.env['POSTGRES_CONNECTION_TIMEOUT'] || '5000'),
  query_timeout: parseInt(process.env['POSTGRES_QUERY_TIMEOUT'] || '10000'),
  statement_timeout: parseInt(process.env['POSTGRES_QUERY_TIMEOUT'] || '10000'),
  ...(postgresSchema
    ? { options: `-c search_path=${postgresSchema},public` }
    : {}),
};

// Log connection target at load time (no password) to verify config was applied
console.log('[DB] Config cargada:', {
  host: postgresConfig.host,
  port: postgresConfig.port,
  database: postgresConfig.database || '(vacío → conexión por defecto al usuario)',
  user: postgresConfig.user,
  schema: postgresSchema || '(por defecto: search_path del servidor)',
  cwd: configDir
});

// Create PostgreSQL connection pool
export const postgresPool: Pool = new Pool(postgresConfig);

// Handle pool errors
postgresPool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});


// Test PostgreSQL direct connection
export const testPostgresConnection = async (): Promise<boolean> => {
  let client: PoolClient | null = null;
  let timeoutId: NodeJS.Timeout | null = null;
  
  try {
    console.log('🔄 Testing PostgreSQL connection...');
    console.log(`   Host: ${postgresConfig.host}`);
    console.log(`   Port: ${postgresConfig.port}`);
    console.log(`   Database: ${postgresConfig.database}`);
    console.log(`   User: ${postgresConfig.user}`);
    console.log(`   Connection timeout: ${postgresConfig.connectionTimeoutMillis}ms`);
    console.log('');
    
    // Create a promise with timeout
    const connectPromise = postgresPool.connect();
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Connection timeout - server did not respond within ' + postgresConfig.connectionTimeoutMillis + 'ms'));
      }, postgresConfig.connectionTimeoutMillis);
    });
    
    client = await Promise.race([connectPromise, timeoutPromise]);
    if (timeoutId) clearTimeout(timeoutId);
    const result = await client.query('SELECT NOW() as current_time, version() as version');
    
    console.log('✅ PostgreSQL connection successful!');
    console.log(`   Server time: ${result.rows[0].current_time}`);
    console.log(`   PostgreSQL version: ${result.rows[0].version.split(',')[0]}`);
    
    // Test database exists
    const dbResult = await client.query(
      'SELECT datname FROM pg_database WHERE datname = $1',
      [postgresConfig.database]
    );
    
    if (dbResult.rows.length > 0) {
      console.log(`✅ Database '${postgresConfig.database}' exists`);
    } else {
      console.log(`⚠️  Database '${postgresConfig.database}' not found`);
    }
    
    return true;
  } catch (error: any) {
    console.error('❌ PostgreSQL connection failed:');
    const errorCode = error.code || error.errno;
    const errorMessage = error.message || String(error);
    
    if (errorCode === 'ETIMEDOUT' || errorCode === 'ECONNREFUSED' || errorMessage.includes('timeout') || errorMessage.includes('terminated')) {
      console.error('   Connection timeout or refused. Check:');
      console.error('   - Server IP address is correct: 69.164.244.24');
      console.error('   - PostgreSQL is running on the server');
      console.error('   - Firewall allows connections on port 5432');
      console.error('   - pg_hba.conf allows remote connections');
      console.error('   - listen_addresses in postgresql.conf is set to "*" or "0.0.0.0"');
      console.error('\n   See scripts/POSTGRES_SETUP.md for detailed configuration instructions.');
    } else if (errorCode === '28P01') {
      console.error('   Authentication failed. Check username and password.');
    } else if (errorCode === '3D000') {
      console.error(`   Database '${postgresConfig.database}' does not exist.`);
      console.error('   Create the database or fix POSTGRES_DB in your config file.');
    } else {
      console.error(`   Error code: ${errorCode || 'N/A'}`);
      console.error(`   Error message: ${errorMessage}`);
    }
    return false;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (client) {
      client.release();
    }
  }
};

// Test connection function - always uses PostgreSQL
export const testConnection = async (): Promise<void> => {
  console.log('🔧 Using PostgreSQL');
  const success = await testPostgresConnection();
  if (!success) {
    throw new Error('PostgreSQL connection test failed');
  }
};
