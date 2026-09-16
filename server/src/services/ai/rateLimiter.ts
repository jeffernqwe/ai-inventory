/**
 * In-memory per-user rate limiter for AI requests (SYSTEM_SPECIFICATION.md §25:
 * "AI requests must be authenticated and rate-limited").
 *
 * V1 cost protection: fixed window, keyed by the authenticated user id, with
 * limits read lazily from env (AI_RATE_LIMIT_MAX / AI_RATE_LIMIT_WINDOW_MS).
 * State resets on process restart — acceptable for V1 (no cross-node store,
 * no billing system). Expired windows are pruned so memory stays bounded.
 */

import type { NextFunction, Request, Response } from 'express';

import { aiConfig } from './aiConfig.ts';

/**
 * The request context this middleware reads, following the other migrated
 * middleware: `user` is optional because a handler is registered against
 * Express's `RequestHandler`, whose parameter is a plain `Request`; a required
 * `user` would make that `Request` unassignable and the route registration a
 * type error. The read below uses `?.` exactly as the original did, so a request
 * that somehow reached this limiter unauthenticated still falls back to the IP
 * bucket rather than throwing.
 */
type AuthenticatedRequest = Request & { user?: { id: string } };

function createAiRateLimiter() {
  const hits = new Map<string, number[]>(); // userId -> number[] (timestamps within the current window)

  function prune(now: number, windowMs: number) {
    for (const [key, stamps] of hits) {
      const kept = stamps.filter((t) => now - t < windowMs);
      if (kept.length) hits.set(key, kept);
      else hits.delete(key);
    }
  }

  return function aiRateLimit(req: AuthenticatedRequest, res: Response, next: NextFunction) {
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
