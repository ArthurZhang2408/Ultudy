import express from 'express';
import cors from 'cors';
import pool, { isDatabaseConfigured } from './db/index.js';
import { getEmbeddingsProvider } from './embeddings/provider.js';
import { requireUser } from './auth/middleware.js';
import { createTenantHelpers } from './db/tenant.js';
import createUploadRouter from './routes/upload.js';
import createSearchRouter from './routes/search.js';
import createDocumentsRouter from './routes/documents.js';
import createStudyRouter from './routes/study.js';
import createCoursesRouter from './routes/courses.js';
import createJobsRouter from './routes/jobs.js';
import createAdminRouter from './routes/admin.js';
import setupWorkers from './jobs/worker.js';
import { uploadQueue, lessonQueue } from './jobs/queue.js';
import { createJobTracker } from './jobs/tracking.js';
import { checkRateLimit } from './jobs/ratelimit.js';

export function createApp(options = {}) {
  const app = express();
  const hasCustomPool = Object.prototype.hasOwnProperty.call(options, 'pool');
  const activePool = hasCustomPool ? options.pool : pool;
  const embeddingsProviderFactory =
    options.embeddingsProviderFactory ?? getEmbeddingsProvider;
  const hasCustomConfigured = Object.prototype.hasOwnProperty.call(
    options,
    'isDatabaseConfigured'
  );
  const databaseConfigured = hasCustomConfigured
    ? options.isDatabaseConfigured
    : isDatabaseConfigured;

  const corsMiddleware = cors({
    origin: true,
    credentials: true
  });
  app.use(corsMiddleware);
  app.options('*', corsMiddleware);
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

  const tenantHelpers = options.tenantHelpers ||
    (activePool ? createTenantHelpers(activePool) : null);

  // Setup job infrastructure
  let jobTracker = null;
  if (activePool && tenantHelpers) {
    // Create job tracker
    jobTracker = createJobTracker(tenantHelpers);

    // Setup job workers (processors)
    setupWorkers({
      tenantHelpers,
      pool: activePool,
      storageDir: options.storageDir,
      llmProviderFactory: options.llmProviderFactory,
      embeddingsProviderFactory
    });

    console.log('[App] Job infrastructure initialized');
  }

  if (activePool) {
    // Admin routes (no auth required for setup)
    app.use(
      '/admin',
      createAdminRouter({
        pool: activePool,
        tenantHelpers
      })
    );

    app.use(requireUser);

    app.use(
      '/upload',
      createUploadRouter({
        pool: activePool,
        ingestionService: options.ingestionService,
        storageDir: options.storageDir,
        extractText: options.extractText,
        chunker: options.chunker,
        embeddingsProviderFactory,
        extractOptions: options.extractOptions,
        tenantHelpers,
        jobTracker,
        uploadQueue
      })
    );

    app.use(
      '/search',
      createSearchRouter({
        pool: activePool,
        searchService: options.searchService,
        embeddingsProviderFactory,
        tenantHelpers
      })
    );

    app.use(
      '/documents',
      createDocumentsRouter({
        pool: activePool,
        tenantHelpers
      })
    );

    app.use(
      '/courses',
      createCoursesRouter({
        pool: activePool,
        tenantHelpers
      })
    );

    app.use(
      createStudyRouter({
        pool: activePool,
        searchService: options.searchService,
        studyService: options.studyService,
        embeddingsProviderFactory,
        llmProviderFactory: options.llmProviderFactory,
        tenantHelpers,
        jobTracker,
        lessonQueue,
        checkRateLimit
      })
    );

    app.use(
      '/jobs',
      createJobsRouter({
        jobTracker
      })
    );

    app.get('/admin/embed-probe', async (req, res) => {
      const providerName = (process.env.EMBEDDINGS_PROVIDER || 'mock').toLowerCase();
      const modelName =
        providerName === 'gemini'
          ? process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001'
          : providerName === 'openai'
            ? 'text-embedding-3-large'
            : 'mock';

      try {
        const provider = await embeddingsProviderFactory();
        const [vector] = await provider.embedDocuments(['health check probe']);
        const dimension = typeof vector?.length === 'number' ? vector.length : null;

        res.json({
          provider: provider.name || providerName,
          model: modelName,
          dim: dimension,
          ok: true
        });
      } catch (error) {
        console.error('Embedding probe failed', error);
        res.status(500).json({
          provider: providerName,
          model: modelName,
          ok: false,
          error: error?.message || 'Failed to execute embedding probe'
        });
      }
    });
  }

  return app;
}

export default createApp;
