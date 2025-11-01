import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const {
  DATABASE_URL,
  PGHOST,
  PGPORT,
  PGUSER,
  PGPASSWORD,
  PGDATABASE
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
}

const pool = poolConfig ? new Pool(poolConfig) : null;

export const isDatabaseConfigured = Boolean(poolConfig);

export default pool;
