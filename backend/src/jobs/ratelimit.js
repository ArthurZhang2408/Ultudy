/**
 * Rate Limiting for Job Submission
 *
 * Prevents users from overwhelming the system with too many concurrent jobs.
 * Uses Redis for distributed rate limiting across multiple API servers.
 */

import { createClient } from 'redis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const RATE_LIMIT_ENABLED = process.env.ENABLE_RATE_LIMITING !== 'false';

// Rate limits per user (configurable via env vars)
// Increased default limits for development - adjust in production via env vars
const LESSON_JOBS_PER_MINUTE = parseInt(process.env.LESSON_JOBS_PER_MINUTE || '100', 10);
const UPLOAD_JOBS_PER_MINUTE = parseInt(process.env.UPLOAD_JOBS_PER_MINUTE || '50', 10);
const WINDOW_SIZE_SECONDS = 60;

let rateLimitClient = null;

async function getRateLimitClient() {
  // Disable rate limiting in test/CI mode or if explicitly disabled
  if (!RATE_LIMIT_ENABLED || process.env.DISABLE_QUEUES === 'true' || process.env.CI === 'true') {
    return null;
  }

  if (rateLimitClient && rateLimitClient.isOpen) {
    return rateLimitClient;
  }

  try {
    rateLimitClient = createClient({
      url: REDIS_URL,
      socket: {
        connectTimeout: 3000, // Fail fast if Redis is unavailable
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            return false;
          }
          return Math.min(retries * 100, 3000);
        }
      }
    });

    rateLimitClient.on('error', (err) => {
      console.error('[RateLimit] Redis client error:', err);
    });

    await rateLimitClient.connect();
    console.log('[RateLimit] Connected to Redis');

    return rateLimitClient;
  } catch (error) {
    console.error('[RateLimit] Failed to connect to Redis, rate limiting disabled:', error.message);
    return null;
  }
}

/**
 * Check if user has exceeded rate limit
 * Uses sliding window algorithm
 */
export async function checkRateLimit(userId, jobType) {
  const client = await getRateLimitClient();
  if (!client) {
    // If rate limiting is disabled or unavailable, allow all requests
    return { allowed: true, remaining: Infinity };
  }

  const limit = jobType === 'lesson' ? LESSON_JOBS_PER_MINUTE : UPLOAD_JOBS_PER_MINUTE;
  const key = `ratelimit:${jobType}:${userId}`;
  const now = Date.now();
  const windowStart = now - (WINDOW_SIZE_SECONDS * 1000);

  try {
    // Remove old entries outside the window
    await client.zRemRangeByScore(key, 0, windowStart);

    // Count current requests in window
    const count = await client.zCard(key);

    if (count >= limit) {
      console.log(`[RateLimit] User ${userId} exceeded ${jobType} limit (${count}/${limit})`);
      return {
        allowed: false,
        remaining: 0,
        limit,
        retryAfter: WINDOW_SIZE_SECONDS
      };
    }

    // Add this request to the window
    await client.zAdd(key, {
      score: now,
      value: `${now}-${Math.random()}`
    });

    // Set expiry on the key
    await client.expire(key, WINDOW_SIZE_SECONDS * 2);

    return {
      allowed: true,
      remaining: limit - count - 1,
      limit
    };
  } catch (error) {
    console.error('[RateLimit] Error checking rate limit:', error);
    // On error, allow the request (fail open)
    return { allowed: true, remaining: limit };
  }
}

/**
 * Get current rate limit status for a user
 */
export async function getRateLimitStatus(userId, jobType) {
  const client = await getRateLimitClient();
  if (!client) {
    return { count: 0, limit: Infinity };
  }

  const limit = jobType === 'lesson' ? LESSON_JOBS_PER_MINUTE : UPLOAD_JOBS_PER_MINUTE;
  const key = `ratelimit:${jobType}:${userId}`;
  const now = Date.now();
  const windowStart = now - (WINDOW_SIZE_SECONDS * 1000);

  try {
    // Remove old entries
    await client.zRemRangeByScore(key, 0, windowStart);

    // Count current requests
    const count = await client.zCard(key);

    return {
      count,
      limit,
      remaining: Math.max(0, limit - count)
    };
  } catch (error) {
    console.error('[RateLimit] Error getting rate limit status:', error);
    return { count: 0, limit };
  }
}

/**
 * Graceful shutdown
 */
export async function closeRateLimitClient() {
  if (rateLimitClient && rateLimitClient.isOpen) {
    await rateLimitClient.quit();
    console.log('[RateLimit] Closed Redis connection');
  }
}

// Cleanup on process termination
process.on('SIGTERM', closeRateLimitClient);
process.on('SIGINT', closeRateLimitClient);
