/**
 * Public auth-endpoint rate limiting (Phase 07B / H1, extended by Phase 26B-3).
 *
 * login, register and the two password-recovery routes are the unauthenticated
 * write endpoints, so they are the vectors for credential stuffing, password
 * spraying, brute force, mass account creation, reset-mail flooding and
 * reset-token guessing. They get dedicated limiters (stricter than the rest of
 * the API, which has none).
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

import type { Request, Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

import { normalizeEmail } from '../utils/validate.ts';

/**
 * The tunable limits every auth limiter is built from. Declared explicitly
 * because `authRateConfig` both accepts a PARTIAL override of it and returns a
 * COMPLETE one — a shape TypeScript cannot infer from the function itself.
 */
export type AuthRateConfig = {
  loginWindowMs: number;
  loginMax: number;
  loginIpWindowMs: number;
  loginIpMax: number;
  registerWindowMs: number;
  registerMax: number;
  passwordResetWindowMs: number;
  passwordResetMax: number;
  passwordResetIpWindowMs: number;
  passwordResetIpMax: number;
  passwordResetConfirmWindowMs: number;
  passwordResetConfirmMax: number;
};

function positiveInt(raw: string | undefined, fallback: number): number {
  // `?? ''` parses to NaN, which the guard below turns into the fallback — the
  // same result the untyped version produced for a missing variable.
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * The client address the limiters key on. Express types `req.ip` as possibly
 * undefined, but it is always populated for a request that reached a limiter
 * (it falls back to the socket address). `ipKeyGenerator` would throw on an
 * undefined address in the original code too, so this assertion states an
 * existing assumption rather than introducing a fallback that would change
 * behaviour under the `trust proxy` settings documented below.
 */
function clientIp(request: Request): string {
  return request.ip as string;
}

/** Base limits; individual keys can be overridden per router (tests/tuning). */
export function authRateConfig(overrides: Partial<AuthRateConfig> = {}): AuthRateConfig {
  return {
    loginWindowMs: positiveInt(process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    loginMax: positiveInt(process.env.AUTH_LOGIN_RATE_LIMIT_MAX, 10),
    loginIpWindowMs: positiveInt(process.env.AUTH_LOGIN_IP_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    loginIpMax: positiveInt(process.env.AUTH_LOGIN_IP_RATE_LIMIT_MAX, 60),
    registerWindowMs: positiveInt(process.env.AUTH_REGISTER_RATE_LIMIT_WINDOW_MS, 60 * 60 * 1000),
    registerMax: positiveInt(process.env.AUTH_REGISTER_RATE_LIMIT_MAX, 30),
    // Password recovery (Phase 26B-3). Longer windows than login: a recovery
    // link is valid for 30 minutes and a user who needs one needs it once, so
    // there is no legitimate burst to protect.
    passwordResetWindowMs: positiveInt(
      process.env.AUTH_PASSWORD_RESET_RATE_LIMIT_WINDOW_MS,
      60 * 60 * 1000
    ),
    passwordResetMax: positiveInt(process.env.AUTH_PASSWORD_RESET_RATE_LIMIT_MAX, 5),
    passwordResetIpWindowMs: positiveInt(
      process.env.AUTH_PASSWORD_RESET_IP_RATE_LIMIT_WINDOW_MS,
      60 * 60 * 1000
    ),
    passwordResetIpMax: positiveInt(process.env.AUTH_PASSWORD_RESET_IP_RATE_LIMIT_MAX, 20),
    passwordResetConfirmWindowMs: positiveInt(
      process.env.AUTH_PASSWORD_RESET_CONFIRM_RATE_LIMIT_WINDOW_MS,
      15 * 60 * 1000
    ),
    passwordResetConfirmMax: positiveInt(process.env.AUTH_PASSWORD_RESET_CONFIRM_RATE_LIMIT_MAX, 20),
    ...overrides,
  };
}

/** Shared response conventions for every auth rate-limit block. */
function limitResponse(code: string, message: string) {
  return {
    // IETF draft-7 RateLimit / RateLimit-Policy + Retry-After headers.
    // `as const` keeps the literal: the library types this option as a union of
    // three header dialects, and a widened `string` matches none of them.
    standardHeaders: 'draft-7' as const,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => res.status(429).json({ error: message, code }),
  };
}

/**
 * Login limiter #1 — per IP + normalized email (strict). Only non-2xx
 * responses count, so failed password attempts accumulate and lock the
 * ip+account until the window elapses, while correct logins pass through.
 */
export function createLoginAccountLimiter(overrides: Partial<AuthRateConfig> = {}) {
  const { loginWindowMs, loginMax } = authRateConfig(overrides);
  return rateLimit({
    windowMs: loginWindowMs,
    limit: loginMax,
    skipSuccessfulRequests: true,
    // ipKeyGenerator masks IPv6 down to /56 so one host can't fan out 2^64
    // keys; the email half (normalized exactly like auth.service login) scopes
    // the budget to a single account.
    keyGenerator(request) {
      const ip = ipKeyGenerator(clientIp(request));
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
export function createLoginIpLimiter(overrides: Partial<AuthRateConfig> = {}) {
  const { loginIpWindowMs, loginIpMax } = authRateConfig(overrides);
  return rateLimit({
    windowMs: loginIpWindowMs,
    limit: loginIpMax,
    skipSuccessfulRequests: true,
    keyGenerator(request) {
      return ipKeyGenerator(clientIp(request));
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
export function createRegisterLimiter(overrides: Partial<AuthRateConfig> = {}) {
  const { registerWindowMs, registerMax } = authRateConfig(overrides);
  return rateLimit({
    windowMs: registerWindowMs,
    limit: registerMax,
    keyGenerator(request) {
      return ipKeyGenerator(clientIp(request));
    },
    ...limitResponse(
      'REGISTER_RATE_LIMITED',
      'Too many registration attempts. Please wait a while and try again.'
    ),
  });
}

// ---------------------------------------------------------------------------
// Password recovery (Phase 26B-3)
// ---------------------------------------------------------------------------
//
// OWASP treats password-recovery endpoints as authentication endpoints, so these
// follow the login/register pattern rather than inventing anything.
//
// THE ONE DELIBERATE DIVERGENCE from createLoginAccountLimiter:
// `skipSuccessfulRequests` is OMITTED — every attempt counts. On login that
// option is what stops legitimate users locking themselves out with their own
// correct passwords. Here it would silently DISABLE the limiter: the success
// path and the silent no-op are deliberately indistinguishable (both answer the
// same 202), so there is no failure to count and the budget would never be spent.
// Counting every attempt is also what makes the limiter enumeration-neutral —
// a known address and an unknown one consume it identically.
//
// SHARED CODE: all three answer PASSWORD_RESET_RATE_LIMITED, the way
// LOGIN_RATE_LIMITED already spans the two login limiters. A client needs to
// know "you are being throttled on recovery", not which bucket caught it.
const PASSWORD_RESET_RATE_LIMITED = 'PASSWORD_RESET_RATE_LIMITED';

/**
 * Recovery limiter #1 — per IP + normalized email (strict). Bounds how often one
 * account can be mailed, so the endpoint cannot be used to flood a victim's inbox
 * or to burn this server's provider quota against a single address.
 *
 * The key is a CLIENT-SUPPLIED EMAIL, exactly as createLoginAccountLimiter
 * already keys. That is not the forbidden "trust a client identity" case: a
 * userId/businessId is an AUTHORIZATION identity and must never be taken from a
 * request, whereas the address here is the SUBJECT of the request. Keying on it
 * grants nothing — a forged address only spends that address's own budget, and a
 * correct-but-unknown address spends it identically.
 */
export function createPasswordResetRequestAccountLimiter(overrides: Partial<AuthRateConfig> = {}) {
  const { passwordResetWindowMs, passwordResetMax } = authRateConfig(overrides);
  return rateLimit({
    windowMs: passwordResetWindowMs,
    limit: passwordResetMax,
    keyGenerator(request) {
      const ip = ipKeyGenerator(clientIp(request));
      const email = normalizeEmail(request.body?.email);
      return `${ip}|${email || '(no-email)'}`;
    },
    ...limitResponse(
      PASSWORD_RESET_RATE_LIMITED,
      'Too many password reset requests. Please wait and try again.'
    ),
  });
}

/**
 * Recovery limiter #2 — per IP, higher cap. The backstop for the account bucket:
 * an attacker rotating addresses would otherwise get a fresh budget per address,
 * while a legitimate user sharing an office NAT is unaffected at this cap.
 * Same explicit request.ip keying rationale as createLoginIpLimiter — never the
 * library default, which turns a spoofed X-Forwarded-For into a 500.
 */
export function createPasswordResetRequestIpLimiter(overrides: Partial<AuthRateConfig> = {}) {
  const { passwordResetIpWindowMs, passwordResetIpMax } = authRateConfig(overrides);
  return rateLimit({
    windowMs: passwordResetIpWindowMs,
    limit: passwordResetIpMax,
    keyGenerator(request) {
      return ipKeyGenerator(clientIp(request));
    },
    ...limitResponse(
      PASSWORD_RESET_RATE_LIMITED,
      'Too many password reset requests. Please wait and try again.'
    ),
  });
}

/**
 * Confirmation limiter — per IP. reset-password carries no address to key on,
 * and keying on the token would be pointless (an attacker simply rotates it), so
 * the cap is per source. It matters because each accepted attempt costs a SHA-256
 * lookup, an atomic claim and a bcrypt hash on an unauthenticated endpoint.
 */
export function createPasswordResetConfirmLimiter(overrides: Partial<AuthRateConfig> = {}) {
  const { passwordResetConfirmWindowMs, passwordResetConfirmMax } = authRateConfig(overrides);
  return rateLimit({
    windowMs: passwordResetConfirmWindowMs,
    limit: passwordResetConfirmMax,
    keyGenerator(request) {
      return ipKeyGenerator(clientIp(request));
    },
    ...limitResponse(
      PASSWORD_RESET_RATE_LIMITED,
      'Too many password reset attempts. Please wait and try again.'
    ),
  });
}

export default {
  authRateConfig,
  createLoginAccountLimiter,
  createLoginIpLimiter,
  createRegisterLimiter,
  createPasswordResetRequestAccountLimiter,
  createPasswordResetRequestIpLimiter,
  createPasswordResetConfirmLimiter,
};
