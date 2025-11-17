import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const {
  DATABASE_URL,
  PGHOST,
  PGPORT,
  PGUSER,
  PGPASSWORD,
  PGDATABASE,
  NODE_ENV
} = process.env;

let poolConfig = null;

if (DATABASE_URL) {
  poolConfig = { connectionString: DATABASE_URL };
} else if (PGHOST && PGPORT && PGUSER && PGPASSWORD && PGDATABASE) {
  poolConfig = {
    host: PGHOST,
    port: Number(PGPORT),
    user: PGUSER,
    password: PGPASSWORD,
    database: PGDATABASE
  };
} else if (NODE_ENV !== 'production') {
  const defaultLocalConnection =
    'postgresql://postgres:postgres@localhost:5432/study_app';

  console.warn(
    `Postgres configuration missing: defaulting to ${defaultLocalConnection}. ` +
      'Override with DATABASE_URL or PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE.'
  );

  poolConfig = { connectionString: defaultLocalConnection };
}

// Production-ready connection pool configuration
if (poolConfig) {
  // Configure pool size for high concurrency (increased from 20 to 100)
  // Supports ~1,000 concurrent users with this configuration
  // For 10k+ users, add PgBouncer connection pooler in front of database
  poolConfig.max = parseInt(process.env.DB_POOL_MAX || '100', 10); // Max connections (increased from 20)
  poolConfig.min = parseInt(process.env.DB_POOL_MIN || '10', 10); // Min connections (increased from 5)
  poolConfig.idleTimeoutMillis = parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10); // 30s
  poolConfig.connectionTimeoutMillis = parseInt(process.env.DB_CONNECT_TIMEOUT || '10000', 10); // 10s

  // Statement timeout to prevent long-running queries from blocking
  poolConfig.statement_timeout = parseInt(process.env.DB_STATEMENT_TIMEOUT || '60000', 10); // 60s

  // Application name for connection tracking
  poolConfig.application_name = 'ultudy-backend';
}

const pool = poolConfig ? new Pool(poolConfig) : null;

// Monitor pool health for production
if (pool && NODE_ENV === 'production') {
  pool.on('error', (err) => {
    console.error('[DB Pool] Unexpected error on idle client:', err);
  });

  pool.on('connect', () => {
    console.log('[DB Pool] New client connected');
  });

  pool.on('remove', () => {
    console.log('[DB Pool] Client removed from pool');
  });

  // Log pool stats periodically (every 5 minutes)
  poolStatsInterval = setInterval(() => {
    console.log('[DB Pool] Stats:', {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount
    });
  }, 300000);
}

export const isDatabaseConfigured = Boolean(poolConfig);

// Interval for periodic pool stats logging
let poolStatsInterval = null;

/**
 * Query helpers for read/write splitting
 * Currently both use the same pool, but can easily be switched to separate pools
 * when setting up read replicas for horizontal scaling
 *
 * Usage:
 *   const courses = await queryRead('SELECT * FROM courses WHERE owner_id = $1', [userId]);
 *   await queryWrite('INSERT INTO courses (...) VALUES (...)', [...]);
 */

/**
 * Execute a read query (SELECT, etc.)
 * Future: Will route to read replica pool for better performance
 */
export async function queryRead(sql, params) {
  if (!pool) {
    throw new Error('Database not configured');
  }
  return pool.query(sql, params);
}

/**
 * Execute a write query (INSERT, UPDATE, DELETE)
 * Always routes to primary database
 */
export async function queryWrite(sql, params) {
  if (!pool) {
    throw new Error('Database not configured');
  }
  return pool.query(sql, params);
}

/**
 * Execute a transaction (always on primary database)
 * Example:
 *   await withTransaction(async (client) => {
 *     await client.query('INSERT INTO ...', [...]);
 *     await client.query('UPDATE ...', [...]);
 *   });
 */
export async function withTransaction(callback) {
  if (!pool) {
    throw new Error('Database not configured');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Graceful shutdown
export async function closePool() {
  if (poolStatsInterval) {
    clearInterval(poolStatsInterval);
    poolStatsInterval = null;
  }
  if (pool) {
    await pool.end();
    console.log('[DB Pool] Closed all connections');
  }
}

export default pool;
