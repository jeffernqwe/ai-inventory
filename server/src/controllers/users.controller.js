import { parsePagination, pageResult } from '../utils/pagination.js';
import { isObjectId, validateUserCreate, validateUserUpdate } from '../utils/validate.js';
import { throwValidation, invalidId } from '../utils/errors.js';
import { usersService } from '../services/users.service.js';

/**
 * User management controllers (Phase 14A). businessId/userId always come from
 * the authenticated request (req.user) — never the body. Authorization to reach
 * these handlers is enforced by requirePermission(USERS_MANAGE) at the route;
 * the cross-role rules (no OWNER, no self-change, ADMIN <-> ADMIN) live in
 * users.service.
 */
const paramId = (req) => {
  if (!isObjectId(req.params.id)) invalidId();
  return req.params.id;
};

export const usersController = {
  async list(req, res) {
    const { page, limit, skip } = parsePagination(req.query);
    const q = typeof req.query.q === 'string' && req.query.q.trim() ? req.query.q.trim() : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const { items, total } = await usersService.list(req.user.businessId, { q, status, skip, limit });
    res.json(pageResult(items, total, page, limit));
  },

  async get(req, res) {
    const user = await usersService.get(req.user.businessId, paramId(req));
    res.json(user);
  },

  async create(req, res) {
    const v = validateUserCreate(req.body ?? {});
    if (v.problems.length) throwValidation(v.problems);
    const user = await usersService.create(req.user, v);
    res.status(201).json(user);
  },

  async update(req, res) {
    const id = paramId(req);
    const v = validateUserUpdate(req.body ?? {});
    if (v.problems.length) throwValidation(v.problems);
    const user = await usersService.update(req.user, id, v);
    res.json(user);
  },
};

export default usersController;
