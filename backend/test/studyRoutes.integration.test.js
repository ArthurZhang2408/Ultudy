import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createMemoryPool } from './utils/memoryPool.js';
import { getEmbeddingsProvider } from '../src/embeddings/provider.js';
import { formatEmbeddingForInsert } from '../src/embeddings/utils.js';
import { createTenantHelpers } from '../src/db/tenant.js';

const USER_ONE = '00000000-0000-0000-0000-000000000001';
const USER_TWO = '00000000-0000-0000-0000-000000000002';

async function seedDocument(pool, tenantHelpers, provider, ownerId, text, options = {}) {
  const documentId = options.documentId || randomUUID();
  const title = options.title || 'Seed Document';
  const pages = options.pages || 5;
  const embedding = await provider.embedDocuments([text]);
  const vector = formatEmbeddingForInsert(embedding[0]);

  await tenantHelpers.withTenant(ownerId, async (client) => {
    await client.query('INSERT INTO documents (id, title, pages, owner_id, full_text) VALUES ($1, $2, $3, $4, $5)', [
      documentId,
      title,
      pages,
      ownerId,
      options.fullText || text
    ]);

    await client.query(
      'INSERT INTO chunks (document_id, page_start, page_end, text, token_count, embedding, owner_id) VALUES ($1, $2, $3, $4, $5, $6::vector, $7)',
      [
        documentId,
        options.pageStart || 1,
        options.pageEnd || 2,
        text,
        text.split(/\s+/).length,
        vector,
        ownerId
      ]
    );
  });

  return documentId;
}

describe('study endpoints', () => {
  beforeEach(() => {
    process.env.EMBEDDINGS_PROVIDER = 'mock';
    process.env.LLM_PROVIDER = 'mock';
    process.env.AUTH_MODE = 'dev';
  });

  it('builds lessons scoped per user', async () => {
    const pool = createMemoryPool();
    const tenantHelpers = createTenantHelpers(pool);
    const provider = await getEmbeddingsProvider();

    const docOne = await seedDocument(
      pool,
      tenantHelpers,
      provider,
      USER_ONE,
      'Laplace transforms capture exponential responses and stabilize circuit analysis.'
    );
    await seedDocument(
      pool,
      tenantHelpers,
      provider,
      USER_TWO,
      'Photosynthesis converts light energy into chemical energy within plant cells.'
    );

    const app = createApp({ pool, isDatabaseConfigured: true });

    const responseOne = await request(app)
      .post('/study/lesson')
      .set('X-User-Id', USER_ONE)
      .send({ query: 'transform analysis', topic: 'Transform review', k: 4 });

    assert.equal(responseOne.status, 200);
    assert.equal(responseOne.body.topic, 'Transform review');
    assert.ok(responseOne.body.summary.length > 0);
    assert.ok(responseOne.body.sources.every((source) => source.document_id === docOne));

    const responseTwo = await request(app)
      .post('/study/lesson')
      .set('X-User-Id', USER_TWO)
      .send({ query: 'photosynthesis basics', k: 4 });

    assert.equal(responseTwo.status, 200);
    assert.ok(responseTwo.body.topic.includes('photosynthesis basics'));
    assert.ok(responseTwo.body.sources.every((source) => source.document_id !== docOne));
  });

  it('generates and caches full-context lessons with check-ins', async () => {
    const pool = createMemoryPool();
    const tenantHelpers = createTenantHelpers(pool);
    const provider = await getEmbeddingsProvider();

    const documentId = await seedDocument(
      pool,
      tenantHelpers,
      provider,
      USER_ONE,
      'Maxwell equations describe the fundamentals of electromagnetism and wave propagation.',
      { title: 'Electromagnetism 101', fullText: 'Electric and magnetic fields interact dynamically in Maxwell equations.' }
    );

    const app = createApp({ pool, isDatabaseConfigured: true });

    const firstResponse = await request(app)
      .post('/lessons/generate')
      .set('X-User-Id', USER_ONE)
      .send({ document_id: documentId, include_check_ins: true });

    assert.equal(firstResponse.status, 200);
    assert.ok(typeof firstResponse.body.explanation === 'string' && firstResponse.body.explanation.length > 0);
    assert.ok(Array.isArray(firstResponse.body.concepts));
    assert.ok(firstResponse.body.concepts.some((concept) => Array.isArray(concept.check_ins) && concept.check_ins.length > 0));
    assert.ok(Array.isArray(firstResponse.body.check_ins));
    assert.ok(firstResponse.body.check_ins.length > 0);

    const lessonId = firstResponse.body.id;
    assert.ok(lessonId, 'lesson id should be returned');

    const secondResponse = await request(app)
      .post('/lessons/generate')
      .set('X-User-Id', USER_ONE)
      .send({ document_id: documentId, include_check_ins: true });

    assert.equal(secondResponse.status, 200);
    assert.equal(secondResponse.body.id, lessonId);
    assert.ok(Array.isArray(secondResponse.body.check_ins));
    assert.ok(secondResponse.body.check_ins.length > 0);
  });

  it('generates MCQs scoped per user', async () => {
    const pool = createMemoryPool();
    const tenantHelpers = createTenantHelpers(pool);
    const provider = await getEmbeddingsProvider();

    const docOne = await seedDocument(
      pool,
      tenantHelpers,
      provider,
      USER_ONE,
      'Eigenvalues identify stretching factors for linear transformations and stability.'
    );
    await seedDocument(
      pool,
      tenantHelpers,
      provider,
      USER_TWO,
      'In ecology, trophic levels describe energy transfer between organisms.'
    );

    const app = createApp({ pool, isDatabaseConfigured: true });

    const responseOne = await request(app)
      .post('/practice/mcq')
      .set('X-User-Id', USER_ONE)
      .send({ topic: 'Linear algebra', n: 3, difficulty: 'easy' });

    assert.equal(responseOne.status, 200);
    assert.equal(responseOne.body.items.length, 3);
    assert.ok(responseOne.body.items.every((item) => item.source.document_id === docOne));

    const responseTwo = await request(app)
      .post('/practice/mcq')
      .set('X-User-Id', USER_TWO)
      .send({ topic: 'Ecology basics', n: 2 });

    assert.equal(responseTwo.status, 200);
    assert.equal(responseTwo.body.items.length, 2);
    assert.ok(responseTwo.body.items.every((item) => item.source.document_id !== docOne));
  });

  it('aggregates progress by course and counts full session history', async () => {
    const pool = createMemoryPool();
    const tenantHelpers = createTenantHelpers(pool);
    const app = createApp({ pool, isDatabaseConfigured: true });

    const courseA = randomUUID();
    const courseB = randomUUID();

    await tenantHelpers.withTenant(USER_ONE, async (client) => {
      await client.query('INSERT INTO courses (id, owner_id, name) VALUES ($1, $2, $3)', [courseA, USER_ONE, 'Signals and Systems']);
      await client.query('INSERT INTO courses (id, owner_id, name) VALUES ($1, $2, $3)', [courseB, USER_ONE, 'Circuit Analysis']);

      await client.query(
        `INSERT INTO concepts (owner_id, name, chapter, course_id, document_id, mastery_state, total_attempts, correct_attempts, consecutive_correct, last_reviewed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [USER_ONE, 'Laplace Transform Basics', '1', courseA, null, 'mastered', 4, 4, 4]
      );

      await client.query(
        `INSERT INTO concepts (owner_id, name, chapter, course_id, document_id, mastery_state, total_attempts, correct_attempts, consecutive_correct, last_reviewed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [USER_ONE, 'Frequency Response Intuition', '2', courseA, null, 'understood', 3, 2, 1]
      );

      await client.query(
        `INSERT INTO concepts (owner_id, name, chapter, course_id, document_id, mastery_state, total_attempts, correct_attempts, consecutive_correct, last_reviewed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [USER_ONE, 'Kirchhoff Voltage Law', '1', courseB, null, 'needs_review', 5, 2, 0]
      );

      await client.query(
        `INSERT INTO concepts (owner_id, name, chapter, course_id, document_id, mastery_state, total_attempts, correct_attempts, consecutive_correct, last_reviewed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [USER_ONE, 'General Study Habit', null, null, null, 'introduced', 1, 0, 0]
      );
    });

    const courseASessions = 12;
    const courseBSessions = 3;

    const createSession = async (courseId, index) => {
      const startResponse = await request(app)
        .post('/study-sessions/start')
        .set('X-User-Id', USER_ONE)
        .send({ session_type: 'lesson', course_id: courseId, chapter: '1' });

      assert.equal(startResponse.status, 200);
      const sessionId = startResponse.body.session_id;
      assert.ok(sessionId);

      const correctFirst = index % 2 === 0;

      const firstTrack = await request(app)
        .post(`/study-sessions/${sessionId}/track-checkin`)
        .set('X-User-Id', USER_ONE)
        .send({ correct: correctFirst });
      assert.equal(firstTrack.status, 200);

      const secondTrack = await request(app)
        .post(`/study-sessions/${sessionId}/track-checkin`)
        .set('X-User-Id', USER_ONE)
        .send({ correct: true });
      assert.equal(secondTrack.status, 200);

      const completeResponse = await request(app)
        .post(`/study-sessions/${sessionId}/complete`)
        .set('X-User-Id', USER_ONE)
        .send();

      assert.equal(completeResponse.status, 200);
    };

    for (let i = 0; i < courseASessions; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await createSession(courseA, i);
    }

    for (let i = 0; i < courseBSessions; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await createSession(courseB, i);
    }

    const overviewResponse = await request(app)
      .get('/progress/overview')
      .set('X-User-Id', USER_ONE);

    assert.equal(overviewResponse.status, 200);
    const overview = overviewResponse.body;

    const byCourse = overview.content_mastery.by_course;
    assert.ok(byCourse[courseA], 'course A should be present in by_course');
    assert.equal(byCourse[courseA].course_name, 'Signals and Systems');
    assert.equal(byCourse[courseA].total, 2);
    assert.ok(byCourse[courseA].chapters['1']);
    assert.ok(byCourse[courseA].chapters['2']);

    assert.ok(byCourse[courseB]);
    assert.equal(byCourse[courseB].course_name, 'Circuit Analysis');

    const unassignedEntry = byCourse.uncategorized;
    assert.ok(unassignedEntry);
    assert.equal(unassignedEntry.course_name, 'Unassigned Course');

    assert.equal(overview.stats.total_sessions, courseASessions + courseBSessions);
    assert.equal(overview.study_sessions.length, 10, 'recent sessions should be capped at 10');

    const weakAreasCourses = overview.weak_areas.map((area) => area.course_id);
    assert.ok(weakAreasCourses.includes(courseB));

    const filteredResponse = await request(app)
      .get(`/progress/overview?course_id=${courseA}`)
      .set('X-User-Id', USER_ONE);

    assert.equal(filteredResponse.status, 200);
    const filtered = filteredResponse.body;
    const filteredCourses = Object.keys(filtered.content_mastery.by_course);
    assert.deepEqual(filteredCourses, [courseA]);
    assert.equal(filtered.stats.total_sessions, courseASessions);
    assert.ok(filtered.weak_areas.every((area) => area.course_id === courseA));
  });

  it('validates study session inputs', async () => {
    const pool = createMemoryPool();
    const app = createApp({ pool, isDatabaseConfigured: true });

    const invalidTypeResponse = await request(app)
      .post('/study-sessions/start')
      .set('X-User-Id', USER_ONE)
      .send({ session_type: 'speed-run' });

    assert.equal(invalidTypeResponse.status, 400);

    const invalidCourseResponse = await request(app)
      .post('/study-sessions/start')
      .set('X-User-Id', USER_ONE)
      .send({ session_type: 'lesson', course_id: 'not-a-uuid' });

    assert.equal(invalidCourseResponse.status, 400);
  });
});
