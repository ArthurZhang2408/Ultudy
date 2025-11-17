import dotenv from 'dotenv';
import createApp from './app.js';
import { validateLLMProviderConfig } from './providers/llm/index.js';
import { validateConfig } from './config.js';
import { closePool } from './db/index.js';
import { stopRateLimitCleanup } from './middleware/validation.js';

dotenv.config();

// Validate configuration on startup
try {
  validateConfig();
  console.log('[Config] Validation passed');
} catch (error) {
  console.error('[Config] Validation failed:', error.message);
  process.exit(1);
}

try {
  validateLLMProviderConfig();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}

const PORT = process.env.PORT || 3001;
const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});

// Graceful shutdown handler
async function gracefulShutdown(signal) {
  console.log(`\n[Server] Received ${signal}, starting graceful shutdown...`);

  // Stop accepting new connections
  server.close(() => {
    console.log('[Server] HTTP server closed');
  });

  // Clean up resources
  try {
    await closePool();
    stopRateLimitCleanup();
    console.log('[Server] Cleanup completed');
    process.exit(0);
  } catch (error) {
    console.error('[Server] Error during cleanup:', error);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
