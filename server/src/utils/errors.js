import ApiError from './ApiError.js';

/** Throw a structured 400 validation error carrying field-level problems. */
export function throwValidation(problems) {
  const err = new ApiError(400, 'Validation failed', 'VALIDATION_ERROR');
  err.fields = problems;
  throw err;
}

/** Throw a generic 404 NOT_FOUND. */
export function notFound(message = 'Not Found') {
  throw new ApiError(404, message, 'NOT_FOUND');
}

/** Throw a 400 for an invalid route id parameter. */
export function invalidId() {
  throw new ApiError(400, 'Invalid id', 'INVALID_ID');
}

export default { throwValidation, notFound, invalidId };
