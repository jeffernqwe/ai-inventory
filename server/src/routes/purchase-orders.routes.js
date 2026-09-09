import { Router } from 'express';

import requireAuth from '../middlewares/authenticate.js';
import { requirePermission } from '../middlewares/authorize.js';
import { purchaseOrdersController } from '../controllers/purchase-orders.controller.js';
import { PERMISSIONS } from '../constants/roles.js';

const router = Router();

// Reads: any authenticated member of the business (products/locations parity).
// Mutations: purchase-orders.manage (OWNER, ADMIN, MANAGER) for create/edit/
// issue/cancel. STAFF may view and (Phase 13C) receive — receiving is its own
// permission key so it is provably distinct from managing the order.
router.get('/', requireAuth, purchaseOrdersController.list);
router.post('/', requireAuth, requirePermission(PERMISSIONS.PURCHASE_ORDERS_MANAGE), purchaseOrdersController.create);
router.get('/:id', requireAuth, purchaseOrdersController.get);
router.patch('/:id', requireAuth, requirePermission(PERMISSIONS.PURCHASE_ORDERS_MANAGE), purchaseOrdersController.update);
router.post('/:id/issue', requireAuth, requirePermission(PERMISSIONS.PURCHASE_ORDERS_MANAGE), purchaseOrdersController.issue);
router.post('/:id/cancel', requireAuth, requirePermission(PERMISSIONS.PURCHASE_ORDERS_MANAGE), purchaseOrdersController.cancel);
router.post('/:id/receive', requireAuth, requirePermission(PERMISSIONS.PURCHASE_ORDERS_RECEIVE), purchaseOrdersController.receive);

export default router;
