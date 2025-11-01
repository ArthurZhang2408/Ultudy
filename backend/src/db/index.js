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

const pool = poolConfig ? new Pool(poolConfig) : null;

export const isDatabaseConfigured = Boolean(poolConfig);

export default pool;
