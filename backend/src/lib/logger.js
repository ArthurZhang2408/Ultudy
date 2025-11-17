/**
 * Structured logging utility for the backend
 * Replaces scattered console.log statements with proper logging levels
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

// Default to INFO in production, DEBUG in development
const currentLevel = process.env.LOG_LEVEL
  ? LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()]
  : process.env.NODE_ENV === 'production'
    ? LOG_LEVELS.INFO
    : LOG_LEVELS.DEBUG;

/**
 * Format log message with timestamp and context
 */
function formatMessage(level, context, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const contextStr = context ? `[${context}]` : '';
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';

  return `${timestamp} ${level} ${contextStr} ${message}${metaStr}`;
}

/**
 * Log debug information (verbose, for development)
 */
export function debug(context, message, meta) {
  if (currentLevel <= LOG_LEVELS.DEBUG) {
    console.log(formatMessage('DEBUG', context, message, meta));
  }
}

/**
 * Log informational messages
 */
export function info(context, message, meta) {
  if (currentLevel <= LOG_LEVELS.INFO) {
    console.log(formatMessage('INFO', context, message, meta));
  }
}

/**
 * Log warnings
 */
export function warn(context, message, meta) {
  if (currentLevel <= LOG_LEVELS.WARN) {
    console.warn(formatMessage('WARN', context, message, meta));
  }
}

/**
 * Log errors
 */
export function error(context, message, meta) {
  if (currentLevel <= LOG_LEVELS.ERROR) {
    console.error(formatMessage('ERROR', context, message, meta));
  }
}

/**
 * Create a logger with a fixed context
 */
export function createLogger(context) {
  return {
    debug: (message, meta) => debug(context, message, meta),
    info: (message, meta) => info(context, message, meta),
    warn: (message, meta) => warn(context, message, meta),
    error: (message, meta) => error(context, message, meta)
  };
}

export default {
  debug,
  info,
  warn,
  error,
  createLogger
};
