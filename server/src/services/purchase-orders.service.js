import mongoose from 'mongoose';

import PurchaseOrder, { PURCHASE_ORDER_STATUSES } from '../models/purchaseOrder.model.js';
import Supplier from '../models/supplier.model.js';
import { inventoryService } from './inventory.service.js';
import ApiError from '../utils/ApiError.js';
import { isObjectId } from '../utils/validate.js';
import { recordAudit } from './audit.service.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../constants/audit.js';

const { ObjectId } = mongoose.Types;
const oid = (id) => new ObjectId(id);

const PO_NUMBER_PREFIX = 'PO-';
const PO_NUMBER_PAD = 4;
const PO_NUMBER_MAX_ATTEMPTS = 10;

function isDuplicateKey(err) {
  return err?.code === 11000;
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Business-scoped sequential PO number. Reads the highest existing numeric
 * suffix in this business and returns that + 1 (padded, e.g. PO-0001). The
 * unique (businessId, number) index is the final authority: the create loop
 * recomputes and retries if a concurrent create races this read.
 */
async function nextPurchaseOrderNumber(businessId) {
  const docs = await PurchaseOrder.find(
    { businessId: oid(businessId), number: { $regex: /^PO-\d+$/ } },
    { number: 1 }
  ).lean();
  let max = 0;
  for (const doc of docs) {
    const n = Number(doc.number.slice(PO_NUMBER_PREFIX.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${PO_NUMBER_PREFIX}${String(max + 1).padStart(PO_NUMBER_PAD, '0')}`;
}

/** Supplier must exist in the business and not be archived (mirrors inventory asserts). */
async function assertOperationalSupplier(businessId, supplierId) {
  const supplier = await Supplier.findOne({ _id: oid(supplierId), businessId: oid(businessId) }).lean();
  if (!supplier) throw new ApiError(404, 'Supplier not found', 'SUPPLIER_NOT_FOUND');
  if (supplier.status === 'ARCHIVED') {
    throw new ApiError(409, 'Archived suppliers cannot be used on a purchase order', 'SUPPLIER_ARCHIVED');
  }
  return supplier;
}

/** A PO's own audit event; the PO document is authoritative, so a logging
 * failure is reported but never rolls a durable state change back. */
async function recordPoAudit(businessId, userId, action, entityId, metadata) {
  try {
    await recordAudit({
      businessId,
      userId,
      action,
      entityType: AUDIT_ENTITY_TYPES.PURCHASE_ORDER,
      entityId,
      metadata,
    });
  } catch (err) {
    console.error(`[purchase-orders] audit record failed for ${action} ${String(entityId)}: ${err.message}`);
  }
}

function supplierRef(po) {
  const s = po.supplierId;
  if (s && s._id) return { id: String(s._id), name: s.name, status: s.status };
  return { id: String(s), name: null, status: null };
}

function locationRef(po) {
  const l = po.locationId;
  if (l && l._id) return { id: String(l._id), name: l.name };
  return { id: String(l), name: null };
}

function itemPublic(item) {
  const quantityReceived = item.quantityReceived ?? 0;
  return {
    productId: String(item.productId),
    productName: item.productName,
    sku: item.sku ?? undefined,
    quantityOrdered: item.quantityOrdered,
    quantityReceived,
    remainingQuantity: item.quantityOrdered - quantityReceived,
    unitCost: item.unitCost ?? undefined,
  };
}

/** Totals are computed (never stored) so they cannot drift from the lines. */
function totalsOf(items) {
  const quantityOrdered = items.reduce((sum, i) => sum + (i.quantityOrdered || 0), 0);
  const quantityReceived = items.reduce((sum, i) => sum + (i.quantityReceived || 0), 0);
  const estimatedCost = items.reduce(
    (sum, i) => sum + (i.quantityOrdered || 0) * (i.unitCost ?? 0),
    0
  );
  return {
    quantityOrdered,
    quantityReceived,
    remainingQuantity: quantityOrdered - quantityReceived,
    estimatedCost,
  };
}

/** List/header shape — no item lines, just the count + computed totals. */
function headerPublic(po) {
  const items = po.items || [];
  return {
    id: String(po._id),
    businessId: String(po.businessId),
    number: po.number,
    status: po.status,
    supplier: supplierRef(po),
    location: locationRef(po),
    expectedAt: po.expectedAt ?? undefined,
    notes: po.notes ?? undefined,
    totals: totalsOf(items),
    itemCount: items.length,
    createdAt: po.createdAt,
    updatedAt: po.updatedAt,
  };
}

/** Detail shape — header plus the full item lines. */
function detailPublic(po) {
  return { ...headerPublic(po), items: (po.items || []).map(itemPublic) };
}

async function fetchPo(businessId, id) {
  const po = await PurchaseOrder.findOne({ _id: oid(id), businessId: oid(businessId) })
    .populate({ path: 'supplierId', select: 'name status' })
    .populate({ path: 'locationId', select: 'name' })
    .lean();
  if (!po) throw new ApiError(404, 'Purchase order not found', 'PO_NOT_FOUND');
  return po;
}

/**
 * Re-verify + snapshot a supplier/location/item set that is being placed on a
 * PO. Every reference must belong to the business and be ACTIVE (server-side —
 * never a client businessId), reusing inventory's operational asserts so PO
 * behaviour matches stock movements exactly. Snapshot product name/sku at order
 * time; quantityReceived always starts at 0 (only receiving advances it).
 */
async function resolveOperational(businessId, supplierId, locationId, lines) {
  const supplier = await assertOperationalSupplier(businessId, supplierId);
  const location = await inventoryService.assertOperationalLocation(businessId, locationId);
  const items = [];
  for (const line of lines) {
    const product = await inventoryService.assertOperationalProduct(businessId, line.productId);
    items.push({
      productId: product._id,
      productName: product.name,
      sku: product.sku || undefined,
      quantityOrdered: line.quantityOrdered,
      quantityReceived: 0,
      unitCost: line.unitCost,
    });
  }
  return { supplier, location, items };
}

/** Create a PO in DRAFT. Allocates a business-scoped number under the unique
 * index and retries on a duplicate-key race (bounded). Never writes stock. */
async function create(businessId, userId, payload) {
  const refs = await resolveOperational(businessId, payload.supplierId, payload.locationId, payload.items);

  for (let attempt = 0; attempt < PO_NUMBER_MAX_ATTEMPTS; attempt += 1) {
    const number = await nextPurchaseOrderNumber(businessId);
    let po;
    try {
      po = await PurchaseOrder.create({
        businessId: oid(businessId),
        number,
        supplierId: oid(payload.supplierId),
        locationId: oid(payload.locationId),
        expectedAt: payload.expectedAt,
        notes: payload.notes,
        status: 'DRAFT',
        items: refs.items,
      });
    } catch (err) {
      if (isDuplicateKey(err)) continue; // a concurrent create took this number
      throw err;
    }
    await recordPoAudit(businessId, userId, AUDIT_ACTIONS.PURCHASE_ORDER_CREATED, po._id, {
      number: po.number,
      supplierId: String(refs.supplier._id),
      locationId: String(refs.location._id),
    });
    return detailPublic(await fetchPo(businessId, String(po._id)));
  }

  throw new ApiError(409, 'Could not allocate a unique purchase order number; retry the request', 'PO_NUMBER_CONFLICT');
}

/** List PO headers with optional status / supplier / number (q) filters. */
async function list(businessId, { status, supplierId, q, skip, limit }) {
  const match = { businessId: oid(businessId) };
  if (PURCHASE_ORDER_STATUSES.includes(status)) match.status = status;
  if (supplierId && isObjectId(supplierId)) match.supplierId = oid(supplierId);
  if (q) match.number = { $regex: escapeRegExp(q), $options: 'i' };

  const [total, rows] = await Promise.all([
    PurchaseOrder.countDocuments(match),
    PurchaseOrder.find(match)
      .populate({ path: 'supplierId', select: 'name status' })
      .populate({ path: 'locationId', select: 'name' })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);
  return { items: rows.map(headerPublic), total };
}

/** Full detail (header + items). Any authenticated member of the business. */
async function get(businessId, id) {
  return detailPublic(await fetchPo(businessId, id));
}

/**
 * Edit a DRAFT only. Any supplied reference is re-validated against the
 * business; a supplied `items` array replaces the full line set (a DRAFT has
 * never received, so lines reset to quantityReceived 0 safely). Once OPEN the
 * order is frozen — fix a mistake by cancel + re-create.
 */
async function update(businessId, id, userId, payload) {
  const existing = await fetchPo(businessId, id);
  if (existing.status !== 'DRAFT') {
    throw new ApiError(409, 'Only a DRAFT purchase order can be edited', 'PO_NOT_DRAFT');
  }

  const set = {};
  if (payload.supplierId !== undefined) {
    await assertOperationalSupplier(businessId, payload.supplierId);
    set.supplierId = oid(payload.supplierId);
  }
  if (payload.locationId !== undefined) {
    await inventoryService.assertOperationalLocation(businessId, payload.locationId);
    set.locationId = oid(payload.locationId);
  }
  if (payload.expectedAt !== undefined) set.expectedAt = payload.expectedAt;
  if (payload.notes !== undefined) set.notes = payload.notes;
  if (payload.items !== undefined) {
    const { items } = await resolveOperational(businessId, existing.supplierId._id, existing.locationId._id, payload.items);
    set.items = items;
  }

  const changed = Object.keys(set);
  if (changed.length === 0) return detailPublic(existing);

  const updated = await PurchaseOrder.findOneAndUpdate(
    { _id: oid(id), businessId: oid(businessId), status: 'DRAFT' },
    { $set: set },
    { returnDocument: 'after', runValidators: true }
  );
  if (!updated) {
    throw new ApiError(409, 'Purchase order changed concurrently; refresh and retry', 'PO_STATE_CONFLICT');
  }
  await recordPoAudit(businessId, userId, AUDIT_ACTIONS.PURCHASE_ORDER_UPDATED, updated._id, {
    number: updated.number,
    updated: changed,
  });
  return detailPublic(await fetchPo(businessId, id));
}

/** Issue a DRAFT -> OPEN. Only OPEN orders can be received (Phase 13C). */
async function issue(businessId, id, userId) {
  const existing = await fetchPo(businessId, id);
  if (existing.status === 'CANCELED') {
    throw new ApiError(409, 'A canceled purchase order cannot be issued', 'PO_CANCELED');
  }
  if (existing.status === 'RECEIVED') {
    throw new ApiError(409, 'This purchase order has already been received', 'PO_ALREADY_RECEIVED');
  }
  if (existing.status === 'OPEN') {
    throw new ApiError(409, 'This purchase order is already open', 'PO_ALREADY_OPEN');
  }

  const updated = await PurchaseOrder.findOneAndUpdate(
    { _id: existing._id, businessId: oid(businessId), status: 'DRAFT' },
    { $set: { status: 'OPEN' } },
    { returnDocument: 'after' }
  );
  if (!updated) {
    throw new ApiError(409, 'Purchase order changed concurrently; refresh and retry', 'PO_STATE_CONFLICT');
  }
  await recordPoAudit(businessId, userId, AUDIT_ACTIONS.PURCHASE_ORDER_ISSUED, updated._id, {
    number: updated.number,
    status: 'OPEN',
  });
  return detailPublic(await fetchPo(businessId, id));
}

/** Cancel a DRAFT or OPEN order. Blocks all further work on it. */
async function cancel(businessId, id, userId) {
  const existing = await fetchPo(businessId, id);
  if (existing.status === 'CANCELED') {
    throw new ApiError(409, 'This purchase order is already canceled', 'PO_ALREADY_CANCELED');
  }
  if (existing.status === 'RECEIVED') {
    throw new ApiError(409, 'A received purchase order cannot be canceled', 'PO_ALREADY_RECEIVED');
  }

  const updated = await PurchaseOrder.findOneAndUpdate(
    { _id: existing._id, businessId: oid(businessId), status: { $in: ['DRAFT', 'OPEN'] } },
    { $set: { status: 'CANCELED' } },
    { returnDocument: 'after' }
  );
  if (!updated) {
    throw new ApiError(409, 'Purchase order changed concurrently; refresh and retry', 'PO_STATE_CONFLICT');
  }
  await recordPoAudit(businessId, userId, AUDIT_ACTIONS.PURCHASE_ORDER_CANCELED, updated._id, {
    number: updated.number,
    status: 'CANCELED',
  });
  return detailPublic(await fetchPo(businessId, id));
}

export const purchaseOrderService = {
  create,
  list,
  get,
  update,
  issue,
  cancel,
};

export default purchaseOrderService;
