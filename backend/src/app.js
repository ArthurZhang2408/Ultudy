import express from 'express';
import cors from 'cors';
import pool, { isDatabaseConfigured } from './db/index.js';
import createUploadRouter from './routes/upload.js';
import createSearchRouter from './routes/search.js';
import createDocumentsRouter from './routes/documents.js';
import createStudyRouter from './routes/study.js';

export function createApp(options = {}) {
  const app = express();
  const hasCustomPool = Object.prototype.hasOwnProperty.call(options, 'pool');
  const activePool = hasCustomPool ? options.pool : pool;
  const hasCustomConfigured = Object.prototype.hasOwnProperty.call(
    options,
    'isDatabaseConfigured'
  );
  const databaseConfigured = hasCustomConfigured
    ? options.isDatabaseConfigured
    : isDatabaseConfigured;

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

  if (activePool) {
    app.use(
      '/upload',
      createUploadRouter({
        pool: activePool,
        ingestionService: options.ingestionService,
        storageDir: options.storageDir,
        extractText: options.extractText,
        chunker: options.chunker,
        embeddingsProviderFactory: options.embeddingsProviderFactory,
        extractOptions: options.extractOptions
      })
    );

    app.use(
      '/search',
      createSearchRouter({
        pool: activePool,
        searchService: options.searchService,
        embeddingsProviderFactory: options.embeddingsProviderFactory
      })
    );

    app.use(
      '/documents',
      createDocumentsRouter({
        pool: activePool
      })
    );

    app.use(
      createStudyRouter({
        pool: activePool,
        searchService: options.searchService,
        studyService: options.studyService,
        embeddingsProviderFactory: options.embeddingsProviderFactory,
        llmProviderFactory: options.llmProviderFactory
      })
    );
  }

  return app;
}

export default createApp;
