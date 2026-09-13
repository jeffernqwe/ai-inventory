import { parsePagination, pageResult } from '../utils/pagination.ts';
import { isObjectId, validateReferenceList } from '../utils/validate.ts';
import { throwValidation, invalidId } from '../utils/errors.ts';

/**
 * Thin controllers for reference resources (Category/Location). BusinessId and
 * userId always come from the authenticated request (req.user) — never the body.
 */
export function createReferenceController(service, validateFn) {
  const paramId = (req) => {
    if (!isObjectId(req.params.id)) invalidId();
    return req.params.id;
  };

  return {
    async list(req, res) {
      const { page, limit, skip } = parsePagination(req.query);
      const v = validateReferenceList(req.query);
      if (v.problems.length) throwValidation(v.problems);
      const { items, total } = await service.list(req.user.businessId, {
        ...v.filters,
        skip,
        limit,
      });
      res.json(pageResult(items, total, page, limit));
    },

    async get(req, res) {
      const doc = await service.get(req.user.businessId, paramId(req));
      res.json(service.toPublic(doc));
    },

    async create(req, res) {
      const v = validateFn(req.body ?? {});
      if (v.problems.length) throwValidation(v.problems);
      const doc = await service.create(req.user.businessId, req.user.id, v);
      res.status(201).json(service.toPublic(doc));
    },

    async update(req, res) {
      const id = paramId(req);
      const v = validateFn(req.body ?? {}, { partial: true });
      if (v.problems.length) throwValidation(v.problems);
      const doc = await service.update(req.user.businessId, id, req.user.id, v);
      res.json(service.toPublic(doc));
    },

    async archive(req, res) {
      const doc = await service.setStatus(req.user.businessId, paramId(req), req.user.id, 'ARCHIVED');
      res.json(service.toPublic(doc));
    },

    async restore(req, res) {
      const doc = await service.setStatus(req.user.businessId, paramId(req), req.user.id, 'ACTIVE');
      res.json(service.toPublic(doc));
    },
  };
}

export default createReferenceController;
