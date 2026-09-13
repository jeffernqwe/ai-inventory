import { Router } from 'express';

import requireAuth from '../middlewares/authenticate.js';
import { requirePermission } from '../middlewares/authorize.js';
import { purchaseOrdersController } from '../controllers/purchase-orders.controller.js';
import { PERMISSIONS } from '../constants/roles.ts';

const router = Router();

// Reads: purchase-orders.view, which every role holds (Phase 22 — the binding is
// now explicit and guarded rather than implied by requireAuth alone). Mutations:
// purchase-orders.manage (OWNER, ADMIN, MANAGER) for create/edit/issue/cancel.
// STAFF may view and (Phase 13C) receive — receiving is its own permission key
// so it is provably distinct from managing the order.
router.get('/', requireAuth, requirePermission(PERMISSIONS.PURCHASE_ORDERS_VIEW), purchaseOrdersController.list);
router.post('/', requireAuth, requirePermission(PERMISSIONS.PURCHASE_ORDERS_MANAGE), purchaseOrdersController.create);
router.get('/:id', requireAuth, requirePermission(PERMISSIONS.PURCHASE_ORDERS_VIEW), purchaseOrdersController.get);
router.patch('/:id', requireAuth, requirePermission(PERMISSIONS.PURCHASE_ORDERS_MANAGE), purchaseOrdersController.update);
router.post('/:id/issue', requireAuth, requirePermission(PERMISSIONS.PURCHASE_ORDERS_MANAGE), purchaseOrdersController.issue);
router.post('/:id/cancel', requireAuth, requirePermission(PERMISSIONS.PURCHASE_ORDERS_MANAGE), purchaseOrdersController.cancel);
router.post('/:id/receive', requireAuth, requirePermission(PERMISSIONS.PURCHASE_ORDERS_RECEIVE), purchaseOrdersController.receive);

export default router;
