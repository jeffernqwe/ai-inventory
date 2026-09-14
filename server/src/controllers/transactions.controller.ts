import type { Request, Response } from 'express';

import { parsePagination, pageResult } from '../utils/pagination.ts';
import { optionalObjectId } from '../utils/validate.ts';
import { throwValidation } from '../utils/errors.ts';
import transactionsService, { TRANSACTION_TYPES } from '../services/transactions.service.ts';

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
 * instead, which is justified by the route table: `GET
 * /api/inventory/history` in `routes/inventory.routes.ts` is registered
 * `requireAuth, requirePermission(INVENTORY_HISTORY_VIEW), controller` — a
 * binding Phase 22 pins — so the middleware has always run by the time this
 * handler executes. Optional chaining was NOT used: it would silently pass
 * `undefined` on where the code would previously have thrown, which is a
 * behaviour change.
 */
type AuthenticatedRequest = Request & { user?: { id: string; businessId: string } };

/** The shape `throwValidation` accepts, taken from its own signature. */
type FieldProblems = Parameters<typeof throwValidation>[0];

function parseDateParam(value: unknown, field: string, problems: FieldProblems) {
  if (value === undefined || value === null || value === '') return undefined;
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (trimmed === '') return undefined;
  if (Number.isNaN(Date.parse(trimmed))) {
    problems.push({ field, message: `${field} must be a valid date` });
    return undefined;
  }
  return trimmed;
}

const transactionsController = {
  /** Inventory transaction history, newest first. */
  async list(req: AuthenticatedRequest, res: Response) {
    const { page, limit, skip } = parsePagination(req.query);
    const problems: FieldProblems = [];

    let type: string | undefined;
    if (req.query.type !== undefined) {
      // `req.query.type` is Express's `string | ParsedQs | (string | ParsedQs)[]`,
      // and `TRANSACTION_TYPES` is a frozen array of strings. The assertions are
      // only what tells the checker; the expression itself is unchanged. They are
      // behaviour-preserving because `includes` compares with SameValueZero, so a
      // non-string was never `===` to a member and the shipped code already took
      // the `else` branch for every one of them — the assertion cannot reach the
      // success branch for a value the original rejected.
      if (TRANSACTION_TYPES.includes(req.query.type as string)) type = req.query.type as string;
      else problems.push({ field: 'type', message: `type must be one of ${TRANSACTION_TYPES.join(', ')}` });
    }

    const productId = optionalObjectId(req.query.productId, 'productId');
    problems.push(...productId.problems);
    const locationId = optionalObjectId(req.query.locationId, 'locationId');
    problems.push(...locationId.problems);

    const from = parseDateParam(req.query.from, 'from', problems);
    const to = parseDateParam(req.query.to, 'to', problems);

    if (problems.length) throwValidation(problems);

    const { items, total } = await transactionsService.list(req.user!.businessId, {
      productId: productId.value,
      locationId: locationId.value,
      type,
      from,
      to,
      skip,
      limit,
    });
    res.json(pageResult(items, total, page, limit));
  },
};

export default transactionsController;
