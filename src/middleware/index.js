import rateLimit from 'express-rate-limit';
import redis from '../config/redis.js';

// ─── 1. Global Error Handler ──────────────────────────────────────────────────
/**
 * Concept: middleware with next(err)
 * Express calls this when next(error) is invoked anywhere in the app.
 * Signature MUST have 4 params for Express to treat it as error handler.
 */
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  console.error(`[ERROR] ${req.method} ${req.path} → ${status}: ${message}`);

  res.status(status).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

// ─── 2. Not Found Handler ─────────────────────────────────────────────────────
export const notFound = (req, _res, next) => {
  const err = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  err.status = 404;
  next(err); // passes error to errorHandler above
};

// ─── 3. Rate Limiter ──────────────────────────────────────────────────────────
export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

// ─── 4. Redis Cache Middleware ────────────────────────────────────────────────
/**
 * Concept: middleware + Redis caching
 * Checks Redis before hitting MongoDB. Cache miss → fetch DB → store in Redis.
 * next() is called to proceed when cache misses.
 */
export const cacheMiddleware = (ttl = 300) => async (req, res, next) => {
  // Only cache GET requests
  if (req.method !== 'GET') { return next(); }

  const cacheKey = `cache:${req.originalUrl}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json({ ...cached, fromCache: true });
    }

    // Monkey-patch res.json to intercept and cache the response
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      if (res.statusCode === 200 && data.success) {
        redis.set(cacheKey, data, ttl).catch(console.error);
      }
      return originalJson(data);
    };

    next();
  } catch (err) {
    // Cache failure should not break the request
    console.error('[Cache] Redis error:', err.message);
    next();
  }
};

// ─── 5. Request Logger ────────────────────────────────────────────────────────
export const requestLogger = (req, _res, next) => {
  console.log(`[REQ] ${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
  next();
};

// ─── 6. Validate ObjectId ────────────────────────────────────────────────────
export const validateObjectId = (req, res, next) => {
  const { id } = req.params;
  if (id && !/^[a-fA-F0-9]{24}$/.test(id)) {
    return res.status(400).json({ success: false, message: 'Invalid ID format' });
  }
  next();
};

// ─── 7. Async Handler Wrapper ─────────────────────────────────────────────────
/**
 * Wraps async route handlers so errors are passed to next() automatically.
 * Without this, unhandled promise rejections in async controllers would crash.
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
