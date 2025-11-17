/**
 * Optional Caching Layer with Redis
 *
 * Falls back gracefully if Redis is not configured - just skips caching
 * To enable caching, set REDIS_URL in your .env file
 *
 * Usage:
 *   import { getCached, setCached, invalidate } from './lib/cache.js';
 *
 *   // Try to get from cache
 *   const cached = await getCached('courses', userId);
 *   if (cached) return cached;
 *
 *   // Cache miss - fetch from database
 *   const courses = await fetchFromDatabase();
 *
 *   // Store in cache for 5 minutes
 *   await setCached('courses', userId, courses, 300);
 *
 *   return courses;
 */

import { createClient } from 'redis';

let redisClient = null;
let isRedisEnabled = false;

// Initialize Redis client if REDIS_URL is provided
const REDIS_URL = process.env.REDIS_URL;

if (REDIS_URL) {
  try {
    redisClient = createClient({
      url: REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error('[Cache] Max Redis reconnection attempts reached');
            return new Error('[Cache] Redis connection failed');
          }
          return Math.min(retries * 100, 3000); // Exponential backoff
        }
      }
    });

    redisClient.on('error', (err) => {
      console.error('[Cache] Redis error:', err.message);
      isRedisEnabled = false;
    });

    redisClient.on('connect', () => {
      console.log('[Cache] Connected to Redis');
      isRedisEnabled = true;
    });

    redisClient.on('ready', () => {
      console.log('[Cache] Redis client ready');
      isRedisEnabled = true;
    });

    redisClient.on('disconnect', () => {
      console.warn('[Cache] Disconnected from Redis');
      isRedisEnabled = false;
    });

    // Connect asynchronously
    redisClient.connect().catch((err) => {
      console.error('[Cache] Failed to connect to Redis:', err.message);
      console.warn('[Cache] Caching disabled - operating without cache');
      isRedisEnabled = false;
    });
  } catch (error) {
    console.error('[Cache] Error initializing Redis:', error.message);
    console.warn('[Cache] Caching disabled - operating without cache');
    isRedisEnabled = false;
  }
} else {
  console.log('[Cache] REDIS_URL not set - caching disabled');
}

/**
 * Build cache key from parts
 * Example: buildKey('courses', userId) => 'ultudy:courses:user-123'
 */
function buildKey(...parts) {
  return ['ultudy', ...parts].join(':');
}

/**
 * Get value from cache
 * Returns null if not found or if Redis is not available
 */
export async function getCached(type, ...keyParts) {
  if (!isRedisEnabled || !redisClient) {
    return null;
  }

  try {
    const key = buildKey(type, ...keyParts);
    const value = await redisClient.get(key);
    if (value) {
      return JSON.parse(value);
    }
    return null;
  } catch (error) {
    console.error('[Cache] Error getting cached value:', error.message);
    return null; // Fail gracefully
  }
}

/**
 * Set value in cache with TTL (time to live in seconds)
 * Silently fails if Redis is not available
 */
export async function setCached(type, ...args) {
  if (!isRedisEnabled || !redisClient) {
    return;
  }

  try {
    // Last argument is the value, second to last is TTL
    const value = args[args.length - 1];
    const ttl = args[args.length - 2];
    const keyParts = args.slice(0, args.length - 2);

    const key = buildKey(type, ...keyParts);
    await redisClient.setEx(key, ttl, JSON.stringify(value));
  } catch (error) {
    console.error('[Cache] Error setting cached value:', error.message);
    // Fail silently - caching is optional
  }
}

/**
 * Invalidate (delete) cached value
 */
export async function invalidate(type, ...keyParts) {
  if (!isRedisEnabled || !redisClient) {
    return;
  }

  try {
    const key = buildKey(type, ...keyParts);
    await redisClient.del(key);
  } catch (error) {
    console.error('[Cache] Error invalidating cache:', error.message);
  }
}

/**
 * Invalidate all keys matching a pattern
 * Example: invalidatePattern('courses:*') invalidates all course caches
 */
export async function invalidatePattern(pattern) {
  if (!isRedisEnabled || !redisClient) {
    return;
  }

  try {
    const fullPattern = buildKey(pattern);
    const keys = await redisClient.keys(fullPattern);

    if (keys.length > 0) {
      await redisClient.del(keys);
      console.log(`[Cache] Invalidated ${keys.length} keys matching ${fullPattern}`);
    }
  } catch (error) {
    console.error('[Cache] Error invalidating pattern:', error.message);
  }
}

/**
 * Close Redis connection (for graceful shutdown)
 */
export async function closeCache() {
  if (redisClient) {
    try {
      await redisClient.quit();
      console.log('[Cache] Redis connection closed');
    } catch (error) {
      console.error('[Cache] Error closing Redis:', error.message);
    }
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return {
    enabled: isRedisEnabled,
    connected: redisClient?.isReady || false,
    url: REDIS_URL ? 'configured' : 'not configured'
  };
}

export default {
  getCached,
  setCached,
  invalidate,
  invalidatePattern,
  closeCache,
  getCacheStats
};
