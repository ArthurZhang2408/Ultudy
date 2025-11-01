import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const { DATABASE_URL } = process.env;

if (!DATABASE_URL) {
  console.error(
    'DATABASE_URL environment variable is not set. Database connections will be unavailable until it is configured.'
  );
}

const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL }) : null;

export const getPool = () => {
  if (!pool) {
    throw new Error('DATABASE_URL is not configured.');
  }

  return pool;
};

export default pool;
