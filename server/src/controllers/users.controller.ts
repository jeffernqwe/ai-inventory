import type { Request, Response } from 'express';

import { parsePagination, pageResult } from '../utils/pagination.ts';
import { isObjectId, validateUserCreate, validateUserUpdate, validateUserList } from '../utils/validate.ts';
import { throwValidation, invalidId } from '../utils/errors.ts';
import { usersService } from '../services/users.service.ts';

/**
 * The request context this controller reads. Local and structural, following
 * `products.controller.ts` and `audit.controller.ts`: declaring `user` on
 * Express's global `Request` would let any module read an authoritative-looking
 * `req.user` on a public route.
 *
 * `role` is declared here, where the other migrated controllers declare only
 * `id` and `businessId`, because this controller hands the actor itself to the
 * service (`create`/`update` below) and users.service reads `actor.role` for
 * the cross-role rules. It is the database-loaded role for this request, as
 * `middlewares/authenticate.ts` documents.
 *
 * `user` is optional, matching `middlewares/authorize.ts` exactly, because a
 * handler is registered against Express's `RequestHandler`, whose parameter is a
 * plain `Request`; a required `user` would make that `Request` unassignable and
 * every route registration a type error. The reads below assert it with `!`
 * instead, which is justified by the route table: every route in
 * `routes/users.routes.ts` is registered `requireAuth,
 * requirePermission(PERMISSIONS.USERS_MANAGE), controller` — a binding Phase 22
 * pins — so the middleware has always run by the time these handlers execute.
 * Optional chaining was NOT used: it would silently pass `undefined` on where
 * the code would previously have thrown, which is a behaviour change.
 */
type AuthenticatedRequest = Request & {
  user?: { id: string; businessId: string; role: string };
};

const paramId = (req: AuthenticatedRequest) => {
  // `req.params` is Express's `{ [key: string]: string | string[] }`, so the
  // property reads as `string | string[] | undefined`. The guard is the real
  // check and is unchanged; the assertion is only what tells the checker, and it
  // is needed because `invalidId`'s return type is inferred rather than
  // annotated `never` — so a call to it does not terminate control flow the way
  // `notFound()` does, and the true branch's narrowing is merged away again
  // afterwards. Same treatment as `products.controller.ts`.
  if (!isObjectId(req.params.id)) invalidId();
  return req.params.id as string;
}

/**
 * User management controllers (Phase 14A). businessId/userId always come from
 * the authenticated request (req.user) — never the body. Authorization to reach
 * these handlers is enforced by requirePermission(USERS_MANAGE) at the route;
 * the cross-role rules (no OWNER, no self-change, ADMIN <-> ADMIN) live in
 * users.service.
 */
export const usersController = {
  async list(req: AuthenticatedRequest, res: Response) {
    const { page, limit, skip } = parsePagination(req.query);
    const v = validateUserList(req.query);
    if (v.problems.length) throwValidation(v.problems);
    const { items, total } = await usersService.list(req.user!.businessId, {
      ...v.filters,
      skip,
      limit,
    });
    res.json(pageResult(items, total, page, limit));
  },

  async get(req: AuthenticatedRequest, res: Response) {
    const user = await usersService.get(req.user!.businessId, paramId(req));
    res.json(user);
  },

  async create(req: AuthenticatedRequest, res: Response) {
    const v = validateUserCreate(req.body ?? {});
    if (v.problems.length) throwValidation(v.problems);
    // The four fields below are asserted, exactly as `parseMovementInput` in
    // `inventory.controller.ts` asserts productId/locationId/quantity, and for
    // the same reason: `validateUserCreate` reports a bad `name`, a bad
    // `password` or an unassignable `role` through `problems`, so reaching the
    // `return` means `problems` was empty and therefore all four are the strings
    // the service needs. That is a correlation between the contents of one value
    // and the types of four others, which no type can express. `name` is
    // `string | undefined` (the `requiredString` shape) so `!` is enough;
    // `password` and `role` are handed back as the raw body values, so they are
    // `unknown` and need the explicit target type. All four assertions are
    // erased at runtime.
    const user = await usersService.create(req.user!, {
      name: v.name!,
      email: v.email,
      password: v.password as string,
      role: v.role as string,
    });
    res.status(201).json(user);
  },

  async update(req: AuthenticatedRequest, res: Response) {
    const id = paramId(req);
    const v = validateUserUpdate(req.body ?? {});
    if (v.problems.length) throwValidation(v.problems);
    // Same boundary as `create`. Both fields are the raw body values, so both
    // are `unknown`, and each is `undefined` when the request omitted it — the
    // very distinction `users.service.update` tests for (`payload.role !==
    // undefined`), so both keys are passed through as they are rather than
    // defaulted.
    const user = await usersService.update(req.user!, id, {
      role: v.role as string | undefined,
      status: v.status as string | undefined,
    });
    res.json(user);
  },
};

export default usersController;
