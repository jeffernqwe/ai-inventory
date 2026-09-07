/**
 * Centralized error handler. Must be registered last, after all routes/middleware.
 * Keeps responses consistent and prevents leaking internal details to clients.
 */
const errorHandler = (err, req, res, next) => {
  // If headers were already sent, defer to Express's default handler.
  if (res.headersSent) {
    return next(err);
  }

  const isServerError = !err.status && !err.statusCode;
  const status = err.status || err.statusCode || 500;

  if (status >= 500) {
    // Log server errors server-side (never returned verbatim to the client).
    console.error(`[error] ${err.message || err}`);
  }

  const body = {
    error: isServerError ? 'Internal Server Error' : err.message || 'Error',
  };

  // Stable machine-readable code for client logic, when the error carries one.
  if (err.code && status < 500) {
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
