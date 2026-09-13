import type { Request, Response } from 'express';

import { parsePagination, pageResult } from '../utils/pagination.ts';
import { throwValidation } from '../utils/errors.ts';
import { listAudit } from '../services/audit.service.ts';
import { validateAuditList } from '../utils/validate.ts';

/**
 * The request context this controller reads. Local and structural, following
 * `dashboard.controller.ts`: declaring `user` on Express's global `Request`
 * would let any module read an authoritative-looking `req.user` on a public
 * route.
 *
 * `user` is optional, matching `middlewares/authorize.ts` exactly, because a
 * handler is registered against Express's `RequestHandler`, whose parameter is a
 * plain `Request`; a required `user` would make that `Request` unassignable and
 * the route registration a type error. The read below asserts it with `!`
 * instead, which is justified by the route table: the one route in
 * `routes/audit.routes.ts` is registered `requireAuth,
 * requirePermission(PERMISSIONS.AUDIT_VIEW), controller` — a binding Phase 22
 * pins — so the middleware has always run by the time this handler executes.
 * Optional chaining was NOT used: it would silently pass `undefined` on where
 * the code would previously have thrown, which is a behaviour change.
 */
type AuthenticatedRequest = Request & { user?: { id: string; businessId: string } };

/**
 * Read-only audit trail controller (Phase 16). businessId always comes from the
 * authenticated request (req.user) — never the client. Authorization to reach
 * this handler is enforced by requirePermission(AUDIT_VIEW) at the route; the
 * service never writes anything.
 */
export const auditController = {
  async list(req: AuthenticatedRequest, res: Response) {
    const { page, limit, skip } = parsePagination(req.query);
    const v = validateAuditList(req.query);
    if (v.problems.length) throwValidation(v.problems);
    const { items, total } = await listAudit(req.user!.businessId, { ...v.filters, skip, limit });
    res.json(pageResult(items, total, page, limit));
  },
};

export default auditController;
