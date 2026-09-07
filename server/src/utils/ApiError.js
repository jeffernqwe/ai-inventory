/**
 * Operational error with an HTTP status and an optional stable machine-readable
 * code. Thrown by services/middleware and turned into a safe JSON response by
 * the centralized error handler.
 */
export class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export default ApiError;
