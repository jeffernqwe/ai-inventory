/**
 * Phase 08A — dependency-free structured logger.
 *
 * Emits one JSON object per line through the Node console (info -> stdout,
 * error -> stderr). Each record carries only the explicit fields a caller
 * passes — this module never inspects requests, headers or bodies, so it
 * cannot log a secret by construction. The whole record is one console
 * argument, keeping every entry on a single greppable line.
 *
 * Fields whose value is `undefined` are omitted by JSON.stringify, so callers
 * can spread a context object and absent fields (no request id, no user) simply
 * do not appear.
 */

/**
 * Fields a caller may attach. Read only by `JSON.stringify`, never interpreted:
 * a `undefined` value is omitted by it, so callers can spread a context object
 * and absent fields simply do not appear.
 */
type LogFields = Record<string, unknown>;

function record(level: 'info' | 'error', fields: LogFields) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, ...fields });
  if (level === 'error') console.error(line);
  else console.log(line);
}

/** Structured info-level record (request access logs, lifecycle events). */
export function info(fields: LogFields) {
  record('info', fields);
}

/** Structured error-level record (server-side error logs, never the client body). */
export function error(fields: LogFields) {
  record('error', fields);
}

export default { info, error };
