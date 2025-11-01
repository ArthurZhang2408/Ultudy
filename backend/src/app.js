import express from 'express';
import cors from 'cors';
import pool, { isDatabaseConfigured } from './db/index.js';

export function createApp(options = {}) {
  const app = express();
  const activePool = options.pool ?? pool;
  const databaseConfigured =
    options.isDatabaseConfigured ?? isDatabaseConfigured;

  app.use(cors());
  app.use(express.json());

  if (!databaseConfigured) {
    console.warn(
      'Postgres configuration missing: set DATABASE_URL or PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE to enable database connections.'
    );
  }

  app.get('/health', (req, res) => {
    res.json({
      ok: true,
      service: 'backend',
      env: process.env.NODE_ENV || 'dev'
    });
  });

  app.get('/db/health', async (req, res) => {
    if (!activePool) {
      res
        .status(500)
        .json({ ok: false, error: 'Database connection is not configured.' });
      return;
    }

    try {
      await activePool.query('SELECT 1 AS ok');
      res.json({ ok: true });
    } catch (error) {
      console.error('Database health check failed', error);
      res.status(500).json({ ok: false });
    }
  });

  return app;
}

export default createApp;
