/**
 * Explicit CORS allow-list (Phase 07C / M3).
 *
 * This API is consumed by native mobile clients, which send NO Origin header
 * and never need CORS. Browser-based web clients would need a CORS grant, but
 * none exist in V1 — so the default is to allow no browser origin at all.
 *
 * When an operator later adds a web admin/app, they configure the exact origins
 * in CORS_ORIGINS (comma-separated) and ONLY those origins receive a grant:
 *
 *   - No Origin header (native mobile, curl, same-origin)   -> passes through,
 *     no CORS headers applied.
 *   - Allow-listed Origin (browser)                          -> ACAO set to that
 *     exact origin (never '*').
 *   - Any other Origin                                       -> no CORS grant
 *     (browser preflight/simple requests are not permitted to read responses).
 *
 * CORS is a browser-enforcement mechanism, NOT authentication: an unlisted
 * origin's request still reaches the server (it simply cannot read the
 * response). JWT + RBAC + business isolation on every protected route remain
 * the real security boundary (see CLAUDE.md §4/§5).
 */

import cors from 'cors';

/** Case-sensitive exact compare, ignoring a single trailing slash. */
function normalizeOrigin(origin: string) {
  return String(origin).trim().replace(/\/+$/, '');
}

export function createCors(origins = []) {
  const allowed = new Set(origins.map(normalizeOrigin));

  return cors({
    origin(requestOrigin, callback) {
      // Native mobile / no-Origin or disallowed: grant nothing. cors then calls
      // next() WITHOUT applying any Access-Control-* header, so no-Origin flows
      // keep working and browsers from unlisted origins are blocked.
      if (!requestOrigin || !allowed.has(normalizeOrigin(requestOrigin))) {
        return callback(null, false);
      }
      // Reflect ONLY the allow-listed origin that is actually making the
      // request (cors resolves origin === true to the request's own Origin).
      return callback(null, true);
    },
  });
}

export default createCors;
