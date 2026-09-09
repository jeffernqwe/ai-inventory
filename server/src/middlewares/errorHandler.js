/**
 * Centralized error handler. Must be registered last, after all routes/middleware.
 * Keeps responses consistent and prevents leaking internal details to clients.
 */
import { isDatabaseDownError, sanitizeMongoMessage } from '../config/db.js';
import { error as logError } from '../utils/logger.js';

/**
 * body-parser tags the failures it raises with a machine-readable `type`.
 * These arrive before any route logic, so we respond here with a fixed,
 * generic shape: the parser's own message can echo the offending input
 * (content / length), and the generic path would also append a dev-mode stack.
 * Mapping deliberately covers only the cases we reject; anything else keeps
 * flowing to the generic handler below.
 */
const BODY_ERRORS = {
  'entity.parse.failed': {
    status: 400,
    code: 'INVALID_JSON',
    message: 'Request body is not valid JSON',
  },
  'entity.too.large': {
    status: 413,
    code: 'BODY_TOO_LARGE',
    message: 'Request body exceeds the allowed size',
  },
};

/**
 * Short server-side identifier for the request a failure belongs to, so a 5xx
 * in the logs can be traced to a call: "POST /api/inventory/stock-out (user
 * 651a…)". Path only (no query string) and never headers/bodies — nothing
 * client-supplied beyond the path is echoed. Empty when no request object is
 * present (e.g. an error raised outside a request).
 */
function describeRequest(req) {
  if (!req || typeof req.method !== 'string') return '';
  const user = req.user && req.user.id ? ` (user ${req.user.id})` : '';
  return `${req.method} ${req.path || req.originalUrl || '/'}${user}`;
}

/**
 * Structured fields attached to a server-side error log (Phase 08A). Method,
 * path and user are already inside describeRequest's message; repeating them
 * as machine-readable fields keeps the record filterable without adding any
 * data — headers, bodies and query strings are never included.
 */
function requestContext(req) {
  if (!req || typeof req.method !== 'string') return {};
  return {
    requestId: req.requestId,
    method: req.method,
    path: req.path || req.originalUrl || '/',
    userId: req.user && req.user.id ? String(req.user.id) : undefined,
  };
}

const errorHandler = (err, req, res, next) => {
  // If headers were already sent, defer to Express's default handler.
  if (res.headersSent) {
    return next(err);
  }

  // Oversized / malformed JSON (Phase 07C / L2): stable code + fixed message,
  // no request-content echo, no stack trace (not even in development).
  const bodyError = BODY_ERRORS[err.type];
  if (bodyError) {
    return res.status(bodyError.status).json({
      error: bodyError.message,
      code: bodyError.code,
    });
  }

  const isServerError = !err.status && !err.statusCode;

  // MongoDB unreachable (Phase 07D / H8): a driver/buffering error reached a
  // handler while the database is down. Answer with a fixed, secret-free 503 —
  // never the raw driver message (it can carry a connection string or topology
  // internals) and never a stack trace. Intercepts before the generic path, so
  // the mapping holds in every environment.
  if (isServerError && isDatabaseDownError(err)) {
    logError({
      type: 'db_error',
      ...requestContext(req),
      message: `[db] ${describeRequest(req) || 'unknown request'} — database unavailable, request could not be served: ${sanitizeMongoMessage(err)}`,
    });
    return res.status(503).json({
      error: 'Service temporarily unavailable',
      code: 'DB_UNAVAILABLE',
    });
  }

  const status = err.status || err.statusCode || 500;

  if (status >= 500) {
    // Log server errors server-side (never returned verbatim to the client).
    // Include the request context so a production 5xx is traceable to a call.
    logError({
      type: 'error',
      ...requestContext(req),
      message: `[error] ${describeRequest(req) || 'unknown request'} — ${err.message || err}`,
    });
  }

  const body = {
    error: isServerError ? 'Internal Server Error' : err.message || 'Error',
  };

  // Stable machine-readable code for client logic. Codes travel with 4xx
  // errors (validation, auth, conflict). Deliberately coded server errors —
  // e.g. AI_NOT_CONFIGURED (503) / AI_UNAVAILABLE (502) — carry a string code
  // too, so clients can branch without parsing human text. Generic internal
  // errors never have a code and are excluded here as before.
  if (typeof err.code === 'string' && err.code) {
    body.code = err.code;
  }

  // Field-level problems for validation errors.
  if (Array.isArray(err.fields) && status < 500) {
    body.fields = err.fields;
  }

  // Lines already durably applied when a partial receive conflicts (Phase 13C
  // RECEIVE_CONFLICT). Only a 4xx carries them; a 5xx never echoes the partial
  // state to a client that should retry the whole request.
  if (Array.isArray(err.applied) && status < 500) {
    body.applied = err.applied;
  }

  // Expose stack traces only in non-production environments for easier debugging.
  if (envNonProd() && err.stack) {
    body.stack = err.stack;
  }

  return res.status(status).json(body);
};

const envNonProd = () => process.env.NODE_ENV !== 'production';

export default errorHandler;
