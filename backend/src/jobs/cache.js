/**
 * Lesson Caching Layer
 *
 * Caches generated lessons to avoid regenerating the same content.
 * Uses Redis for distributed caching across multiple workers.
 */

import { createClient } from 'redis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const CACHE_ENABLED = process.env.ENABLE_LESSON_CACHE !== 'false';
const CACHE_TTL = parseInt(process.env.LESSON_CACHE_TTL || '86400', 10); // 24 hours default

let cacheClient = null;

async function getCacheClient() {
  // Disable cache in test/CI mode or if explicitly disabled
  if (!CACHE_ENABLED || process.env.DISABLE_QUEUES === 'true' || process.env.CI === 'true') {
    return null;
  }

  if (cacheClient && cacheClient.isOpen) {
    return cacheClient;
  }

  try {
    cacheClient = createClient({
      url: REDIS_URL,
      socket: {
        connectTimeout: 3000, // Fail fast if Redis is unavailable
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error('[Cache] Too many reconnection attempts, disabling cache');
            return false;
          }
          return Math.min(retries * 100, 3000);
        }
      }
    });

    cacheClient.on('error', (err) => {
      console.error('[Cache] Redis client error:', err);
    });

    await cacheClient.connect();
    console.log('[Cache] Connected to Redis cache');

    return cacheClient;
  } catch (error) {
    console.error('[Cache] Failed to connect to Redis cache, caching disabled:', error.message);
    return null;
  }
}

/**
 * Generate cache key for a lesson
 */
function getLessonCacheKey(document_id, section_id, include_check_ins) {
  const checkInsFlag = include_check_ins ? 'with-checkins' : 'no-checkins';
  if (section_id) {
    return `lesson:${document_id}:section:${section_id}:${checkInsFlag}`;
  }
  return `lesson:${document_id}:${checkInsFlag}`;
}

/**
 * Get cached lesson
 */
export async function getCachedLesson(document_id, section_id, include_check_ins = true) {
  const client = await getCacheClient();
  if (!client) return null;

  try {
    const key = getLessonCacheKey(document_id, section_id, include_check_ins);
    const cached = await client.get(key);

    if (cached) {
      console.log(`[Cache] HIT for ${key}`);
      return JSON.parse(cached);
    }

    console.log(`[Cache] MISS for ${key}`);
    return null;
  } catch (error) {
    console.error('[Cache] Error getting cached lesson:', error);
    return null;
  }
}

/**
 * Cache a lesson
 */
export async function cacheLesson(document_id, section_id, include_check_ins, lessonData) {
  const client = await getCacheClient();
  if (!client) return;

  try {
    const key = getLessonCacheKey(document_id, section_id, include_check_ins);
    await client.set(key, JSON.stringify(lessonData), {
      EX: CACHE_TTL
    });
    console.log(`[Cache] Stored ${key} (TTL: ${CACHE_TTL}s)`);
  } catch (error) {
    console.error('[Cache] Error caching lesson:', error);
  }
}

/**
 * Invalidate cached lessons for a document
 */
export async function invalidateLessonCache(document_id) {
  const client = await getCacheClient();
  if (!client) return;

  try {
    // Delete all keys matching the document
    const pattern = `lesson:${document_id}:*`;
    const keys = await client.keys(pattern);

    if (keys.length > 0) {
      await client.del(keys);
      console.log(`[Cache] Invalidated ${keys.length} cached lessons for document ${document_id}`);
    }
  } catch (error) {
    console.error('[Cache] Error invalidating cache:', error);
  }
}

/**
 * Graceful shutdown
 */
export async function closeCacheClient() {
  if (cacheClient && cacheClient.isOpen) {
    await cacheClient.quit();
    console.log('[Cache] Closed Redis cache connection');
  }
}

// Cleanup on process termination
process.on('SIGTERM', closeCacheClient);
process.on('SIGINT', closeCacheClient);
