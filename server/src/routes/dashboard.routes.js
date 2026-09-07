import { Router } from 'express';

import requireAuth from '../middlewares/authenticate.js';
import { requirePermission } from '../middlewares/authorize.js';
import dashboardController from '../controllers/dashboard.controller.js';
import { PERMISSIONS } from '../constants/roles.js';

const router = Router();

// Dashboard is restricted to roles holding dashboard.view (OWNER/ADMIN/MANAGER).
router.get('/', requireAuth, requirePermission(PERMISSIONS.DASHBOARD_VIEW), dashboardController.summary);

export default router;
