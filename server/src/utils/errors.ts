import ApiError from './ApiError.ts';

/** A single field-level problem, as the validators report it. */
interface FieldProblem {
  field: string;
  message: string;
}

/** Throw a structured 400 validation error carrying field-level problems. */
export function throwValidation(problems: FieldProblem[]) {
  const err = new ApiError(400, 'Validation failed', 'VALIDATION_ERROR');
  err.fields = problems;
  throw err;
}

/**
 * Throw a generic 404 NOT_FOUND.
 *
 * `never` is the honest return type — this function cannot return — so a caller
 * that continues after it is a compile error rather than a runtime surprise.
 */
export function notFound(message = 'Not Found'): never {
  throw new ApiError(404, message, 'NOT_FOUND');
}

/** Throw a 400 for an invalid route id parameter. */
export function invalidId() {
  throw new ApiError(400, 'Invalid id', 'INVALID_ID');
}

export default { throwValidation, notFound, invalidId };
