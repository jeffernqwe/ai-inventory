import mongoose from 'mongoose';

import Inventory from '../models/inventory.model.js';
import InventoryTransaction from '../models/inventoryTransaction.model.js';
import Product from '../models/product.model.js';
import Location from '../models/location.model.js';
import ApiError from '../utils/ApiError.js';
import { recordAudit } from './audit.service.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../constants/audit.js';

const { ObjectId } = mongoose.Types;
const oid = (id) => new ObjectId(id);

const AUDIT_ACTION_BY_TYPE = {
  STOCK_IN: AUDIT_ACTIONS.INVENTORY_STOCK_IN,
  STOCK_OUT: AUDIT_ACTIONS.INVENTORY_STOCK_OUT,
  ADJUSTMENT: AUDIT_ACTIONS.INVENTORY_ADJUSTED,
};

function isDuplicateKey(err) {
  return err?.code === 11000;
}

function pickProductRef(p) {
  if (!p) return null;
  return {
    id: String(p._id ?? p.id),
    name: p.name,
    sku: p.sku ?? null,
    barcode: p.barcode ?? null,
    unit: p.unit ?? null,
    status: p.status,
    minimumStock: p.minimumStock ?? 0,
  };
}

function pickLocationRef(l) {
  if (!l) return null;
  return { id: String(l._id ?? l.id), name: l.name };
}

/**
 * Public shape for an inventory row. Accepts either an aggregation doc with
 * nested `product`/`location` objects or a populated Mongoose doc (productId/
 * locationId populated). Stock-status flags follow SYSTEM_SPECIFICATION.md §19.
 */
export function inventoryRowPublic(row) {
  const product =
    row.product != null
      ? pickProductRef(row.product)
      : row.productId?._id
        ? pickProductRef(row.productId)
        : null;
  const location =
    row.location != null
      ? pickLocationRef(row.location)
      : row.locationId?._id
        ? pickLocationRef(row.locationId)
        : null;
  const quantity = row.quantity ?? 0;
  const reservedQuantity = row.reservedQuantity ?? 0;
  const availableQuantity = row.availableQuantity ?? quantity - reservedQuantity;
  return {
    id: String(row._id),
    businessId: String(row.businessId),
    product,
    location,
    quantity,
    reservedQuantity,
    availableQuantity,
    isLowStock: product ? availableQuantity <= product.minimumStock : false,
    isOutOfStock: availableQuantity <= 0,
    updatedAt: row.updatedAt,
  };
}

/** Safe API/DTO shape for an inventory transaction record. */
export function transactionPublic(txn) {
  return {
    id: String(txn._id),
    businessId: String(txn.businessId),
    productId: String(txn.productId),
    locationId: String(txn.locationId),
    type: txn.type,
    quantity: txn.quantity,
    previousQuantity: txn.previousQuantity,
    newQuantity: txn.newQuantity,
    reason: txn.reason ?? undefined,
    reference: txn.reference ?? undefined,
    userId: String(txn.userId),
    createdAt: txn.createdAt,
  };
}

/**
 * Makes a stock movement durable by creating the inventory transaction and the
 * audit log. Runs only AFTER the inventory quantity was updated atomically.
 *
 * The InventoryTransaction is the authoritative, durable record of the change.
 * Once it is written the movement must stand: an audit-logging failure is
 * therefore logged and swallowed, never propagated — surfacing it would make
 * the caller compensate an already-durable change and orphan the transaction
 * (Phase 07A / H3). The only failure that propagates is
 * InventoryTransaction.create itself, i.e. no transaction row was created by
 * this call, which is exactly the safe point for the caller to compensate.
 */
async function recordMovement({
  businessId,
  userId,
  productId,
  locationId,
  type,
  quantity,
  previousQuantity,
  newQuantity,
  reason,
  reference,
}) {
  const txn = await InventoryTransaction.create({
    businessId,
    productId,
    locationId,
    type,
    quantity,
    previousQuantity,
    newQuantity,
    reason: reason || undefined,
    reference: reference || undefined,
    userId,
  });
  try {
    await recordAudit({
      businessId,
      userId,
      action: AUDIT_ACTION_BY_TYPE[type],
      entityType: AUDIT_ENTITY_TYPES.INVENTORY_TRANSACTION,
      entityId: txn._id,
      metadata: {
        productId: String(productId),
        locationId: String(locationId),
        type,
        quantity,
        previousQuantity,
        newQuantity,
      },
    });
  } catch (err) {
    console.error(
      `[inventory] audit record failed for ${type} transaction ${String(txn._id)} (movement preserved): ${err.message}`
    );
  }
  return txn;
}

/**
 * Concurrency-safe compensation for an inventory change whose transaction
 * record could not be persisted (SYSTEM_SPECIFICATION.md §16 — the inventory
 * must never move without its transaction). Reverts ONLY the quantity this
 * operation wrote, and ONLY while the row is still exactly at that quantity
 * (`filter` must anchor on the current quantity this operation produced). If a
 * concurrent movement has already committed a newer quantity, the update
 * matches nothing and the rollback no-ops — it never blindly overwrites a newer
 * value (Phase 07A / H4). The rollback restores a previously legal,
 * non-negative quantity in a single atomic update, so it can never create a
 * negative quantity (Phase 07A / H5). Compensation failures are logged, never
 * masked, so the original error still reaches the caller.
 */
async function rollbackInventory(filter, operation, label) {
  try {
    const res = await Inventory.updateOne(filter, operation);
    if (res.modifiedCount !== 1) {
      console.error(`[inventory] ${label}: rollback skipped (row no longer at the written quantity)`);
    }
  } catch (err) {
    console.error(`[inventory] ${label}: rollback failed:`, err.message);
  }
}

/**
 * Compensation for a first stock-in whose row this operation created (upsert).
 * Deletes the row instead of decrementing it, and only while the row is still
 * exactly as this operation left it (quantity + reservedQuantity anchored), so
 * a failed first stock-in can never leave a zero-quantity orphan row (Phase 07A
 * / L5) and a concurrent movement that built on the new row is never removed.
 * Best-effort like rollbackInventory.
 */
async function rollbackCreatedRow(businessId, productId, locationId, quantity, label) {
  try {
    const res = await Inventory.deleteOne({
      businessId,
      productId,
      locationId,
      quantity,
      reservedQuantity: 0,
    });
    if (res.deletedCount !== 1) {
      console.error(`[inventory] ${label}: created-row rollback skipped (row no longer at quantity ${quantity})`);
    }
  } catch (err) {
    console.error(`[inventory] ${label}: created-row rollback failed:`, err.message);
  }
}

/**
 * Inventory core service. Every operation is scoped by the server-derived
 * businessId. Quantity changes are single-document atomic updates with
 * conditional guards (no read/modify/save races, no multi-document transaction
 * required), then recorded as an InventoryTransaction + AuditLog.
 */
export const inventoryService = {
  /** Product must exist in the business and not be archived. */
  async assertOperationalProduct(businessId, productId) {
    const product = await Product.findOne({ _id: oid(productId), businessId: oid(businessId) }).lean();
    if (!product) throw new ApiError(404, 'Product not found', 'PRODUCT_NOT_FOUND');
    if (product.status === 'ARCHIVED') {
      throw new ApiError(409, 'Archived products cannot be used in stock movements', 'PRODUCT_ARCHIVED');
    }
    return product;
  },

  /** Location must exist in the business and not be archived. */
  async assertOperationalLocation(businessId, locationId) {
    const location = await Location.findOne({ _id: oid(locationId), businessId: oid(businessId) }).lean();
    if (!location) throw new ApiError(404, 'Location not found', 'LOCATION_NOT_FOUND');
    if (location.status === 'ARCHIVED') {
      throw new ApiError(409, 'Archived locations cannot be used in stock movements', 'LOCATION_ARCHIVED');
    }
    return location;
  },

  /**
   * Increase on-hand quantity at a product+location. Creates the inventory row
   * on first stock-in (upsert). Atomic; retried once if a concurrent upsert
   * races the unique (businessId, productId, locationId) index.
   */
  async stockIn(businessId, userId, { productId, locationId, quantity, reason, reference }) {
    await this.assertOperationalProduct(businessId, productId);
    await this.assertOperationalLocation(businessId, locationId);

    const filter = { businessId: oid(businessId), productId: oid(productId), locationId: oid(locationId) };
    const inc = { $inc: { quantity } };

    let prev;
    try {
      prev = await Inventory.findOneAndUpdate(filter, inc, {
        returnDocument: 'before',
        upsert: true,
        setDefaultsOnInsert: true,
        runValidators: true,
      });
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      // Another stock-in created the row between our assert and this upsert.
      prev = await Inventory.findOneAndUpdate(filter, inc, { returnDocument: 'before', runValidators: true });
    }

    const previousQuantity = prev?.quantity ?? 0;
    const newQuantity = previousQuantity + quantity;

    try {
      const txn = await recordMovement({
        businessId,
        userId,
        productId,
        locationId,
        type: 'STOCK_IN',
        quantity,
        previousQuantity,
        newQuantity,
        reason,
        reference,
      });
      return { transaction: transactionPublic(txn), previousQuantity, newQuantity };
    } catch (err) {
      if (prev == null) {
        // This stock-in created the row (first stock-in, upsert inserted it).
        // Compensate by deleting the freshly created row — never by decrementing
        // it to zero and leaving an orphan row (L5). The delete is anchored on
        // the exact quantity we wrote so a concurrent movement that built on
        // the new row is preserved.
        await rollbackCreatedRow(filter.businessId, filter.productId, filter.locationId, newQuantity, 'stock-in');
      } else {
        // Existing row: revert only while it is still exactly at the quantity
        // this operation produced; a concurrent movement makes it a no-op.
        await rollbackInventory(
          { _id: prev._id, quantity: newQuantity },
          { $inc: { quantity: -quantity } },
          'stock-in'
        );
      }
      throw err;
    }
  },

  /**
   * Decrease on-hand quantity. The conditional guard (available >= quantity)
   * is evaluated atomically with the decrement, so concurrent stock-outs can
   * never drive available below zero. Missing row vs insufficient stock are
   * distinguished with a follow-up read when the guard rejects the update.
   */
  async stockOut(businessId, userId, { productId, locationId, quantity, reason, reference }) {
    await this.assertOperationalProduct(businessId, productId);
    await this.assertOperationalLocation(businessId, locationId);

    const filter = {
      businessId: oid(businessId),
      productId: oid(productId),
      locationId: oid(locationId),
      $expr: { $gte: [{ $subtract: ['$quantity', '$reservedQuantity'] }, quantity] },
    };

    const prev = await Inventory.findOneAndUpdate(filter, { $inc: { quantity: -quantity } }, { returnDocument: 'before' });
    if (!prev) {
      const row = await Inventory.findOne({
        businessId: oid(businessId),
        productId: oid(productId),
        locationId: oid(locationId),
      });
      if (!row) {
        throw new ApiError(404, 'No inventory exists for this product at this location', 'INVENTORY_NOT_FOUND');
      }
      throw new ApiError(409, 'Insufficient available stock', 'INSUFFICIENT_STOCK');
    }

    const previousQuantity = prev.quantity;
    const newQuantity = previousQuantity - quantity;

    try {
      const txn = await recordMovement({
        businessId,
        userId,
        productId,
        locationId,
        type: 'STOCK_OUT',
        quantity,
        previousQuantity,
        newQuantity,
        reason,
        reference,
      });
      return { transaction: transactionPublic(txn), previousQuantity, newQuantity };
    } catch (err) {
      // Revert only while the row is still exactly at the quantity this
      // stock-out produced; a concurrent movement makes it a no-op.
      await rollbackInventory(
        { _id: prev._id, quantity: newQuantity },
        { $inc: { quantity } },
        'stock-out'
      );
      throw err;
    }
  },

  /**
   * Set on-hand quantity to an absolute target. The stored transaction delta is
   * the magnitude of the change; an adjustment to the current quantity is a 409
   * NO_CHANGE (no zero-quantity transaction is ever created). The update is
   * guarded so the resulting available quantity can never be negative.
   */
  async adjust(businessId, userId, { productId, locationId, quantity: target, reason, reference }) {
    await this.assertOperationalProduct(businessId, productId);
    await this.assertOperationalLocation(businessId, locationId);

    const base = { businessId: oid(businessId), productId: oid(productId), locationId: oid(locationId) };
    const guard = {
      $and: [{ $ne: ['$quantity', target] }, { $gte: [target, '$reservedQuantity'] }],
    };

    let prev = await Inventory.findOneAndUpdate({ ...base, $expr: guard }, { $set: { quantity: target } }, { returnDocument: 'before' });
    if (!prev) {
      const row = await Inventory.findOne(base);
      if (!row) {
        throw new ApiError(404, 'No inventory exists for this product at this location', 'INVENTORY_NOT_FOUND');
      }
      if (row.quantity === target) {
        throw new ApiError(409, 'Inventory is already at the requested quantity', 'NO_CHANGE');
      }
      if (target < row.reservedQuantity) {
        throw new ApiError(409, 'Target quantity is below the reserved quantity', 'ADJUSTMENT_BELOW_RESERVED');
      }
      // A concurrent operation finished between our attempt and this read; the
      // guard now passes, so apply the change once more.
      prev = await Inventory.findOneAndUpdate({ _id: row._id, $expr: guard }, { $set: { quantity: target } }, { returnDocument: 'before' });
      if (!prev) {
        throw new ApiError(409, 'Inventory changed concurrently; retry the adjustment', 'ADJUSTMENT_CONFLICT');
      }
    }

    const previousQuantity = prev.quantity;
    const delta = Math.abs(target - previousQuantity); // >= 1: equality was rejected above

    try {
      const txn = await recordMovement({
        businessId,
        userId,
        productId,
        locationId,
        type: 'ADJUSTMENT',
        quantity: delta,
        previousQuantity,
        newQuantity: target,
        reason,
        reference,
      });
      return { transaction: transactionPublic(txn), previousQuantity, newQuantity: target };
    } catch (err) {
      // Revert only while the row is still exactly at the target quantity this
      // adjustment wrote; a concurrent movement makes it a no-op.
      await rollbackInventory(
        { _id: prev._id, quantity: target },
        { $set: { quantity: previousQuantity } },
        'adjust'
      );
      throw err;
    }
  },

  /** A single inventory row by its row id, scoped to the business. */
  async getRow(businessId, id) {
    const doc = await Inventory.findOne({ _id: oid(id), businessId: oid(businessId) })
      .populate('productId')
      .populate('locationId');
    if (!doc) throw new ApiError(404, 'Inventory record not found', 'INVENTORY_NOT_FOUND');
    return inventoryRowPublic(doc);
  },

  /**
   * Inventory rows for the business with optional product/location filters.
   * `q` searches product name/sku/barcode; `status` filters product status;
   * `lowStock`/`outOfStock` filter rows by per-row available quantity (per
   * §19: low = available <= minimumStock, out = available <= 0).
   */
  async listRows(businessId, { productId, locationId, q, status, lowStock, outOfStock, skip, limit }) {
    const bizOid = oid(businessId);
    const match = { businessId: bizOid };
    if (productId) match.productId = oid(productId);
    if (locationId) match.locationId = oid(locationId);

    const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pipeline = [
      { $match: match },
      {
        $lookup: {
          from: 'products',
          let: { pid: '$productId' },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$businessId', bizOid] }, { $eq: ['$_id', '$$pid'] }] } } },
          ],
          as: 'product',
        },
      },
    ];

    const productMatch = { 'product.0': { $exists: true } };
    if (status === 'ACTIVE' || status === 'ARCHIVED') productMatch['product.status'] = status;
    if (q) {
      const re = { $regex: escapeRegExp(q), $options: 'i' };
      productMatch.$or = [{ 'product.name': re }, { 'product.sku': re }, { 'product.barcode': re }];
    }
    pipeline.push({ $match: productMatch });
    pipeline.push({ $unwind: '$product' });
    pipeline.push({
      $addFields: {
        availableQuantity: {
          $subtract: [{ $ifNull: ['$quantity', 0] }, { $ifNull: ['$reservedQuantity', 0] }],
        },
      },
    });
    if (outOfStock) pipeline.push({ $match: { $expr: { $lte: ['$availableQuantity', 0] } } });
    if (lowStock) pipeline.push({ $match: { $expr: { $lte: ['$availableQuantity', '$product.minimumStock'] } } });

    pipeline.push({
      $lookup: {
        from: 'locations',
        let: { lid: '$locationId' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$businessId', bizOid] }, { $eq: ['$_id', '$$lid'] }] } } },
        ],
        as: 'location',
      },
    });
    pipeline.push({ $unwind: { path: '$location', preserveNullAndEmptyArrays: true } });
    pipeline.push({
      $facet: {
        metadata: [{ $count: 'total' }],
        data: [{ $sort: { updatedAt: -1 } }, { $skip: skip }, { $limit: limit }],
      },
    });

    const [result] = await Inventory.aggregate(pipeline);
    const items = (result?.data ?? []).map(inventoryRowPublic);
    const total = result?.metadata?.[0]?.total ?? 0;
    return { items, total };
  },
};

export default inventoryService;
