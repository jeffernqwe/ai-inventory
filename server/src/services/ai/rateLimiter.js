/**
 * In-memory per-user rate limiter for AI requests (SYSTEM_SPECIFICATION.md §25:
 * "AI requests must be authenticated and rate-limited").
 *
 * V1 cost protection: fixed window, keyed by the authenticated user id, with
 * limits read lazily from env (AI_RATE_LIMIT_MAX / AI_RATE_LIMIT_WINDOW_MS).
 * State resets on process restart — acceptable for V1 (no cross-node store,
 * no billing system). Expired windows are pruned so memory stays bounded.
 */

import { aiConfig } from './aiConfig.js';

function createAiRateLimiter() {
  const hits = new Map(); // userId -> number[] (timestamps within the current window)

  function prune(now, windowMs) {
    for (const [key, stamps] of hits) {
      const kept = stamps.filter((t) => now - t < windowMs);
      if (kept.length) hits.set(key, kept);
      else hits.delete(key);
    }
  }

  return function aiRateLimit(req, res, next) {
    const cfg = aiConfig();
    const key = req.user?.id || `ip:${req.ip || 'unknown'}`;
    const now = Date.now();
    prune(now, cfg.rateLimitWindowMs);

    const stamps = hits.get(key) || [];
    if (stamps.length >= cfg.rateLimitMax) {
      res.set('Retry-After', String(Math.ceil(cfg.rateLimitWindowMs / 1000)));
      return res.status(429).json({
        error: 'Too many AI requests. Please wait a moment and try again.',
        code: 'AI_RATE_LIMITED',
      });
    }
    stamps.push(now);
    hits.set(key, stamps);
    next();
  };
}

export const aiRateLimiter = createAiRateLimiter();

export default aiRateLimiter;
