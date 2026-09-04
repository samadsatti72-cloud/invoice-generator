import { Pool, QueryResult } from 'pg';
import dotenv from 'dotenv';
import { logger } from '../config/logger';

dotenv.config();

export const pool = new Pool({
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  database: process.env.DATABASE_NAME || 'license_db',
  user: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle client', err);
});

export const query = async (
  text: string,
  params?: any[]
): Promise<QueryResult> => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug(`Query executed in ${duration}ms: ${text.substring(0, 50)}...`);
    return result;
  } catch (error) {
    logger.error(`Query error: ${text}`, error);
    throw error;
  }
};

export const initializeDatabase = async (): Promise<void> => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    logger.info(`Database connection verified at ${result.rows[0].now}`);
    client.release();
    
    // Run migrations
    await runMigrations();
  } catch (error) {
    logger.error('Database initialization failed:', error);
    throw error;
  }
};

const runMigrations = async (): Promise<void> => {
  const migrations = `
    CREATE TABLE IF NOT EXISTS customers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(255),
      password_hash VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS licenses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      license_key VARCHAR(50) UNIQUE NOT NULL,
      customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      product_id VARCHAR(50) NOT NULL,
      activation_key VARCHAR(255),
      device_fingerprint VARCHAR(255),
      activation_date TIMESTAMP,
      expiration_date TIMESTAMP NOT NULL,
      status VARCHAR(20) DEFAULT 'active',
      grace_period_days INTEGER DEFAULT 14,
      last_verified_online TIMESTAMP,
      auto_renewal BOOLEAN DEFAULT TRUE,
      renewal_reminder_sent BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT valid_status CHECK (status IN ('active', 'expired', 'inactive', 'suspended'))
    );

    CREATE TABLE IF NOT EXISTS payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      license_id UUID NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
      stripe_payment_id VARCHAR(255),
      amount DECIMAL(10, 2) NOT NULL,
      currency VARCHAR(3) DEFAULT 'USD',
      status VARCHAR(20) DEFAULT 'pending',
      payment_method VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT valid_payment_status CHECK (status IN ('pending', 'completed', 'failed', 'refunded'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      license_id UUID REFERENCES licenses(id) ON DELETE CASCADE,
      customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
      event_type VARCHAR(50) NOT NULL,
      event_data JSONB,
      ip_address VARCHAR(50),
      user_agent TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_licenses_customer_id ON licenses(customer_id);
    CREATE INDEX IF NOT EXISTS idx_licenses_license_key ON licenses(license_key);
    CREATE INDEX IF NOT EXISTS idx_licenses_expiration_date ON licenses(expiration_date);
    CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);
    CREATE INDEX IF NOT EXISTS idx_payments_license_id ON payments(license_id);
    CREATE INDEX IF NOT EXISTS idx_payments_stripe_payment_id ON payments(stripe_payment_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_license_id ON audit_logs(license_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_customer_id ON audit_logs(customer_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type);
  `;

  try {
    const client = await pool.connect();
    await client.query(migrations);
    logger.info('Database migrations completed successfully');
    client.release();
  } catch (error) {
    logger.error('Migration error:', error);
    throw error;
  }
};
