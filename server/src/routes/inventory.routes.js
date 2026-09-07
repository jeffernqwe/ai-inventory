import { Router } from 'express';

import requireAuth from '../middlewares/authenticate.js';
import { requirePermission } from '../middlewares/authorize.js';
import inventoryController from '../controllers/inventory.controller.js';
import transactionsController from '../controllers/transactions.controller.js';
import { PERMISSIONS } from '../constants/roles.js';

const router = Router();

// Static sub-routes must be registered before the parameterized GET /:id.
// Reads: INVENTORY_VIEW / INVENTORY_HISTORY_VIEW.
// Mutations: stock-in/stock-out/adjust use their coarse permissions (§7).
router.get('/', requireAuth, requirePermission(PERMISSIONS.INVENTORY_VIEW), inventoryController.list);
router.post('/stock-in', requireAuth, requirePermission(PERMISSIONS.INVENTORY_STOCK_IN), inventoryController.stockIn);
router.post('/stock-out', requireAuth, requirePermission(PERMISSIONS.INVENTORY_STOCK_OUT), inventoryController.stockOut);
router.post('/adjust', requireAuth, requirePermission(PERMISSIONS.INVENTORY_MANAGE), inventoryController.adjust);
router.get('/history', requireAuth, requirePermission(PERMISSIONS.INVENTORY_HISTORY_VIEW), transactionsController.list);
router.get('/:id', requireAuth, requirePermission(PERMISSIONS.INVENTORY_VIEW), inventoryController.get);

export default router;
