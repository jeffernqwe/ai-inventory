import mongoose from 'mongoose';

import Product from '../models/product.model.ts';
import Inventory from '../models/inventory.model.ts';
import InventoryTransaction from '../models/inventoryTransaction.model.ts';

const { ObjectId } = mongoose.Types;
const oid = (id: string) => new ObjectId(id);

const RECENT_LIMIT = 5;
// Ledger rows are not events one-to-one: a stock transfer writes TWO rows
// sharing one `reference` (SYSTEM_SPECIFICATION.md §Stock Transfer). The window
// is therefore fetched at twice the limit, so a transfer pair can never be cut
// in half by the boundary — see recentActivities().
const RECENT_WINDOW = RECENT_LIMIT * 2;

/**
 * The ledger fields the recent-activity helpers read off a document. The
 * reference fields are `unknown` rather than a declared document type because
 * Mongoose types a populated field as the raw `ObjectId` it replaced — the same
 * reason `inventory.service.ts` declares its `*Source` shapes this way.
 *
 * `quantity`, `previousQuantity` and `newQuantity` are required Numbers in the
 * schema, so they are declared `number`; `createdAt` is declared `Date` because
 * both the newest-leg pick and the final sort compare it by time value, and
 * `timestamps: true` guarantees Mongoose supplies one.
 */
type LedgerRow = {
  _id: unknown;
  type?: unknown;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  productId?: unknown;
  locationId?: unknown;
  reference?: unknown;
  createdAt: Date;
};

/** The `{ id, name }` reference shape both activity DTOs carry. */
type ReferenceDto = { id: string; name: unknown };

/** A single-row movement (stock in / stock out / adjustment), as sent to the client. */
type MovementActivity = {
  id: string;
  type: unknown;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  product: ReferenceDto | null;
  location: ReferenceDto | null;
  createdAt: Date;
};

/**
 * One transfer event as sent to the client. `type` is the literal this helper
 * always writes, and `location` is deliberately absent — see transferActivity().
 */
type TransferActivity = {
  id: string;
  type: 'TRANSFER';
  quantity: number;
  product: ReferenceDto | null;
  from: ReferenceDto | null;
  to: ReferenceDto | null;
  reference: unknown;
  createdAt: Date;
};

/**
 * `{ id, name }` reference to a populated document, or null when absent. The
 * parameter is `unknown` because a populated reference arrives as either the
 * referenced document or the bare `ObjectId` it replaced; the cast only names
 * the two fields read below, and the truthiness test is the original one.
 */
function ref(doc: unknown): ReferenceDto | null {
  const source = doc as { _id?: unknown; name?: unknown } | null | undefined;
  return source?._id ? { id: String(source._id), name: source.name } : null;
}

/** Safe DTO for a single-row movement (stock in / stock out / adjustment). */
function recentPublic(t: LedgerRow): MovementActivity {
  return {
    id: String(t._id),
    type: t.type,
    quantity: t.quantity,
    previousQuantity: t.previousQuantity,
    newQuantity: t.newQuantity,
    product: ref(t.productId),
    location: ref(t.locationId),
    createdAt: t.createdAt,
  };
}

/**
 * One logical activity for a transfer's two ledger legs. A transfer is a single
 * business event (§Stock Transfer) whose ledger keeps one immutable row per leg;
 * the dashboard reports the event, not the rows.
 *
 * Source and destination come from the signed quantity delta rather than row
 * order, so the pair is classified correctly however the legs were written. A
 * group that does not hold exactly one debited and one credited leg is not a
 * complete transfer and yields null — that is what stops a half-pair, split off
 * by the window boundary, from ever reaching the client.
 *
 * `location` is deliberately absent: a two-location event has no single
 * location. `from`/`to` say it unambiguously, and the badge carries the type.
 */
function transferActivity(legs: LedgerRow[]): TransferActivity | null {
  const source = legs.find((t) => t.newQuantity < t.previousQuantity);
  const destination = legs.find((t) => t.newQuantity > t.previousQuantity);
  if (!source || !destination) return null;
  const newest = legs.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
  return {
    id: String(source.reference ?? source._id),
    type: 'TRANSFER',
    quantity: source.quantity,
    product: ref(source.productId),
    from: ref(source.locationId),
    to: ref(destination.locationId),
    reference: source.reference,
    createdAt: newest.createdAt,
  };
}

/**
 * Recent activity as the logical events a user performed, newest first.
 *
 * Only TRANSFER rows are grouped — every other type is already one row per
 * event and is returned exactly as it always was. Incomplete groups are dropped
 * BEFORE the limit is applied, which is sound because the wider window
 * guarantees at least RECENT_LIMIT complete activities remain: 2L rows can form
 * at most L groups, so a short group implies some other group is complete.
 */
function recentActivities(rows: LedgerRow[]): (MovementActivity | TransferActivity)[] {
  const groups = new Map<string, LedgerRow[]>();
  for (const row of rows) {
    // A transfer's two legs are correlated by the shared reference; the row id
    // is the fallback so an unpaired row can never merge with another.
    const key = row.type === 'TRANSFER' ? `T:${row.reference ?? row._id}` : `R:${row._id}`;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  // A group always holds at least the row that created it, so the first element
  // is asserted rather than guarded — the same idiom as `created[0]!` in
  // `inventory.service.ts`. A runtime guard here would be a branch the original
  // never had.
  const activities: (MovementActivity | TransferActivity)[] = [];
  for (const group of groups.values()) {
    if (group[0]!.type === 'TRANSFER') {
      const activity = transferActivity(group);
      if (activity) activities.push(activity);
    } else {
      activities.push(recentPublic(group[0]!));
    }
  }

  return activities
    // The unary `+` is a type-level addition only: JavaScript's subtraction
    // already coerces each operand with ToNumber, and ToNumber on a Date IS its
    // time value, so `+b.createdAt - +a.createdAt` is the same number the
    // original `b.createdAt - a.createdAt` produced in every case. TypeScript
    // rejects `-` on two Dates outright (TS2362/TS2363) unless the operands are
    // declared numeric, so this is the narrowest way to keep the expression.
    .sort((a, b) => +b.createdAt - +a.createdAt || String(b.id).localeCompare(String(a.id)))
    .slice(0, RECENT_LIMIT);
}

/**
 * Dashboard summary (SYSTEM_SPECIFICATION.md §20). Definitions match the
 * product/inventory stock-status logic so filters and the dashboard agree
 * (§19): low stock = available <= minimumStock, out of stock = available <= 0.
 * Availability is summed across the business (no location selected on the
 * V1 dashboard). Only ACTIVE products are counted for product metrics.
 */
export const dashboardService = {
  async summary(businessId: string) {
    const bizOid = oid(businessId);
    const matchActive = { businessId: bizOid, status: 'ACTIVE' };

    const [totalProducts, qtyAgg, stockFacets, recent] = await Promise.all([
      Product.countDocuments(matchActive),
      Inventory.aggregate([
        { $match: { businessId: bizOid } },
        { $group: { _id: null, total: { $sum: '$quantity' } } },
      ]),
      Product.aggregate([
        { $match: matchActive },
        {
          $lookup: {
            from: 'inventory',
            let: { pid: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$businessId', bizOid] },
                      { $eq: ['$productId', '$$pid'] },
                    ],
                  },
                },
              },
              {
                $group: {
                  _id: null,
                  quantity: { $sum: '$quantity' },
                  reserved: { $sum: '$reservedQuantity' },
                },
              },
            ],
            as: 'inv',
          },
        },
        { $addFields: { invRow: { $arrayElemAt: ['$inv', 0] } } },
        {
          $addFields: {
            available: {
              $subtract: [
                { $ifNull: ['$invRow.quantity', 0] },
                { $ifNull: ['$invRow.reserved', 0] },
              ],
            },
          },
        },
        {
          $facet: {
            low: [
              { $match: { $expr: { $lte: ['$available', '$minimumStock'] } } },
              { $count: 'count' },
            ],
            out: [
              { $match: { $expr: { $lte: ['$available', 0] } } },
              { $count: 'count' },
            ],
          },
        },
      ]),
      InventoryTransaction.find({ businessId: bizOid })
        .populate('productId', 'name')
        .populate('locationId', 'name')
        // The `_id` tiebreaker matches History: rows written in the same
        // millisecond (a transfer's two legs) still have a stable order.
        .sort({ createdAt: -1, _id: -1 })
        .limit(RECENT_WINDOW),
    ]);

    const facet = stockFacets[0] ?? {};
    const lowStockProducts = facet.low?.[0]?.count ?? 0;
    return {
      totalProducts,
      totalInventoryQuantity: qtyAgg[0]?.total ?? 0,
      lowStockProducts,
      // Healthy = available > minimumStock. Within the ACTIVE products counted
      // above this is exactly the complement of the low-stock set (§19), so it
      // needs no extra query and can never disagree with lowStockProducts.
      inStockProducts: totalProducts - lowStockProducts,
      outOfStockProducts: facet.out?.[0]?.count ?? 0,
      recentActivity: recentActivities(recent),
    };
  },
};

export default dashboardService;
