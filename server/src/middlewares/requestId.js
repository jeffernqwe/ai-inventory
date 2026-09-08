/**
 * Phase 08A — request / correlation ID middleware.
 *
 * A client-supplied `X-Request-ID` is echoed back ONLY when it is safe to echo:
 * bounded length and a restricted URL-safe charset (no spaces, commas, or any
 * CR/LF — so a reflected header can never smuggle an extra header line). Any
 * other value is replaced by a fresh cryptographically random id
 * (node:crypto randomUUID).
 *
 * The effective id is:
 *   * exposed downstream as `req.requestId` (middleware, controllers, the
 *     error handler), and
 *   * returned to the caller on EVERY response via the `X-Request-ID` header.
 *
 * Registered first in app.js so the whole chain — including body-parser and
 * error handling — operates under a stable id.
 */

import { randomUUID } from 'node:crypto';

const HEADER = 'x-request-id';
const MAX_REQUEST_ID_LENGTH = 128;
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]+$/;

export function requestId(req, res, next) {
  const incoming = typeof req.get === 'function' ? req.get(HEADER) : undefined;
  const id =
    typeof incoming === 'string' &&
    incoming.length > 0 &&
    incoming.length <= MAX_REQUEST_ID_LENGTH &&
    SAFE_REQUEST_ID.test(incoming)
      ? incoming
      : randomUUID();

  req.requestId = id;
  res.setHeader('X-Request-ID', id);
  next();
}

export default requestId;
