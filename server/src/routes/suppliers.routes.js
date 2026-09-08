import { Router } from 'express';

import requireAuth from '../middlewares/authenticate.js';
import { requirePermission } from '../middlewares/authorize.js';
import { supplierService } from '../services/reference.service.js';
import { createReferenceController } from '../controllers/reference.controller.js';
import { validateSupplier } from '../utils/validate.js';
import { PERMISSIONS } from '../constants/roles.js';

const router = Router();
const c = createReferenceController(supplierService, validateSupplier);

router.get('/', requireAuth, c.list);
router.post('/', requireAuth, requirePermission(PERMISSIONS.SUPPLIERS_MANAGE), c.create);
router.get('/:id', requireAuth, c.get);
router.patch('/:id', requireAuth, requirePermission(PERMISSIONS.SUPPLIERS_MANAGE), c.update);
router.post('/:id/archive', requireAuth, requirePermission(PERMISSIONS.SUPPLIERS_MANAGE), c.archive);
router.post('/:id/restore', requireAuth, requirePermission(PERMISSIONS.SUPPLIERS_MANAGE), c.restore);

export default router;
