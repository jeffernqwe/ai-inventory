import mongoose from 'mongoose';

import PurchaseOrder, { PURCHASE_ORDER_STATUSES } from '../models/purchaseOrder.model.js';
import Supplier from '../models/supplier.model.js';
import Inventory from '../models/inventory.model.js';
import InventoryTransaction from '../models/inventoryTransaction.model.js';
import AuditLog from '../models/auditLog.model.js';
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
// Every received line's stock-in shares this reason plus the PO number as its
// reference, so the ledger history reads uniformly (spec §15 three-type enum is
// unchanged — receiving IS a stock-in, never a new movement type).
const PO_RECEIVE_REASON = 'PO receipt';

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

/**
 * Receiving records on the PO (Phase 13C) — one embedded receipt per received
 * line, each line carrying the exact inventory transaction it caused, so a
 * receipt can be traced to the ledger and back (the transaction's reference is
 * the PO number).
 */
function receiptsPublic(po) {
  return (po.receipts || []).map((receipt) => ({
    receivedAt: receipt.receivedAt,
    userId: String(receipt.userId),
    reference: receipt.reference || undefined,
    lines: (receipt.lines || []).map((line) => ({
      productId: String(line.productId),
      quantity: line.quantity,
      inventoryTransactionId: String(line.inventoryTransactionId),
      previousQuantity: line.previousQuantity,
      newQuantity: line.newQuantity,
    })),
  }));
}

/**
 * In-flight receive claims (claim-first receiving) exposed read-only so an
 * interrupted receive is visible to the operator and the mobile client can
 * subtract pending from the offered receive quantity. Empty at rest; a ghost
 * claim left by a crash mid-receive stays visible here until cancel + re-create.
 */
function pendingClaimsPublic(po) {
  return (po.claims || []).map((claim) => ({
    productId: String(claim.productId),
    quantity: claim.quantity,
    createdAt: claim.createdAt,
  }));
}

/** Detail shape — header plus the full item lines and receiving records. */
function detailPublic(po) {
  return {
    ...headerPublic(po),
    items: (po.items || []).map(itemPublic),
    receipts: receiptsPublic(po),
    pendingClaims: pendingClaimsPublic(po),
  };
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
      quantityCommitted: 0,
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
      // `_id` breaks createdAt ties in the same direction as the primary sort so
      // paging cannot repeat or skip an order.
      .sort({ createdAt: -1, _id: -1 })
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

/**
 * Full precise undo of one received line whose PO finalize lost a race (Phase 13C
 * compensation, owner-approved). Reverts exactly what this call's stock-in wrote:
 * the inventory row (deleting a row this call created, else restoring a pre-existing
 * one), then that movement's InventoryTransaction and its audit row. Cross-document,
 * so each step is anchored — if a concurrent movement has built on the row, the
 * restore no-ops, the movement is left durable (it is part of history now) and the
 * transaction/audit are kept; a newer value is never clobbered (H4/L5 parity). A
 * step that still cannot restore logs loudly and leaves a visible reference-tagged
 * STOCK_IN in history for manual reconciliation — never a silent partial.
 *
 * Returns true when the inventory row was restored (the movement is fully off the
 * shelf) and false when the row restore no-oped and the movement stays durable —
 * the caller uses that to decide whether releasing its PO claim is safe (release
 * only when no orphan stock remains, otherwise keep the claim to block over-receiving).
 */
async function undoStockInMovement(businessId, move) {
  const oidBiz = oid(businessId);
  const txnId = oid(move.transaction.id);
  const rowFilter = {
    businessId: oidBiz,
    productId: oid(move.transaction.productId),
    locationId: oid(move.transaction.locationId),
  };

  let restored = false;
  let failure = null;
  try {
    const res = move.createdRow
      ? await Inventory.deleteOne({ ...rowFilter, quantity: move.newQuantity, reservedQuantity: 0 })
      : await Inventory.updateOne(
          { ...rowFilter, quantity: move.newQuantity },
          { $set: { quantity: move.previousQuantity } }
        );
    restored = (res.deletedCount ?? res.modifiedCount) === 1;
  } catch (err) {
    failure = err.message;
  }
  if (!restored) {
    console.error(
      `[purchase-orders] receive undo: txn ${String(txnId)} not undone (${failure ?? 'row moved on — keeping the durable movement'})`
    );
    return false;
  }

  try {
    await InventoryTransaction.deleteOne({ _id: txnId, businessId: oidBiz });
  } catch (err) {
    console.error(`[purchase-orders] receive undo: transaction delete failed for txn ${String(txnId)}:`, err.message);
  }
  try {
    await AuditLog.deleteOne({
      businessId: oidBiz,
      action: AUDIT_ACTIONS.INVENTORY_STOCK_IN,
      'metadata.inventoryTransactionId': move.transaction.id,
    });
  } catch (err) {
    console.error(`[purchase-orders] receive undo: audit delete failed for txn ${String(txnId)}:`, err.message);
  }
  return true;
}

/**
 * Claim-first receive operations (Phase 13C redesign). Each is ONE single-document
 * atomic write; the redesign reserves the PO remaining quantity BEFORE any
 * inventory write, so a concurrent losing receive never calls stockIn and can
 * never leave a surviving orphan STOCK_IN.
 *
 * Guard rule (Phase 13C lesson, retained): the no-over-receive bound is enforced
 * in the DOCUMENT filter via $elemMatch — arrayFilters alone only suppress the
 * positional $inc when a bound is exceeded, they do NOT fail the update.
 */

/**
 * Op1 CLAIM — atomically reserve `quantity` of a line's remaining on the PO and
 * register this request's claim in one write. The claim _id is generated by the
 * caller up front so every compensation is a targeted $pull by that exact id.
 * Returns the updated doc, or null when the remaining was already consumed by a
 * concurrent claim (or the PO left OPEN, e.g. a racing CANCEL) — the caller then
 * must NOT move stock.
 */
async function claimRemaining({ poId, oidBiz, productId, quantity, remainingBound, userId, claimId }) {
  return PurchaseOrder.findOneAndUpdate(
    {
      _id: poId,
      businessId: oidBiz,
      status: 'OPEN',
      items: { $elemMatch: { productId, quantityCommitted: { $lte: remainingBound } } },
    },
    {
      $inc: { 'items.$[l].quantityCommitted': quantity },
      $push: {
        claims: {
          _id: claimId,
          productId,
          quantity,
          createdBy: oid(userId),
          createdAt: new Date(),
        },
      },
    },
    {
      arrayFilters: [{ 'l.productId': productId, 'l.quantityCommitted': { $lte: remainingBound } }],
      returnDocument: 'after',
    }
  );
}

/**
 * Op3 FINALIZE — turn a claim into a durable receipt in ONE atomic write: advance
 * the line's quantityReceived, remove OUR claim and record the embedded receipt
 * (which references the stock-in's exact inventory transaction). quantityCommitted
 * is unchanged — the reserved quantity simply moves from "outstanding claim" to
 * "received". Guarded on status OPEN + our own claimId, so it can only ever
 * finalize our own reservation and only while the PO is still open. Returns the
 * updated doc, or null when a concurrent CANCEL defeated it (the only status that
 * can, see receive()).
 */
async function finalizeClaim({ poId, oidBiz, productId, quantity, claimId, receipt }) {
  return PurchaseOrder.findOneAndUpdate(
    {
      _id: poId,
      businessId: oidBiz,
      status: 'OPEN',
      claims: { $elemMatch: { _id: claimId } },
    },
    {
      $inc: { 'items.$[l].quantityReceived': quantity },
      $pull: { claims: { _id: claimId } },
      $push: { receipts: receipt },
    },
    {
      arrayFilters: [{ 'l.productId': productId }],
      returnDocument: 'after',
    }
  );
}

/**
 * Op4 RELEASE — targeted, idempotent compensation that returns an un-finalized
 * claim's reservation: removes OUR claim and restores the line's
 * quantityCommitted. Matches ONLY claimId (never another request's claim) and has
 * no status guard (it must also work on a PO a concurrent CANCEL just closed).
 * modifiedCount 1 = released; 0 = already gone (a finalize already pulled it, or a
 * double release) — a safe no-op either way.
 */
async function releaseClaim({ poId, oidBiz, productId, quantity, claimId }) {
  return PurchaseOrder.updateOne(
    {
      _id: poId,
      businessId: oidBiz,
      claims: { $elemMatch: { _id: claimId } },
    },
    {
      $pull: { claims: { _id: claimId } },
      $inc: { 'items.$[l].quantityCommitted': -quantity },
    },
    {
      arrayFilters: [{ 'l.productId': productId }],
    }
  );
}

/**
 * Receive stock into the ledger against an OPEN purchase order (Phase 13C,
 * claim-first).
 *
 * Claim-first per line, so a concurrent losing receive never moves stock: each
 * line (1) CLAIMs the remaining quantity on the PO atomically BEFORE any inventory
 * write, (2) stock-ins — the authoritative, atomic, self-compensating movement
 * (row + its InventoryTransaction + its INVENTORY_STOCK_IN audit; reason 'PO
 * receipt', reference = the PO number) — then (3) FINALIZEs: advances
 * quantityReceived, drops the claim and records the embedded receipt in ONE
 * atomic document update. A lost claim (concurrent same-line consume, or a racing
 * CANCEL) rejects the line with 409 RECEIVE_CONFLICT and zero movement — the
 * loser never calls stockIn, so no orphan STOCK_IN can survive a failed claim.
 * Compensation: a stock-in that fails after its claim is fully released (Op4); a
 * finalize that returns null (concurrent CANCEL) precisely undoes the movement
 * and releases only if the row was restored; a finalize that throws is ambiguous
 * and is never compensated. Earlier committed lines of a mid-batch conflict stay
 * durable and are reported as a 409 RECEIVE_CONFLICT `applied` list — never a
 * silent partial. When every line is complete the PO auto-flips OPEN -> RECEIVED.
 * Stock always lands at the PO's own location (the validator accepts no
 * locationId); every write is scoped to the server-derived businessId. A crash
 * mid-receive can leave a visible ghost claim (see detailPublic pendingClaims),
 * recoverable by cancel + re-create.
 */
async function receive(businessId, userId, id, { lines, reference }) {
  const po = await fetchPo(businessId, id);
  if (po.status === 'DRAFT') throw new ApiError(409, 'Issue the purchase order before receiving it', 'PO_NOT_ISSUED');
  if (po.status === 'RECEIVED') throw new ApiError(409, 'This purchase order has already been received', 'PO_ALREADY_RECEIVED');
  if (po.status === 'CANCELED') throw new ApiError(409, 'A canceled purchase order cannot be received', 'PO_CANCELED');

  // Validate the whole batch against ONE fresh snapshot before anything moves:
  // every line must be an item on this PO and fit inside its remaining quantity.
  const byProduct = new Map();
  for (const item of po.items) byProduct.set(String(item.productId).toLowerCase(), item);

  const plan = [];
  for (const line of lines) {
    const item = byProduct.get(String(line.productId).toLowerCase());
    if (!item) {
      throw new ApiError(409, 'This product is not on this purchase order', 'PO_LINE_NOT_FOUND');
    }
    // Remaining is measured against quantityCommitted (received + in-flight claims),
    // so a batch that would collide with a concurrent receive already holding a
    // claim fails up front with zero applied. At rest committed == received.
    const remaining = item.quantityOrdered - (item.quantityCommitted ?? item.quantityReceived ?? 0);
    if (line.quantity > remaining) {
      throw new ApiError(409, `Quantity exceeds the remaining ${remaining} for this product`, 'PO_REMAINING_EXCEEDED');
    }
    // Fail fast on archived products too — stockIn would reject each line, but
    // catching it up front keeps the whole batch untouched (a product archived
    // mid-flight is still caught and surfaced as a partial by the loop below).
    await inventoryService.assertOperationalProduct(businessId, line.productId);
    plan.push({ productId: String(line.productId), quantity: line.quantity, ordered: item.quantityOrdered });
  }

  const oidBiz = oid(businessId);
  const poId = oid(id);
  const receivingAt = po.locationId && po.locationId._id ? oid(po.locationId._id) : oid(po.locationId);
  const applied = [];

  // Abort the batch with an explicit partial result. Lines already applied stay
  // durable and recorded on the PO; the client retries only the remainder.
  const throwPartial = async () => {
    if (applied.length > 0) {
      await recordPoAudit(businessId, userId, AUDIT_ACTIONS.PURCHASE_ORDER_RECEIVED, poId, {
        number: po.number,
        status: 'OPEN',
        partial: true,
        reference: reference || undefined,
        receivedLines: applied.map((a) => ({
          productId: a.productId,
          quantity: a.quantity,
          inventoryTransactionId: a.inventoryTransactionId,
        })),
      });
    }
    const err = new ApiError(
      409,
      'Only part of this receive could be applied; refresh and retry the remaining lines',
      'RECEIVE_CONFLICT'
    );
    err.applied = applied;
    throw err;
  };

  for (const step of plan) {
    const productId = oid(step.productId);
    const claimId = new ObjectId();
    // The remaining bound is a constant while OPEN (quantityOrdered never
    // changes), so Op1 enforces it in the DOCUMENT filter via $elemMatch.
    const remainingBound = step.ordered - step.quantity;

    // (a) Op1 CLAIM — atomically reserve the remaining BEFORE any inventory
    // write and register this request's claim in the same update. A null result
    // means a concurrent claim already consumed the remaining (or the PO left
    // OPEN, e.g. a racing CANCEL): we do NOT call stock-in and this line is
    // rejected with zero movement — a rejected receive can never create an orphan
    // STOCK_IN (the movement-first residual this redesign removes).
    let claimed;
    try {
      claimed = await claimRemaining({ poId, oidBiz, productId, quantity: step.quantity, remainingBound, userId, claimId });
    } catch (err) {
      // Ambiguous whether the claim inserted. Release by id (a no-op if it did
      // not) so a reservation that never moved stock is never leaked, then
      // surface like any other pre-movement failure.
      try {
        await releaseClaim({ poId, oidBiz, productId, quantity: step.quantity, claimId });
      } catch (releaseErr) {
        console.error(
          `[purchase-orders] receive: could not release claim ${String(claimId)} after a failed claim: ${releaseErr.message} — PO may hold a ghost claim`
        );
      }
      if (applied.length === 0) throw err;
      await throwPartial();
    }
    if (!claimed) {
      await throwPartial();
    }

    // (b) Op2 stock-in — the authoritative, atomic, self-compensating movement
    // (row + its InventoryTransaction + its INVENTORY_STOCK_IN audit), only after
    // the claim won. A durable-record failure restores its own row and rejects.
    let move;
    try {
      move = await inventoryService.stockIn(businessId, userId, {
        productId: step.productId,
        locationId: receivingAt,
        quantity: step.quantity,
        reason: PO_RECEIVE_REASON,
        reference: po.number,
      });
    } catch (err) {
      // stockIn already restored its own row before rejecting, so no movement
      // survived — releasing our claim is safe.
      try {
        await releaseClaim({ poId, oidBiz, productId, quantity: step.quantity, claimId });
      } catch (releaseErr) {
        console.error(
          `[purchase-orders] receive: could not release claim ${String(claimId)} after a failed stock-in: ${releaseErr.message} — PO may hold a ghost claim`
        );
      }
      if (applied.length === 0) throw err;
      await throwPartial();
    }

    // (c) Op3 FINALIZE — movement -> durable receipt in ONE atomic write guarded
    // on status OPEN + OUR claimId: advance quantityReceived, drop the claim and
    // record the embedded receipt together. quantityCommitted is unchanged (the
    // reservation moves from outstanding to received).
    let finalized;
    try {
      finalized = await finalizeClaim({
        poId,
        oidBiz,
        productId,
        quantity: step.quantity,
        claimId,
        receipt: {
          receivedAt: new Date(),
          userId: oid(userId),
          reference: reference || '',
          lines: [
            {
              productId,
              quantity: step.quantity,
              inventoryTransactionId: oid(move.transaction.id),
              previousQuantity: move.previousQuantity,
              newQuantity: move.newQuantity,
            },
          ],
        },
      });
    } catch (err) {
      // Ambiguous — the finalize may or may not have applied (a receipt may now
      // reference this movement). Never compensate a possibly-finalized receipt
      // (that would delete a transaction a receipt references). Earlier applied
      // lines stay durable; the client refetches the PO to see the true state.
      console.error(
        `[purchase-orders] receive: finalize threw for claim ${String(claimId)} — leaving the movement uncompensated (ambiguous; may be receipted). txn ${move ? String(move.transaction.id) : 'unknown'}: ${err.message}`
      );
      throw err;
    }
    if (!finalized) {
      // Only a concurrent CANCEL can defeat a finalize (a line with an
      // outstanding claim cannot auto-flip to RECEIVED by another request). Our
      // movement is durable but the PO will not record it: precisely undo it, and
      // release the claim ONLY if the row was actually restored. If the undo
      // no-ops (H4 — a concurrent movement built on the row) we KEEP the claim so
      // the remaining stays blocked and nothing can over-receive on top of the
      // durable orphan; the on-hand is still truthful.
      const restored = await undoStockInMovement(businessId, move);
      if (restored) {
        try {
          await releaseClaim({ poId, oidBiz, productId, quantity: step.quantity, claimId });
        } catch (releaseErr) {
          console.error(
            `[purchase-orders] receive: could not release claim ${String(claimId)} after a precise undo: ${releaseErr.message}`
          );
        }
      } else {
        console.error(
          `[purchase-orders] receive: finalize lost for claim ${String(claimId)} and its movement could not be undone (txn ${String(move.transaction.id)}) — KEEPING the claim so the durable orphan cannot be over-received`
        );
      }
      await throwPartial();
    }

    applied.push({
      productId: step.productId,
      quantity: step.quantity,
      previousQuantity: move.previousQuantity,
      newQuantity: move.newQuantity,
      inventoryTransactionId: String(move.transaction.id),
    });
  }

  // Whole batch landed. If every line is now complete, flip OPEN -> RECEIVED
  // (guarded and idempotent; a concurrent winner or a racing cancel is left
  // untouched — the fresh detail in the response shows the true state).
  const fresh = await PurchaseOrder.findOne({ _id: poId, businessId: oidBiz }).lean();
  const allReceived = fresh.items.every((item) => (item.quantityReceived || 0) >= item.quantityOrdered);
  if (allReceived) {
    await PurchaseOrder.findOneAndUpdate(
      { _id: poId, businessId: oidBiz, status: 'OPEN' },
      { $set: { status: 'RECEIVED' } }
    );
  }

  await recordPoAudit(businessId, userId, AUDIT_ACTIONS.PURCHASE_ORDER_RECEIVED, poId, {
    number: po.number,
    status: allReceived ? 'RECEIVED' : 'OPEN',
    reference: reference || undefined,
    receivedLines: applied.map((a) => ({
      productId: a.productId,
      quantity: a.quantity,
      inventoryTransactionId: a.inventoryTransactionId,
    })),
  });

  return { allReceived, applied, po: detailPublic(await fetchPo(businessId, id)) };
}

export const purchaseOrderService = {
  create,
  list,
  get,
  update,
  issue,
  cancel,
  receive,
};

// Claim/finalize/release primitives exported for the DB-backed test suite
// (phase13-receiving) so release/finalize-by-claimId exactness and idempotence
// can be exercised deterministically against seeded claims. Not part of the
// service object consumed by the controllers.
export { claimRemaining, finalizeClaim, releaseClaim };

export default purchaseOrderService;
