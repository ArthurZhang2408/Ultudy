import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { requireUser, __setJwtVerifier, __resetJwtVerifier } from '../src/auth/middleware.js';
import { DEV_USER } from '../src/http/user.js';

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

describe('requireUser middleware', () => {
  beforeEach(() => {
    process.env.AUTH_MODE = 'dev';
    __resetJwtVerifier();
  });

  afterEach(() => {
    delete process.env.AUTH_MODE;
    delete process.env.AUTH_JWT_ISS;
    delete process.env.AUTH_JWT_AUD;
    delete process.env.AUTH_JWT_JWKS_URL;
    __resetJwtVerifier();
  });

  it('uses provided X-User-Id header in dev mode', async () => {
    const req = { headers: { 'x-user-id': '00000000-0000-0000-0000-0000000000AA' } };
    const res = createResponse();
    let called = false;

    await requireUser(req, res, () => {
      called = true;
    });

    assert.equal(res.statusCode, 200);
    assert.equal(req.userId, '00000000-0000-0000-0000-0000000000AA');
    assert.ok(called);
  });

  it('defaults to DEV user when header missing in dev mode', async () => {
    const req = { headers: {} };
    const res = createResponse();
    let called = false;

    await requireUser(req, res, () => {
      called = true;
    });

    assert.equal(res.statusCode, 200);
    assert.equal(req.userId, DEV_USER);
    assert.ok(called);
  });

  it('accepts any non-empty X-User-Id header in dev mode', async () => {
    const req = { headers: { 'x-user-id': 'user_clerk_id_123' } };
    const res = createResponse();
    let called = false;

    await requireUser(req, res, () => {
      called = true;
    });

    assert.equal(res.statusCode, 200);
    assert.equal(req.userId, 'user_clerk_id_123');
    assert.ok(called);
  });

  it('verifies JWT tokens when AUTH_MODE=jwt', async () => {
    process.env.AUTH_MODE = 'jwt';
    process.env.AUTH_JWT_JWKS_URL = 'https://example.com/.well-known/jwks.json';
    __setJwtVerifier(async (token) => {
      assert.equal(token, 'valid-token');
      return { sub: 'user-123' };
    });

    const req = { headers: { authorization: 'Bearer valid-token' } };
    const res = createResponse();
    let called = false;

    await requireUser(req, res, () => {
      called = true;
    });

    assert.equal(res.statusCode, 200);
    assert.equal(req.userId, 'user-123');
    assert.ok(called);
  });

  it('returns 401 when JWT verification fails', async () => {
    process.env.AUTH_MODE = 'jwt';
    process.env.AUTH_JWT_JWKS_URL = 'https://example.com/.well-known/jwks.json';
    __setJwtVerifier(async () => {
      throw new Error('bad token');
    });

    const req = { headers: { authorization: 'Bearer invalid' } };
    const res = createResponse();

    await requireUser(req, res, () => {});

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: 'Invalid bearer token' });
    assert.equal(req.userId, undefined);
  });

  it('returns 401 when authorization header missing in jwt mode', async () => {
    process.env.AUTH_MODE = 'jwt';
    process.env.AUTH_JWT_JWKS_URL = 'https://example.com/.well-known/jwks.json';

    const req = { headers: {} };
    const res = createResponse();

    await requireUser(req, res, () => {});

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: 'Missing bearer token' });
  });
});
