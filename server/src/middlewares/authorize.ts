import type { NextFunction, Request, Response } from 'express';

import ApiError from '../utils/ApiError.ts';
import { hasPermission } from '../constants/roles.ts';

/**
 * Role / permission authorization middleware.
 *
 * Must run AFTER `authenticate` (requireAuth), which sets `req.user` from the
 * database. These middleware never trust a client-supplied role.
 */

/**
 * The slice of the request these gates read. Local and structural, following the
 * pattern `requestId.ts` established: `req.user` is attached at runtime by
 * `requireAuth`, and augmenting Express's global `Request` would make every
 * module in the project appear authenticated whether or not that ran.
 *
 * Only `role` is declared because only `role` is consulted here — the gate has
 * no business reading any other part of the user.
 */
type RequestWithUser = Request & { user?: { role: string } };

/** Allow only the given roles (e.g. requireRole(ROLES.OWNER)). */
export function requireRole(...roles: readonly (string | readonly string[])[]) {
  const allowed = new Set(roles.flat());
  return (req: RequestWithUser, res: Response, next: NextFunction) => {
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
export function requirePermission(permission: string) {
  return (req: RequestWithUser, res: Response, next: NextFunction) => {
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
