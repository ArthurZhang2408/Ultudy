import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './db/index.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'backend',
    env: process.env.NODE_ENV || 'dev'
  });
});

app.get('/db/health', async (req, res) => {
  if (!pool) {
    res.status(500).json({ ok: false, error: 'Database URL not configured' });
    return;
  }

  try {
    await pool.query('SELECT 1 as ok');
    res.json({ ok: true });
  } catch (error) {
    console.error('Database health check failed', error);
    res.status(500).json({ ok: false });
  }
});

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
