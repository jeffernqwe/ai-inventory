import type { Request, Response } from 'express';

import { parsePagination, pageResult } from '../utils/pagination.ts';
import { isObjectId, validateReferenceList } from '../utils/validate.ts';
import { throwValidation, invalidId } from '../utils/errors.ts';

/**
 * The request context this controller reads. Local and structural, following
 * `middlewares/authenticate.ts`: declaring `user` on Express's global `Request`
 * would let any module read an authoritative-looking `req.user` on a public
 * route.
 *
 * `user` is optional, matching `middlewares/authorize.ts` exactly, because a
 * handler is registered against Express's `RequestHandler`, whose parameter is a
 * plain `Request`; a required `user` would make that `Request` unassignable and
 * every route registration a type error. The reads below assert it with `!`
 * instead. Optional chaining was NOT used: it would silently pass `undefined` on
 * where the code would previously have thrown, which is a behaviour change.
 */
type AuthenticatedRequest = Request & { user?: { id: string; businessId: string } };

/** The shape `throwValidation` accepts, taken from its own signature. */
type FieldProblems = Parameters<typeof throwValidation>[0];

/**
 * The three shipped reference validators (category, location, supplier). They
 * return a shared `problems` list plus their own fields; only `problems` is read
 * here, and the whole result is passed back to the service as the write payload.
 */
type ReferenceValidator = (
  body: Record<string, unknown>,
  options?: { partial?: boolean },
) => { problems: FieldProblems };

/**
 * The slice of a reference service this controller consumes, and nothing more.
 *
 * A document is deliberately `unknown`: the controller never inspects one. It
 * receives a document from `get`/`create`/`update`/`setStatus` and hands it
 * straight back to `toPublic`, so the single fact it relies on is that the
 * service can render whatever it returned. Method syntax is used so these
 * parameters are compared bivariantly, which is what lets the three concrete
 * services — each typed against its own model — satisfy this one contract.
 */
type ReferenceServiceLike = {
  toPublic(doc: unknown): Record<string, unknown>;
  create(businessId: string, userId: string, payload: unknown): Promise<unknown>;
  get(businessId: string, id: string): Promise<unknown>;
  list(
    businessId: string,
    filters: { q?: string; status?: string; skip: number; limit: number },
  ): Promise<{ items: unknown[]; total: number }>;
  update(businessId: string, id: string, userId: string, payload: unknown): Promise<unknown>;
  setStatus(businessId: string, id: string, userId: string, status: string): Promise<unknown>;
};

/**
 * Thin controllers for reference resources (Category/Location). BusinessId and
 * userId always come from the authenticated request (req.user) — never the body.
 */
export function createReferenceController(service: ReferenceServiceLike, validateFn: ReferenceValidator) {
  const paramId = (req: AuthenticatedRequest) => {
    // `req.params` is Express's `{ [key: string]: string | string[] }`, so the
    // property reads as `string | string[] | undefined`. The guard is the real
    // check and is unchanged; the assertion is only what tells the checker, and
    // it is needed because `invalidId`'s return type is inferred rather than
    // annotated `never` — so a call to it does not terminate control flow the
    // way `notFound()` does, and the true branch's narrowing is merged away.
    if (!isObjectId(req.params.id)) invalidId();
    return req.params.id as string;
  };

  return {
    async list(req: AuthenticatedRequest, res: Response) {
      const { page, limit, skip } = parsePagination(req.query);
      const v = validateReferenceList(req.query);
      if (v.problems.length) throwValidation(v.problems);
      const { items, total } = await service.list(req.user!.businessId, {
        ...v.filters,
        skip,
        limit,
      });
      res.json(pageResult(items, total, page, limit));
    },

    async get(req: AuthenticatedRequest, res: Response) {
      const doc = await service.get(req.user!.businessId, paramId(req));
      res.json(service.toPublic(doc));
    },

    async create(req: AuthenticatedRequest, res: Response) {
      const v = validateFn(req.body ?? {});
      if (v.problems.length) throwValidation(v.problems);
      const doc = await service.create(req.user!.businessId, req.user!.id, v);
      res.status(201).json(service.toPublic(doc));
    },

    async update(req: AuthenticatedRequest, res: Response) {
      const id = paramId(req);
      const v = validateFn(req.body ?? {}, { partial: true });
      if (v.problems.length) throwValidation(v.problems);
      const doc = await service.update(req.user!.businessId, id, req.user!.id, v);
      res.json(service.toPublic(doc));
    },

    async archive(req: AuthenticatedRequest, res: Response) {
      const doc = await service.setStatus(req.user!.businessId, paramId(req), req.user!.id, 'ARCHIVED');
      res.json(service.toPublic(doc));
    },

    async restore(req: AuthenticatedRequest, res: Response) {
      const doc = await service.setStatus(req.user!.businessId, paramId(req), req.user!.id, 'ACTIVE');
      res.json(service.toPublic(doc));
    },
  };
}

export default createReferenceController;
