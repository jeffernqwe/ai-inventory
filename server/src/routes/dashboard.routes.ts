import { Router } from 'express';

import requireAuth from '../middlewares/authenticate.ts';
import { requirePermission } from '../middlewares/authorize.ts';
import dashboardController from '../controllers/dashboard.controller.ts';
import { PERMISSIONS } from '../constants/roles.ts';

const router = Router();

// Dashboard is restricted to roles holding dashboard.view (OWNER/ADMIN/MANAGER).
router.get('/', requireAuth, requirePermission(PERMISSIONS.DASHBOARD_VIEW), dashboardController.summary);

export default router;
