import dotenv from 'dotenv';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { DEV_USER } from '../http/user.js';

dotenv.config();

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

let cachedJwks = null;
let cachedJwksUrl = null;
let customJwtVerifier = null;

export function __setJwtVerifier(verifier) {
  customJwtVerifier = verifier;
}

export function __resetJwtVerifier() {
  customJwtVerifier = null;
  cachedJwks = null;
  cachedJwksUrl = null;
}

async function verifyJwtToken(token) {
  if (!token) {
    throw new Error('Missing token');
  }

  if (typeof customJwtVerifier === 'function') {
    return customJwtVerifier(token);
  }

  const jwksUrl = process.env.AUTH_JWT_JWKS_URL;

  if (!jwksUrl) {
    throw new Error('AUTH_JWT_JWKS_URL is not configured');
  }

  if (!cachedJwks || cachedJwksUrl !== jwksUrl) {
    cachedJwks = createRemoteJWKSet(new URL(jwksUrl));
    cachedJwksUrl = jwksUrl;
  }

  const verifyOptions = {};

  if (process.env.AUTH_JWT_ISS) {
    verifyOptions.issuer = process.env.AUTH_JWT_ISS;
  }

  if (process.env.AUTH_JWT_AUD) {
    verifyOptions.audience = process.env.AUTH_JWT_AUD;
  }

  const { payload } = await jwtVerify(token, cachedJwks, verifyOptions);

  return payload;
}

export async function requireUser(req, res, next) {
  const mode = (process.env.AUTH_MODE || 'dev').toLowerCase();

  if (mode === 'jwt') {
    const authHeader = req.headers?.authorization;

    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing bearer token' });
      return;
    }

    const token = authHeader.slice('Bearer '.length).trim();

    if (!token) {
      res.status(401).json({ error: 'Missing bearer token' });
      return;
    }

    try {
      const payload = await verifyJwtToken(token);
      const userId = payload?.sub;

      if (typeof userId !== 'string' || !userId) {
        res.status(401).json({ error: 'Token missing subject claim' });
        return;
      }

      req.userId = userId;
      next();
      return;
    } catch (error) {
      console.error('JWT verification failed', error);
      res.status(401).json({ error: 'Invalid bearer token' });
      return;
    }
  }

  const header = req.headers?.['x-user-id'];

  if (typeof header === 'string' && header.trim().length > 0) {
    const normalized = header.trim().toLowerCase();

    if (!UUID_REGEX.test(normalized)) {
      res.status(400).json({ error: 'Invalid X-User-Id header; expected UUID format.' });
      return;
    }

    req.userId = normalized;
    next();
    return;
  }

  req.userId = DEV_USER;
  next();
}

export default requireUser;
