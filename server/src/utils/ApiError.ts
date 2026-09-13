/**
 * Operational error with an HTTP status and an optional stable machine-readable
 * code. Thrown by services/middleware and turned into a safe JSON response by
 * the centralized error handler.
 */
export class ApiError extends Error {
  // `declare` keeps these annotations out of the emitted JavaScript entirely, so
  // the class constructs exactly as it did before the migration: `status` and
  // `code` are still created by the constructor assignments below, and a plain
  // field declaration would have defined them as `undefined` first (and in a
  // different key order) under class-fields semantics.
  declare status: number;
  declare code: string | undefined;
  /** Field-level problems, attached by `throwValidation` or a controller. */
  declare fields: { field: string; message: string }[] | undefined;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export default ApiError;
