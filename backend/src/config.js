/**
 * Centralized environment variable configuration
 * Single source of truth for all backend configuration
 */

// Server Configuration
export const PORT = process.env.PORT || 3001;
export const NODE_ENV = process.env.NODE_ENV || 'development';

// Database Configuration
export const DATABASE_URL = process.env.DATABASE_URL;
export const PGHOST = process.env.PGHOST;
export const PGPORT = process.env.PGPORT;
export const PGUSER = process.env.PGUSER;
export const PGPASSWORD = process.env.PGPASSWORD;
export const PGDATABASE = process.env.PGDATABASE;

// LLM Provider Configuration
export const LLM_PROVIDER = (process.env.LLM_PROVIDER || 'mock').toLowerCase();
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
export const GEMINI_GEN_MODEL = process.env.GEMINI_GEN_MODEL || 'gemini-1.5-flash';
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// PDF Extraction Configuration
export const PDF_EXTRACTION_MODE = process.env.PDF_EXTRACTION_MODE || 'enhanced';

// Authentication Configuration
export const AUTH_MODE = process.env.AUTH_MODE || 'jwt';
export const AUTH_JWT_ISS = process.env.AUTH_JWT_ISS;
export const AUTH_JWT_AUD = process.env.AUTH_JWT_AUD;
export const AUTH_JWT_JWKS_URL = process.env.AUTH_JWT_JWKS_URL;

// Job Queue Configuration
export const UPLOAD_QUEUE_CONCURRENCY = parseInt(process.env.UPLOAD_QUEUE_CONCURRENCY || '5', 10);
export const LESSON_QUEUE_CONCURRENCY = parseInt(process.env.LESSON_QUEUE_CONCURRENCY || '3', 10);
export const DISABLE_QUEUES = process.env.DISABLE_QUEUES === 'true';

// Feature Flags
export const IS_CI = process.env.CI === 'true';

/**
 * Validates required environment variables
 * @throws {Error} if required variables are missing
 */
export function validateConfig() {
  const errors = [];

  // Validate LLM provider config
  if (LLM_PROVIDER === 'gemini' && !GEMINI_API_KEY && !IS_CI) {
    errors.push('GEMINI_API_KEY is required when LLM_PROVIDER=gemini');
  }

  if (LLM_PROVIDER === 'openai' && !OPENAI_API_KEY && !IS_CI) {
    errors.push('OPENAI_API_KEY is required when LLM_PROVIDER=openai');
  }

  // Validate auth config for JWT mode
  if (AUTH_MODE === 'jwt' && !IS_CI) {
    if (!AUTH_JWT_ISS) {
      errors.push('AUTH_JWT_ISS is required when AUTH_MODE=jwt');
    }
    if (!AUTH_JWT_JWKS_URL) {
      errors.push('AUTH_JWT_JWKS_URL is required when AUTH_MODE=jwt');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

export default {
  PORT,
  NODE_ENV,
  DATABASE_URL,
  LLM_PROVIDER,
  GEMINI_API_KEY,
  GEMINI_GEN_MODEL,
  OPENAI_API_KEY,
  PDF_EXTRACTION_MODE,
  AUTH_MODE,
  AUTH_JWT_ISS,
  AUTH_JWT_AUD,
  AUTH_JWT_JWKS_URL,
  UPLOAD_QUEUE_CONCURRENCY,
  LESSON_QUEUE_CONCURRENCY,
  DISABLE_QUEUES,
  IS_CI,
  validateConfig
};
