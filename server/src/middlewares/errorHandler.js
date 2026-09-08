/**
 * Centralized error handler. Must be registered last, after all routes/middleware.
 * Keeps responses consistent and prevents leaking internal details to clients.
 */
import { isDatabaseDownError, sanitizeMongoMessage } from '../config/db.js';

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
    console.error(`[db] database unavailable — request could not be served: ${sanitizeMongoMessage(err)}`);
    return res.status(503).json({
      error: 'Service temporarily unavailable',
      code: 'DB_UNAVAILABLE',
    });
  }

  const status = err.status || err.statusCode || 500;

  if (status >= 500) {
    // Log server errors server-side (never returned verbatim to the client).
    console.error(`[error] ${err.message || err}`);
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

  // Expose stack traces only in non-production environments for easier debugging.
  if (envNonProd() && err.stack) {
    body.stack = err.stack;
  }

  return res.status(status).json(body);
};

const envNonProd = () => process.env.NODE_ENV !== 'production';

export default errorHandler;
