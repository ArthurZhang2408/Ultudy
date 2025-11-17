/**
 * Request Validation Middleware
 * Validates and sanitizes request inputs to prevent common vulnerabilities
 */

/**
 * Validates UUID format
 */
export function isValidUUID(value) {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return typeof value === 'string' && UUID_REGEX.test(value);
}

/**
 * Validates string length
 */
export function isValidStringLength(value, min = 1, max = 255) {
  return typeof value === 'string' && value.length >= min && value.length <= max;
}

/**
 * Validates number range
 */
export function isValidNumber(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const num = Number(value);
  return Number.isFinite(num) && num >= min && num <= max;
}

/**
 * Sanitizes string input to prevent XSS
 */
export function sanitizeString(value) {
  if (typeof value !== 'string') return '';
  // Remove null bytes and control characters except newlines/tabs
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Middleware to validate required fields
 */
export function validateRequired(fields) {
  return (req, res, next) => {
    const missing = [];

    for (const field of fields) {
      const value = req.body?.[field] || req.query?.[field] || req.params?.[field];
      if (value === undefined || value === null || value === '') {
        missing.push(field);
      }
    }

    if (missing.length > 0) {
      return res.status(400).json({
        error: 'validation_error',
        message: `Missing required fields: ${missing.join(', ')}`
      });
    }

    next();
  };
}

/**
 * Middleware to validate UUID parameters
 */
export function validateUUID(paramName) {
  return (req, res, next) => {
    const value = req.params?.[paramName] || req.body?.[paramName] || req.query?.[paramName];

    if (!value) {
      return res.status(400).json({
        error: 'validation_error',
        message: `${paramName} is required`
      });
    }

    if (!isValidUUID(value)) {
      return res.status(400).json({
        error: 'validation_error',
        message: `${paramName} must be a valid UUID`
      });
    }

    next();
  };
}

/**
 * Middleware to validate file uploads
 */
export function validateFileUpload(options = {}) {
  const {
    maxSize = 50 * 1024 * 1024, // 50MB default
    allowedMimeTypes = ['application/pdf'],
    required = true
  } = options;

  return (req, res, next) => {
    if (!req.file && required) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'File is required'
      });
    }

    if (req.file) {
      // Check file size
      if (req.file.size > maxSize) {
        return res.status(400).json({
          error: 'validation_error',
          message: `File size exceeds maximum allowed size of ${maxSize / 1024 / 1024}MB`
        });
      }

      // Check MIME type
      if (allowedMimeTypes && !allowedMimeTypes.includes(req.file.mimetype)) {
        return res.status(400).json({
          error: 'validation_error',
          message: `File type ${req.file.mimetype} not allowed. Allowed types: ${allowedMimeTypes.join(', ')}`
        });
      }
    }

    next();
  };
}

/**
 * Rate limiting helper (basic in-memory implementation)
 * For production, use Redis-based rate limiting
 */
const rateLimitStore = new Map();

export function createRateLimiter(options = {}) {
  const {
    windowMs = 60000, // 1 minute
    maxRequests = 100,
    keyGenerator = (req) => req.userId || req.ip
  } = options;

  return (req, res, next) => {
    const key = keyGenerator(req);
    const now = Date.now();

    // Clean up old entries
    const cutoff = now - windowMs;
    for (const [k, v] of rateLimitStore.entries()) {
      if (v.resetTime < cutoff) {
        rateLimitStore.delete(k);
      }
    }

    // Check current user
    const userLimit = rateLimitStore.get(key) || { count: 0, resetTime: now + windowMs };

    if (userLimit.count >= maxRequests && now < userLimit.resetTime) {
      const retryAfter = Math.ceil((userLimit.resetTime - now) / 1000);
      return res.status(429).json({
        error: 'rate_limit_exceeded',
        message: 'Too many requests',
        retryAfter
      });
    }

    // Update count
    userLimit.count += 1;
    rateLimitStore.set(key, userLimit);

    // Set headers
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - userLimit.count));
    res.setHeader('X-RateLimit-Reset', new Date(userLimit.resetTime).toISOString());

    next();
  };
}

export default {
  isValidUUID,
  isValidStringLength,
  isValidNumber,
  sanitizeString,
  validateRequired,
  validateUUID,
  validateFileUpload,
  createRateLimiter
};
