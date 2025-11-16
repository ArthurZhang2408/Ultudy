/**
 * Lesson Cache Utility
 *
 * Implements localStorage caching for lessons to reduce backend load
 * and improve page refresh performance.
 */

const CACHE_KEY_PREFIX = 'lesson-cache:';
const CACHE_VERSION = 'v1';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_SIZE = 4 * 1024 * 1024; // 4MB safety limit

type CachedLesson = {
  lesson: any;
  cachedAt: number;
  version: string;
  sectionId: string;
};

/**
 * Get cache key for a lesson
 */
function getCacheKey(documentId: string, sectionId: string): string {
  return `${CACHE_KEY_PREFIX}${documentId}:${sectionId}`;
}

/**
 * Get lesson from cache if valid
 */
export function getCachedLesson(documentId: string, sectionId: string): any | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const cacheKey = getCacheKey(documentId, sectionId);
    const cached = localStorage.getItem(cacheKey);

    if (!cached) {
      return null;
    }

    const parsed: CachedLesson = JSON.parse(cached);
    const age = Date.now() - parsed.cachedAt;

    // Check version and TTL
    if (parsed.version !== CACHE_VERSION) {
      console.log(`[cache] Version mismatch for ${sectionId}, clearing cache`);
      localStorage.removeItem(cacheKey);
      return null;
    }

    if (age > CACHE_TTL) {
      console.log(`[cache] Cache expired for ${sectionId} (age: ${Math.round(age / 1000 / 60)} minutes)`);
      localStorage.removeItem(cacheKey);
      return null;
    }

    console.log(`[cache] Cache hit for ${sectionId} (age: ${Math.round(age / 1000 / 60)} minutes)`);
    return parsed.lesson;
  } catch (error) {
    console.error('[cache] Error reading from cache:', error);
    return null;
  }
}

/**
 * Store lesson in cache
 */
export function setCachedLesson(
  documentId: string,
  sectionId: string,
  lesson: any
): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const cacheKey = getCacheKey(documentId, sectionId);
    const cached: CachedLesson = {
      lesson,
      cachedAt: Date.now(),
      version: CACHE_VERSION,
      sectionId
    };

    const serialized = JSON.stringify(cached);

    // Check if adding this would exceed cache size limit
    const currentSize = getCacheSize();
    const itemSize = serialized.length;

    if (currentSize + itemSize > MAX_CACHE_SIZE) {
      console.warn(`[cache] Cache size limit approaching, evicting oldest entries`);
      evictOldestCaches(1);
    }

    localStorage.setItem(cacheKey, serialized);
    console.log(`[cache] Cached lesson for ${sectionId} (${Math.round(itemSize / 1024)}KB)`);
  } catch (error) {
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      console.warn('[cache] Storage quota exceeded, evicting old caches');
      evictOldestCaches(3);

      // Try again after eviction
      try {
        const cacheKey = getCacheKey(documentId, sectionId);
        const cached: CachedLesson = {
          lesson,
          cachedAt: Date.now(),
          version: CACHE_VERSION,
          sectionId
        };
        localStorage.setItem(cacheKey, JSON.stringify(cached));
      } catch (retryError) {
        console.error('[cache] Failed to cache even after eviction:', retryError);
      }
    } else {
      console.error('[cache] Error writing to cache:', error);
    }
  }
}

/**
 * Clear cached lesson for a specific section
 */
export function clearCachedLesson(documentId: string, sectionId: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const cacheKey = getCacheKey(documentId, sectionId);
    localStorage.removeItem(cacheKey);
    console.log(`[cache] Cleared cache for ${sectionId}`);
  } catch (error) {
    console.error('[cache] Error clearing cache:', error);
  }
}

/**
 * Clear all cached lessons for a document
 */
export function clearDocumentCache(documentId: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const prefix = `${CACHE_KEY_PREFIX}${documentId}:`;
    const keys = Object.keys(localStorage);
    let cleared = 0;

    keys.forEach(key => {
      if (key.startsWith(prefix)) {
        localStorage.removeItem(key);
        cleared++;
      }
    });

    console.log(`[cache] Cleared ${cleared} cached lessons for document ${documentId}`);
  } catch (error) {
    console.error('[cache] Error clearing document cache:', error);
  }
}

/**
 * Clear all lesson caches
 */
export function clearAllLessonCaches(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const keys = Object.keys(localStorage);
    let cleared = 0;

    keys.forEach(key => {
      if (key.startsWith(CACHE_KEY_PREFIX)) {
        localStorage.removeItem(key);
        cleared++;
      }
    });

    console.log(`[cache] Cleared all ${cleared} lesson caches`);
  } catch (error) {
    console.error('[cache] Error clearing all caches:', error);
  }
}

/**
 * Get total size of lesson caches in bytes
 */
export function getCacheSize(): number {
  if (typeof window === 'undefined') {
    return 0;
  }

  try {
    let size = 0;
    const keys = Object.keys(localStorage);

    keys.forEach(key => {
      if (key.startsWith(CACHE_KEY_PREFIX)) {
        const item = localStorage.getItem(key);
        if (item) {
          size += item.length;
        }
      }
    });

    return size;
  } catch (error) {
    console.error('[cache] Error calculating cache size:', error);
    return 0;
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  count: number;
  sizeKB: number;
  sizeMB: number;
  oldest: Date | null;
  newest: Date | null;
} {
  if (typeof window === 'undefined') {
    return { count: 0, sizeKB: 0, sizeMB: 0, oldest: null, newest: null };
  }

  try {
    const keys = Object.keys(localStorage);
    let count = 0;
    let size = 0;
    let oldestTimestamp = Infinity;
    let newestTimestamp = 0;

    keys.forEach(key => {
      if (key.startsWith(CACHE_KEY_PREFIX)) {
        const item = localStorage.getItem(key);
        if (item) {
          count++;
          size += item.length;

          try {
            const parsed: CachedLesson = JSON.parse(item);
            if (parsed.cachedAt < oldestTimestamp) {
              oldestTimestamp = parsed.cachedAt;
            }
            if (parsed.cachedAt > newestTimestamp) {
              newestTimestamp = parsed.cachedAt;
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    });

    return {
      count,
      sizeKB: Math.round(size / 1024),
      sizeMB: Math.round(size / 1024 / 1024 * 100) / 100,
      oldest: oldestTimestamp !== Infinity ? new Date(oldestTimestamp) : null,
      newest: newestTimestamp !== 0 ? new Date(newestTimestamp) : null
    };
  } catch (error) {
    console.error('[cache] Error getting cache stats:', error);
    return { count: 0, sizeKB: 0, sizeMB: 0, oldest: null, newest: null };
  }
}

/**
 * Evict oldest cache entries (LRU eviction)
 */
function evictOldestCaches(count: number): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const keys = Object.keys(localStorage);
    const cacheEntries: Array<{ key: string; timestamp: number }> = [];

    // Collect all lesson cache entries with timestamps
    keys.forEach(key => {
      if (key.startsWith(CACHE_KEY_PREFIX)) {
        const item = localStorage.getItem(key);
        if (item) {
          try {
            const parsed: CachedLesson = JSON.parse(item);
            cacheEntries.push({ key, timestamp: parsed.cachedAt });
          } catch (e) {
            // If parsing fails, remove it anyway
            localStorage.removeItem(key);
          }
        }
      }
    });

    // Sort by timestamp (oldest first)
    cacheEntries.sort((a, b) => a.timestamp - b.timestamp);

    // Remove the oldest entries
    const toRemove = cacheEntries.slice(0, count);
    toRemove.forEach(entry => {
      localStorage.removeItem(entry.key);
      console.log(`[cache] Evicted old cache entry: ${entry.key}`);
    });
  } catch (error) {
    console.error('[cache] Error evicting old caches:', error);
  }
}
