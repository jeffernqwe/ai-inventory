import { Router } from 'express';

import requireAuth from '../middlewares/authenticate.js';
import { requirePermission } from '../middlewares/authorize.js';
import { usersController } from '../controllers/users.controller.js';
import { PERMISSIONS } from '../constants/roles.js';

/**
 * User management (Phase 14A). OWNER/ADMIN only — every route requires
 * users.manage. Tenant isolation and the cross-role rules (no OWNER creation
 * or modification, no self-change, ADMIN cannot touch or assign ADMIN) are
 * enforced in users.service, never by the client.
 */
const router = Router();

router.get('/', requireAuth, requirePermission(PERMISSIONS.USERS_MANAGE), usersController.list);
router.post('/', requireAuth, requirePermission(PERMISSIONS.USERS_MANAGE), usersController.create);
router.get('/:id', requireAuth, requirePermission(PERMISSIONS.USERS_MANAGE), usersController.get);
router.patch('/:id', requireAuth, requirePermission(PERMISSIONS.USERS_MANAGE), usersController.update);

export default router;
