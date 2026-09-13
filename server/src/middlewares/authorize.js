import ApiError from '../utils/ApiError.js';
import { hasPermission } from '../constants/roles.ts';

/**
 * Role / permission authorization middleware.
 *
 * Must run AFTER `authenticate` (requireAuth), which sets `req.user` from the
 * database. These middleware never trust a client-supplied role.
 */

/** Allow only the given roles (e.g. requireRole(ROLES.OWNER)). */
export function requireRole(...roles) {
  const allowed = new Set(roles.flat());
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError(401, 'Authentication required', 'AUTH_REQUIRED'));
    }
    if (!allowed.has(req.user.role)) {
      return next(
        new ApiError(403, 'Insufficient permissions for this action', 'FORBIDDEN')
      );
    }
    return next();
  };
}

/** Allow only roles that hold a specific capability (see constants/roles.js). */
export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError(401, 'Authentication required', 'AUTH_REQUIRED'));
    }
    if (!hasPermission(req.user.role, permission)) {
      return next(
        new ApiError(403, 'Insufficient permissions for this action', 'FORBIDDEN')
      );
    }
    return next();
  };
}

export default { requireRole, requirePermission };
