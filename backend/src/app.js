import express from 'express';
import cors from 'cors';
import pool, { isDatabaseConfigured } from './db/index.js';
import { requireUser } from './auth/middleware.js';
import { createTenantHelpers } from './db/tenant.js';
import createUploadRouter from './routes/upload.js';
import createDocumentsRouter from './routes/documents.js';
import createStudyRouter from './routes/study.js';
import createCoursesRouter from './routes/courses.js';
import createJobsRouter from './routes/jobs.js';
import createAdminRouter from './routes/admin.js';
import subscriptionsRouter from './routes/subscriptions.js';
import chaptersRouter from './routes/chapters.js';
import tier2Router from './routes/tier2.js';
import setupWorkers from './jobs/worker.js';
import { uploadQueue, lessonQueue } from './jobs/queue.js';
import { createJobTracker } from './jobs/tracking.js';
import { checkRateLimit } from './jobs/ratelimit.js';

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
      llmProviderFactory: options.llmProviderFactory
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

    // Public subscription endpoints (no auth required)
    app.get('/subscriptions/tiers', (req, res) => {
      const tiers = [
        {
          id: 'free',
          name: 'Free',
          price: 0,
          currency: 'CAD',
          period: 'month',
          features: [
            '1 PDF per month',
            'Max 10 pages',
            'All core learning features',
            'Concept mastery tracking'
          ]
        },
        {
          id: 'tier1',
          name: 'Student',
          price: 17,
          currency: 'CAD',
          period: 'month',
          features: [
            'Unlimited PDFs',
            'No page limit',
            'Multiple courses',
            'Full mastery tracking',
            'Priority support'
          ],
          popular: true
        },
        {
          id: 'tier2',
          name: 'Pro',
          price: 40,
          currency: 'CAD',
          period: 'month',
          features: [
            'All Student features',
            'Multi-chapter PDFs',
            'Multiple sources per chapter',
            '100 chapters/month',
            'Premium AI quality',
            'Content deduplication'
          ]
        }
      ];
      res.json({ tiers });
    });

    app.use(requireUser);

    app.use(
      '/upload',
      createUploadRouter({
        pool: activePool,
        ingestionService: options.ingestionService,
        storageDir: options.storageDir,
        extractText: options.extractText,
        extractOptions: options.extractOptions,
        tenantHelpers,
        jobTracker,
        uploadQueue
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
        studyService: options.studyService,
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

    // Subscription routes (test mode - no payment)
    app.use('/subscriptions', subscriptionsRouter);

    // Tier 2 chapter routes
    app.use('/chapters', chaptersRouter);
    app.use('/tier2', tier2Router);
  }

  return app;
}

export default createApp;
