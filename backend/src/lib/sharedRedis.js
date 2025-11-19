/**
 * Shared Redis Client
 *
 * Provides a singleton Redis client to prevent connection exhaustion
 */

import { createClient } from 'redis';

let sharedRedisClient = null;
let isConnecting = false;
let connectionPromise = null;

export async function getSharedRedisClient() {
  // If client already exists and is ready, return it
  if (sharedRedisClient && sharedRedisClient.isReady) {
    return sharedRedisClient;
  }

  // If connection is in progress, wait for it
  if (isConnecting && connectionPromise) {
    return connectionPromise;
  }

  // Start new connection
  isConnecting = true;
  connectionPromise = (async () => {
    try {
      const redisUrl = process.env.REDIS_URL;

      if (!redisUrl) {
        console.log('[SharedRedis] No REDIS_URL configured');
        return null;
      }

      sharedRedisClient = createClient({
        url: redisUrl,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 5) {
              console.error('[SharedRedis] Max reconnection attempts reached');
              return new Error('Max reconnection attempts reached');
            }
            return Math.min(retries * 100, 3000);
          }
        }
      });

      sharedRedisClient.on('error', (err) => {
        console.error('[SharedRedis] Error:', err.message);
      });

      sharedRedisClient.on('connect', () => {
        console.log('[SharedRedis] Connected to Redis');
      });

      sharedRedisClient.on('ready', () => {
        console.log('[SharedRedis] Redis client ready');
      });

      await sharedRedisClient.connect();

      return sharedRedisClient;
    } catch (error) {
      console.error('[SharedRedis] Failed to connect:', error);
      sharedRedisClient = null;
      throw error;
    } finally {
      isConnecting = false;
      connectionPromise = null;
    }
  })();

  return connectionPromise;
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  if (sharedRedisClient) {
    console.log('[SharedRedis] Closing connection...');
    await sharedRedisClient.quit();
  }
});

export default getSharedRedisClient;
