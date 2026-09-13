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

import type { NextFunction, Request, Response } from 'express';

import { info } from '../utils/logger.ts';

/**
 * The slice of the request this logger reads. Local and structural, like the
 * other middleware: both fields are attached at runtime by earlier middleware
 * (`requestId`, `requireAuth`) and are absent on a request that never reached
 * them, which is why the userId expression below stays guarded.
 */
type RequestWithContext = Request & {
  requestId?: string;
  user?: { id: string };
};

export function requestLogger({
  enabled = process.env.LOG_REQUESTS !== '0',
}: { enabled?: boolean } = {}) {
  if (!enabled) {
    return (req: Request, res: Response, next: NextFunction) => next();
  }

  return function httpLog(req: RequestWithContext, res: Response, next: NextFunction) {
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
