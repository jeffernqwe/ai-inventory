import Business from '../models/business.model.js';
import ApiError from '../utils/ApiError.js';

export const BUSINESS_NOT_ACTIVE_CODE = 'BUSINESS_NOT_ACTIVE';
// Generic and safe: never reveals whether the business is missing, SUSPENDED,
// or ARCHIVED, and never includes business metadata.
const BUSINESS_NOT_ACTIVE_MESSAGE =
  'This business is not active. Contact an administrator.';

/**
 * Tenant-liveness enforcement (Phase 07B / H2).
 *
 * Business status is security-relevant: only users of an ACTIVE business may
 * authenticate or keep an existing JWT. This guard FAILS CLOSED — a missing
 * business, a non-ACTIVE status, or any query error is treated as "not active",
 * so an unverifiable tenant can never grant access. It does not distinguish
 * missing from SUSPENDED/ARCHIVED; callers surface one generic
 * BUSINESS_NOT_ACTIVE error so no unnecessary business-state detail leaks.
 */
export async function assertActiveBusiness(businessId) {
  try {
    const found = await Business.exists({ _id: businessId, status: 'ACTIVE' });
    if (found) return;
  } catch {
    /* fail closed below */
  }
  throw new ApiError(403, BUSINESS_NOT_ACTIVE_MESSAGE, BUSINESS_NOT_ACTIVE_CODE);
}

export default { assertActiveBusiness, BUSINESS_NOT_ACTIVE_CODE };
