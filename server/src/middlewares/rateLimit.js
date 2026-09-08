/**
 * Public auth-endpoint rate limiting (Phase 07B / H1).
 *
 * POST /api/auth/login and /api/auth/register are the only unauthenticated
 * write endpoints, so they are the vectors for credential stuffing, password
 * spraying, brute force, and mass account creation. They get dedicated
 * limiters (stricter than the rest of the API, which has none).
 *
 *   login   -> two stacked limiters:
 *               1) per IP + normalized-email bucket, strict (targeted brute
 *                  force against one account). Only FAILED attempts consume
 *                  the budget (`skipSuccessfulRequests`), so legitimate users
 *                  are never locked out by their own successes.
 *               2) per-IP bucket with a higher cap (password spraying across
 *                  many accounts from one source).
 *   register -> per-IP bucket, counting every attempt. Keying registration by
 *               the unique email would let bots bypass it by cycling emails.
 *
 * Limits are read from the environment at limiter-creation time (same lazy
 * pattern as services/ai/aiConfig.js) so operators can tune them without code
 * changes, and each factory returns a FRESH limiter with its own in-memory
 * store — mounting a new router (see createAuthRouter in routes/auth.routes.js)
 * gives isolated stores, which tests use to keep runs deterministic.
 *
 * Responses follow the project's error shape ({ error, code }) and never
 * include passwords, hashes, tokens, or internal details. In-memory stores are
 * process-local: a multi-instance / serverless deployment needs a shared store
 * (e.g. Redis) — out of scope for V1, documented in the wiki of this library.
 */

import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

import { normalizeEmail } from '../utils/validate.js';

function positiveInt(raw, fallback) {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Base limits; individual keys can be overridden per router (tests/tuning). */
export function authRateConfig(overrides = {}) {
  return {
    loginWindowMs: positiveInt(process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    loginMax: positiveInt(process.env.AUTH_LOGIN_RATE_LIMIT_MAX, 10),
    loginIpWindowMs: positiveInt(process.env.AUTH_LOGIN_IP_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    loginIpMax: positiveInt(process.env.AUTH_LOGIN_IP_RATE_LIMIT_MAX, 60),
    registerWindowMs: positiveInt(process.env.AUTH_REGISTER_RATE_LIMIT_WINDOW_MS, 60 * 60 * 1000),
    registerMax: positiveInt(process.env.AUTH_REGISTER_RATE_LIMIT_MAX, 30),
    ...overrides,
  };
}

/** Shared response conventions for every auth rate-limit block. */
function limitResponse(code, message) {
  return {
    // IETF draft-7 RateLimit / RateLimit-Policy + Retry-After headers.
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: message, code }),
  };
}

/**
 * Login limiter #1 — per IP + normalized email (strict). Only non-2xx
 * responses count, so failed password attempts accumulate and lock the
 * ip+account until the window elapses, while correct logins pass through.
 */
export function createLoginAccountLimiter(overrides = {}) {
  const { loginWindowMs, loginMax } = authRateConfig(overrides);
  return rateLimit({
    windowMs: loginWindowMs,
    limit: loginMax,
    skipSuccessfulRequests: true,
    // ipKeyGenerator masks IPv6 down to /56 so one host can't fan out 2^64
    // keys; the email half (normalized exactly like auth.service login) scopes
    // the budget to a single account.
    keyGenerator(request) {
      const ip = ipKeyGenerator(request.ip);
      const email = normalizeEmail(request.body?.email);
      return `${ip}|${email || '(no-email)'}`;
    },
    ...limitResponse(
      'LOGIN_RATE_LIMITED',
      'Too many login attempts. Please wait a moment and try again.'
    ),
  });
}

/**
 * Login limiter #2 — per IP, higher cap. Stops password spraying (many
 * accounts, one source) that would otherwise hop between per-account buckets.
 *
 * Keyed explicitly on request.ip (not the library default keyGenerator):
 * express-rate-limit's default keyGenerator throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
 * whenever a request carries X-Forwarded-For while `trust proxy` is off —
 * turning a spoofed header into a 500. Deliberately keying on request.ip keeps
 * the same behavior in the common case while IGNORING forwarded headers until
 * the operator explicitly sets TRUST_PROXY (see config/env.js): under trust 0,
 * request.ip is always the direct peer, so spoofed headers cannot create fresh
 * buckets; under trust N, request.ip resolves to the forwarded client IP and
 * the limiter keys on the real client, exactly as configured.
 */
export function createLoginIpLimiter(overrides = {}) {
  const { loginIpWindowMs, loginIpMax } = authRateConfig(overrides);
  return rateLimit({
    windowMs: loginIpWindowMs,
    limit: loginIpMax,
    skipSuccessfulRequests: true,
    keyGenerator(request) {
      return ipKeyGenerator(request.ip);
    },
    ...limitResponse(
      'LOGIN_RATE_LIMITED',
      'Too many login attempts. Please wait a moment and try again.'
    ),
  });
}

/**
 * Registration limiter — per IP, counting every attempt (mass signups). Same
 * explicit request.ip keying rationale as createLoginIpLimiter above.
 */
export function createRegisterLimiter(overrides = {}) {
  const { registerWindowMs, registerMax } = authRateConfig(overrides);
  return rateLimit({
    windowMs: registerWindowMs,
    limit: registerMax,
    keyGenerator(request) {
      return ipKeyGenerator(request.ip);
    },
    ...limitResponse(
      'REGISTER_RATE_LIMITED',
      'Too many registration attempts. Please wait a while and try again.'
    ),
  });
}

export default {
  authRateConfig,
  createLoginAccountLimiter,
  createLoginIpLimiter,
  createRegisterLimiter,
};
