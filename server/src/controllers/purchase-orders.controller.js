import { parsePagination, pageResult } from '../utils/pagination.js';
import { isObjectId, validatePurchaseOrder, validateReceive, validatePurchaseOrderList } from '../utils/validate.js';
import { throwValidation, invalidId } from '../utils/errors.js';
import { PURCHASE_ORDER_STATUSES } from '../models/purchaseOrder.model.ts';
import { purchaseOrderService } from '../services/purchase-orders.service.js';

/**
 * Purchase order controllers. businessId/userId always come from the
 * authenticated request (req.user) — never the body. Reads are open to any
 * authenticated member; mutations are gated by requirePermission at the route.
 */
const paramId = (req) => {
  if (!isObjectId(req.params.id)) invalidId();
  return req.params.id;
};

export const purchaseOrdersController = {
  async list(req, res) {
    const { page, limit, skip } = parsePagination(req.query);
    const v = validatePurchaseOrderList(req.query, PURCHASE_ORDER_STATUSES);
    if (v.problems.length) throwValidation(v.problems);
    const { items, total } = await purchaseOrderService.list(req.user.businessId, {
      ...v.filters,
      skip,
      limit,
    });
    res.json(pageResult(items, total, page, limit));
  },

  async create(req, res) {
    const v = validatePurchaseOrder(req.body ?? {});
    if (v.problems.length) throwValidation(v.problems);
    const po = await purchaseOrderService.create(req.user.businessId, req.user.id, v);
    res.status(201).json(po);
  },

  async get(req, res) {
    const po = await purchaseOrderService.get(req.user.businessId, paramId(req));
    res.json(po);
  },

  async update(req, res) {
    const id = paramId(req);
    const v = validatePurchaseOrder(req.body ?? {}, { partial: true });
    if (v.problems.length) throwValidation(v.problems);
    const po = await purchaseOrderService.update(req.user.businessId, id, req.user.id, v);
    res.json(po);
  },

  async issue(req, res) {
    const po = await purchaseOrderService.issue(req.user.businessId, paramId(req), req.user.id);
    res.json(po);
  },

  async cancel(req, res) {
    const po = await purchaseOrderService.cancel(req.user.businessId, paramId(req), req.user.id);
    res.json(po);
  },

  /** Receive stock against an OPEN purchase order (Phase 13C). */
  async receive(req, res) {
    const v = validateReceive(req.body ?? {});
    if (v.problems.length) throwValidation(v.problems);
    const result = await purchaseOrderService.receive(req.user.businessId, req.user.id, paramId(req), {
      lines: v.lines,
      reference: v.reference,
    });
    res.json(result);
  },
};

export default purchaseOrdersController;
