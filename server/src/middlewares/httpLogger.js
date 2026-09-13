/**
 * Phase 08A — structured per-request access log.
 *
 * Emits one JSON line per COMPLETED request (the response 'finish' event):
 * requestId, HTTP method, path (captured at entry, never the query string),
 * final status code, the authenticated userId when present, and duration.
 *
 * Nothing else is logged — no headers, no Authorization/cookie values, no body,
 * no query string — so a request log can never carry a secret or PII beyond the
 * actor id the server already knows. Full AI prompts/responses are never part
 * of these fields either: a chat request logs only its method/path/status/user.
 *
 * The access log is on by default and disabled with LOG_REQUESTS=0 (kept off
 * in automated runs by the test runner so suites stay quiet). Error logs are
 * unaffected and always emit.
 */

import { info } from '../utils/logger.ts';

export function requestLogger({ enabled = process.env.LOG_REQUESTS !== '0' } = {}) {
  if (!enabled) {
    return (req, res, next) => next();
  }

  return function httpLog(req, res, next) {
    const start = process.hrtime.bigint();
    const method = req.method;
    const path = req.path; // captured at entry so the query string never leaks in

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      info({
        type: 'http',
        requestId: req.requestId,
        method,
        path,
        status: res.statusCode,
        userId: req.user && req.user.id ? String(req.user.id) : undefined,
        durationMs: Math.round(durationMs * 10) / 10,
      });
    });

    next();
  };
}

export default requestLogger;
