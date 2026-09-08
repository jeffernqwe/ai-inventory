import { Router } from 'express';

import requireAuth from '../middlewares/authenticate.js';
import { requirePermission } from '../middlewares/authorize.js';
import productsController from '../controllers/products.controller.js';
import { PERMISSIONS } from '../constants/roles.js';

const router = Router();

// Catalog reads: any authenticated member of the business. Mutations: those
// with products.manage (OWNER, ADMIN, MANAGER per spec §7).
router.get('/', requireAuth, productsController.list);
router.post('/', requireAuth, requirePermission(PERMISSIONS.PRODUCTS_MANAGE), productsController.create);
// Static path must be registered before the parameterized /:id routes below.
router.get('/reorder', requireAuth, productsController.reorder);
router.get('/barcode', requireAuth, productsController.byBarcode);
router.get('/:id', requireAuth, productsController.get);
router.patch('/:id', requireAuth, requirePermission(PERMISSIONS.PRODUCTS_MANAGE), productsController.update);
router.post('/:id/archive', requireAuth, requirePermission(PERMISSIONS.PRODUCTS_MANAGE), productsController.archive);
router.post('/:id/restore', requireAuth, requirePermission(PERMISSIONS.PRODUCTS_MANAGE), productsController.restore);
router.post('/:id/generate-barcode', requireAuth, requirePermission(PERMISSIONS.PRODUCTS_MANAGE), productsController.generateBarcode);

export default router;
