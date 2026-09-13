import { Router } from 'express';

import requireAuth from '../middlewares/authenticate.ts';
import { requirePermission } from '../middlewares/authorize.ts';
import { auditController } from '../controllers/audit.controller.ts';
import { PERMISSIONS } from '../constants/roles.ts';

/**
 * Read-only audit trail (Phase 16). OWNER/ADMIN only — every route requires
 * audit.view. Tenant isolation is enforced in audit.service (businessId comes
 * exclusively from the authenticated session). No write routes exist by design.
 */
const router = Router();

router.get('/', requireAuth, requirePermission(PERMISSIONS.AUDIT_VIEW), auditController.list);

export default router;
