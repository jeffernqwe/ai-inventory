import type { Request, Response } from 'express';

import dashboardService from '../services/dashboard.service.ts';

/**
 * The request context this controller reads. Local and structural, following
 * `middlewares/authenticate.ts`: declaring `user` on Express's global `Request`
 * would let any module read an authoritative-looking `req.user` on a public
 * route.
 *
 * `user` is optional, matching `middlewares/authorize.ts` exactly, because a
 * handler is registered against Express's `RequestHandler`, whose parameter is a
 * plain `Request`; a required `user` would make that `Request` unassignable and
 * the route registration a type error. The read below asserts it with `!`
 * instead, which is justified by the route table: the one route in
 * `routes/dashboard.routes.ts` is registered `requireAuth,
 * requirePermission(PERMISSIONS.DASHBOARD_VIEW), controller` — a binding Phase 22
 * pins — so the middleware has always run by the time this handler executes.
 * Optional chaining was NOT used: it would silently pass `undefined` on where
 * the code would previously have thrown, which is a behaviour change. The
 * businessId still comes only from the authenticated request, never the client.
 */
type AuthenticatedRequest = Request & { user?: { id: string; businessId: string } };

const dashboardController = {
  async summary(req: AuthenticatedRequest, res: Response) {
    const summary = await dashboardService.summary(req.user!.businessId);
    res.json(summary);
  },
};

export default dashboardController;
