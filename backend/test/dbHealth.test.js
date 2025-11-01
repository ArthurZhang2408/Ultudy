import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('GET /db/health', () => {
  it('returns ok when the database query succeeds', async () => {
    const query = mock.fn(async () => ({ rows: [{ ok: 1 }] }));
    const pool = { query };
    const app = createApp({ pool, isDatabaseConfigured: true });

    const response = await request(app).get('/db/health');

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { ok: true });
    assert.equal(query.mock.callCount(), 1);
    assert.deepEqual(query.mock.calls[0].arguments, ['SELECT 1 AS ok']);
  });

  it('returns 500 when the database query fails', async () => {
    const error = new Error('connection refused');
    const query = mock.fn(async () => {
      throw error;
    });
    const pool = { query };
    const app = createApp({ pool, isDatabaseConfigured: true });

    const consoleError = mock.method(console, 'error', () => {});

    const response = await request(app).get('/db/health');

    consoleError.mock.restore();

    assert.equal(response.status, 500);
    assert.deepEqual(response.body, { ok: false });
  });

  it('returns 500 when no pool is configured', async () => {
    const consoleWarn = mock.method(console, 'warn', () => {});
    const app = createApp({ pool: null, isDatabaseConfigured: false });

    const response = await request(app).get('/db/health');

    consoleWarn.mock.restore();

    assert.equal(response.status, 500);
    assert.deepEqual(response.body, {
      ok: false,
      error: 'Database connection is not configured.'
    });
  });
});
