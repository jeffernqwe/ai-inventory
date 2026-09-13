import { Router } from 'express';

import requireAuth from '../middlewares/authenticate.js';
import { requirePermission } from '../middlewares/authorize.js';
import { locationService } from '../services/reference.service.js';
import { createReferenceController } from '../controllers/reference.controller.js';
import { validateLocation } from '../utils/validate.js';
import { PERMISSIONS } from '../constants/roles.ts';

const router = Router();
const c = createReferenceController(locationService, validateLocation);

router.get('/', requireAuth, c.list);
router.post('/', requireAuth, requirePermission(PERMISSIONS.LOCATIONS_MANAGE), c.create);
router.get('/:id', requireAuth, c.get);
router.patch('/:id', requireAuth, requirePermission(PERMISSIONS.LOCATIONS_MANAGE), c.update);
router.post('/:id/archive', requireAuth, requirePermission(PERMISSIONS.LOCATIONS_MANAGE), c.archive);
router.post('/:id/restore', requireAuth, requirePermission(PERMISSIONS.LOCATIONS_MANAGE), c.restore);

export default router;
