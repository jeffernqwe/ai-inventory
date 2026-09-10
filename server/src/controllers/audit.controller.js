import { parsePagination, pageResult } from '../utils/pagination.js';
import { throwValidation } from '../utils/errors.js';
import { listAudit } from '../services/audit.service.js';
import { validateAuditList } from '../utils/validate.js';

/**
 * Read-only audit trail controller (Phase 16). businessId always comes from the
 * authenticated request (req.user) — never the client. Authorization to reach
 * this handler is enforced by requirePermission(AUDIT_VIEW) at the route; the
 * service never writes anything.
 */
export const auditController = {
  async list(req, res) {
    const { page, limit, skip } = parsePagination(req.query);
    const v = validateAuditList(req.query);
    if (v.problems.length) throwValidation(v.problems);
    const { items, total } = await listAudit(req.user.businessId, { ...v.filters, skip, limit });
    res.json(pageResult(items, total, page, limit));
  },
};

export default auditController;
