import { parsePagination, pageResult } from '../utils/pagination.js';
import { isObjectId } from '../utils/validate.js';
import { throwValidation, invalidId } from '../utils/errors.js';

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
      const q = typeof req.query.q === 'string' && req.query.q.trim() ? req.query.q.trim() : undefined;
      const status = req.query.status;
      const { items, total } = await service.list(req.user.businessId, { q, status, skip, limit });
      res.json(pageResult(items, total, page, limit));
    },

    async get(req, res) {
      const doc = await service.get(req.user.businessId, paramId(req));
      res.json(service.toPublic(doc));
    },

    async create(req, res) {
      const v = validateFn(req.body ?? {});
      if (v.problems.length) throwValidation(v.problems);
      const doc = await service.create(req.user.businessId, req.user.id, {
        name: v.name,
        description: v.description,
      });
      res.status(201).json(service.toPublic(doc));
    },

    async update(req, res) {
      const id = paramId(req);
      const v = validateFn(req.body ?? {}, { partial: true });
      if (v.problems.length) throwValidation(v.problems);
      const doc = await service.update(req.user.businessId, id, req.user.id, {
        name: v.name,
        description: v.description,
      });
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
