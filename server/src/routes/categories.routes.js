import { Router } from 'express';

import requireAuth from '../middlewares/authenticate.js';
import { requirePermission } from '../middlewares/authorize.js';
import { categoryService } from '../services/reference.service.js';
import { createReferenceController } from '../controllers/reference.controller.js';
import { validateCategory } from '../utils/validate.js';
import { PERMISSIONS } from '../constants/roles.ts';

const router = Router();
const c = createReferenceController(categoryService, validateCategory);

// Reading reference data is available to any authenticated member of the
// business (product/inventory screens need category names). Mutations require
// categories.manage (OWNER, ADMIN per spec §7).
router.get('/', requireAuth, c.list);
router.post('/', requireAuth, requirePermission(PERMISSIONS.CATEGORIES_MANAGE), c.create);
router.get('/:id', requireAuth, c.get);
router.patch('/:id', requireAuth, requirePermission(PERMISSIONS.CATEGORIES_MANAGE), c.update);
router.post('/:id/archive', requireAuth, requirePermission(PERMISSIONS.CATEGORIES_MANAGE), c.archive);
router.post('/:id/restore', requireAuth, requirePermission(PERMISSIONS.CATEGORIES_MANAGE), c.restore);

export default router;
