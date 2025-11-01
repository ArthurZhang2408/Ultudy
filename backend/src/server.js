import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool, { isDatabaseConfigured } from './db/index.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

if (!isDatabaseConfigured) {
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
  if (!pool) {
    res.status(500).json({ ok: false, error: 'Database connection is not configured.' });
    return;
  }

  try {
    await pool.query('SELECT 1 AS ok');
    res.json({ ok: true });
  } catch (error) {
    console.error('Database health check failed', error);
    res.status(500).json({ ok: false });
  }
});

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
