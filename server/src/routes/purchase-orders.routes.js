import { Router } from 'express';

import requireAuth from '../middlewares/authenticate.js';
import { requirePermission } from '../middlewares/authorize.js';
import { purchaseOrdersController } from '../controllers/purchase-orders.controller.js';
import { PERMISSIONS } from '../constants/roles.js';

const router = Router();

// Reads: any authenticated member of the business (products/locations parity).
// Mutations: purchase-orders.manage (OWNER, ADMIN, MANAGER). STAFF may view but
// never create/edit/issue/cancel. Receiving (Phase 13C) will add its own verb.
router.get('/', requireAuth, purchaseOrdersController.list);
router.post('/', requireAuth, requirePermission(PERMISSIONS.PURCHASE_ORDERS_MANAGE), purchaseOrdersController.create);
router.get('/:id', requireAuth, purchaseOrdersController.get);
router.patch('/:id', requireAuth, requirePermission(PERMISSIONS.PURCHASE_ORDERS_MANAGE), purchaseOrdersController.update);
router.post('/:id/issue', requireAuth, requirePermission(PERMISSIONS.PURCHASE_ORDERS_MANAGE), purchaseOrdersController.issue);
router.post('/:id/cancel', requireAuth, requirePermission(PERMISSIONS.PURCHASE_ORDERS_MANAGE), purchaseOrdersController.cancel);

export default router;
