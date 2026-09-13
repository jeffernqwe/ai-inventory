import ApiError from './ApiError.ts';

/**
 * Business-isolation guard.
 *
 * The authenticated user's business is always taken from the server-side
 * identity (`req.user.businessId`). A client/request-supplied business id is
 * only ever compared against that authoritative value — never used as-is to
 * scope a query. Requests that reference another business are rejected with
 * 403 before any data access.
 */
export function assertBusinessAccess(
  user: { businessId?: unknown } | null | undefined,
  targetBusinessId: unknown
) {
  if (!user || user.businessId == null) {
    throw new ApiError(401, 'Authentication required', 'AUTH_REQUIRED');
  }
  if (targetBusinessId == null) {
    throw new ApiError(403, 'Access to this business is not permitted', 'FORBIDDEN_BUSINESS');
  }
  if (String(user.businessId) !== String(targetBusinessId)) {
    throw new ApiError(403, 'Access to this business is not permitted', 'FORBIDDEN_BUSINESS');
  }
}

export default assertBusinessAccess;
