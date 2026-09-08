/**
 * Number of trusted reverse-proxy hops in front of this server (Phase 07B).
 * `0` (default) means no proxy: Express uses the direct socket address, which
 * is the safe default — forwarding headers are ignored entirely.
 *
 * Set to the exact hop count (e.g. 1 behind Render/Railway/a single load
 * balancer) so req.ip — and therefore IP-based rate limiting — sees the real
 * client IP. Never `true`: trusting an unbounded chain lets anyone spoof
 * X-Forwarded-For and bypass rate limits.
 */
function parseTrustProxy() {
  const raw = (process.env.TRUST_PROXY || '').trim().toLowerCase();
  if (!raw || raw === 'false' || raw === '0') return 0;
  if (raw === 'true') return 1;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 0;
}

/**
 * CORS allow-list (Phase 07C / M3): comma-separated exact origins
 * (e.g. "https://admin.example.com,https://example.com"). Trailing slashes are
 * ignored; empty segments dropped. If empty (default), NO browser origin is
 * allowed — native mobile clients send no Origin header and are unaffected, and
 * nothing ever receives an `Access-Control-Allow-Origin: *`.
 */
function parseCorsOrigins() {
  return (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/**
 * JSON request-body size cap (Phase 07C / L2). Global, intentionally small —
 * every V1 endpoint (product, category, inventory, AI chat) has validated
 * fields well under 100kb. Oversized bodies are rejected cleanly (413) before
 * any route logic runs. No endpoint accepts file uploads in V1.
 */
function parseJsonBodyLimit() {
  const raw = (process.env.JSON_BODY_LIMIT || '').trim();
  return raw || '100kb';
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4000,
  // MongoDB connection string. Never log or expose this value.
  mongodbUri: process.env.MONGODB_URI || '',
  // JWT signing secret. Never log, commit, or expose this value.
  jwtSecret: process.env.JWT_SECRET || '',
  // Access-token lifetime (jsonwebtoken format, e.g. "7d", "15m").
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  // Reverse-proxy hops in front of this server (0 = none). See parseTrustProxy.
  trustProxy: parseTrustProxy(),
  // Explicit browser CORS allow-list. See parseCorsOrigins.
  corsOrigins: parseCorsOrigins(),
  // express.json() body limit. See parseJsonBodyLimit.
  jsonBodyLimit: parseJsonBodyLimit(),
};

export default env;
