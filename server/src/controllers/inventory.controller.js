import { parsePagination, pageResult } from '../utils/pagination.js';
import { isObjectId, optionalObjectId, validateStockMovement, validateTransfer } from '../utils/validate.js';
import { throwValidation, invalidId } from '../utils/errors.js';
import inventoryService from '../services/inventory.service.js';

function paramId(req) {
  if (!isObjectId(req.params.id)) invalidId();
  return req.params.id;
}

function parseFlag(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'boolean') return value;
  const s = String(value).toLowerCase();
  return !(s === 'false' || s === '0' || s === '');
}

function parseQueryList(req) {
  const { page, limit, skip } = parsePagination(req.query);
  const problems = [];

  let q;
  if (req.query.q !== undefined) {
    const trimmed = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!trimmed) problems.push({ field: 'q', message: 'q must not be empty' });
    else q = trimmed;
  }

  let status;
  if (req.query.status !== undefined) {
    if (req.query.status === 'ACTIVE' || req.query.status === 'ARCHIVED') status = req.query.status;
    else problems.push({ field: 'status', message: 'status must be ACTIVE or ARCHIVED' });
  }

  const productId = optionalObjectId(req.query.productId, 'productId');
  problems.push(...productId.problems);
  const locationId = optionalObjectId(req.query.locationId, 'locationId');
  problems.push(...locationId.problems);

  const lowStock = parseFlag(req.query.lowStock);
  const outOfStock = parseFlag(req.query.outOfStock);

  return {
    q,
    status,
    productId: productId.value,
    locationId: locationId.value,
    lowStock,
    outOfStock,
    page,
    limit,
    skip,
    problems,
  };
}

/** Validates a stock-movement body and requires productId/locationId. */
function parseMovementInput(req, { allowZero = false } = {}) {
  const v = validateStockMovement(req.body ?? {}, { allowZero });
  const problems = [...v.problems];
  if (!v.productId) problems.push({ field: 'productId', message: 'productId is required' });
  if (!v.locationId) problems.push({ field: 'locationId', message: 'locationId is required' });
  if (problems.length) throwValidation(problems);
  return {
    productId: v.productId,
    locationId: v.locationId,
    quantity: v.quantity,
    reason: v.reason,
    reference: v.reference,
  };
}

/** Validates a transfer body and requires productId + both locations. */
function parseTransferInput(req) {
  const v = validateTransfer(req.body ?? {});
  const problems = [...v.problems];
  if (!v.productId) problems.push({ field: 'productId', message: 'productId is required' });
  if (!v.fromLocationId) problems.push({ field: 'fromLocationId', message: 'fromLocationId is required' });
  if (!v.toLocationId) problems.push({ field: 'toLocationId', message: 'toLocationId is required' });
  if (problems.length) throwValidation(problems);
  return {
    productId: v.productId,
    fromLocationId: v.fromLocationId,
    toLocationId: v.toLocationId,
    quantity: v.quantity,
    reason: v.reason,
    reference: v.reference,
  };
}

const inventoryController = {
  async list(req, res) {
    const parsed = parseQueryList(req);
    if (parsed.problems.length) throwValidation(parsed.problems);
    const { items, total } = await inventoryService.listRows(req.user.businessId, parsed);
    res.json(pageResult(items, total, parsed.page, parsed.limit));
  },

  async get(req, res) {
    const row = await inventoryService.getRow(req.user.businessId, paramId(req));
    res.json(row);
  },

  async stockIn(req, res) {
    const input = parseMovementInput(req);
    const out = await inventoryService.stockIn(req.user.businessId, req.user.id, input);
    res.status(201).json({
      transaction: out.transaction,
      previousQuantity: out.previousQuantity,
      newQuantity: out.newQuantity,
    });
  },

  async stockOut(req, res) {
    const input = parseMovementInput(req);
    const out = await inventoryService.stockOut(req.user.businessId, req.user.id, input);
    res.json({
      transaction: out.transaction,
      previousQuantity: out.previousQuantity,
      newQuantity: out.newQuantity,
    });
  },

  /** Moves stock between two locations of the caller's business (Phase 19). */
  async transfer(req, res) {
    const input = parseTransferInput(req);
    const out = await inventoryService.transfer(req.user.businessId, req.user.id, input);
    res.status(201).json({
      reference: out.reference,
      transaction: out.transaction,
      destinationTransaction: out.destinationTransaction,
      previousQuantity: out.previousQuantity,
      newQuantity: out.newQuantity,
      destinationPreviousQuantity: out.destinationPreviousQuantity,
      destinationNewQuantity: out.destinationNewQuantity,
    });
  },

  async adjust(req, res) {
    const input = parseMovementInput(req, { allowZero: true });
    const out = await inventoryService.adjust(req.user.businessId, req.user.id, input);
    res.json({
      transaction: out.transaction,
      previousQuantity: out.previousQuantity,
      newQuantity: out.newQuantity,
    });
  },
};

export default inventoryController;
