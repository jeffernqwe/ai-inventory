import type mongoose from 'mongoose';

import Business from '../models/business.model.ts';
import ApiError from '../utils/ApiError.ts';

/**
 * Local to this module, following `inventory.service.ts`, `product.service.ts`,
 * `audit.service.ts` and `users.service.ts`: every caller passes either the
 * string `req.user` carries or the ObjectId a document the server already loaded
 * holds, and the model casts whichever arrives. Declared here rather than in a
 * shared module so this service stays free of a dependency it does not otherwise
 * need.
 */
type IdLike = string | mongoose.Types.ObjectId;

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
export async function assertActiveBusiness(businessId: IdLike) {
  try {
    const found = await Business.exists({ _id: businessId, status: 'ACTIVE' });
    if (found) return;
  } catch {
    /* fail closed below */
  }
  throw new ApiError(403, BUSINESS_NOT_ACTIVE_MESSAGE, BUSINESS_NOT_ACTIVE_CODE);
}

export default { assertActiveBusiness, BUSINESS_NOT_ACTIVE_CODE };
