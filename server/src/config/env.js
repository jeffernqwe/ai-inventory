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
};

export default env;
