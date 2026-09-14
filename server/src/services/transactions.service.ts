import mongoose from 'mongoose';
import type { PipelineStage } from 'mongoose';

import InventoryTransaction from '../models/inventoryTransaction.model.ts';
import { transactionPublic } from './inventory.service.ts';

/** The ledger filter this service builds, typed from the model itself. */
type TransactionFilter = mongoose.QueryFilter<mongoose.HydratedDocFromModel<typeof InventoryTransaction>>;

/** The filters `list` accepts, already validated by the caller. */
type HistoryFilters = {
  productId?: string;
  locationId?: string;
  type?: string;
  from?: string;
  to?: string;
  skip: number;
  limit: number;
};

const { ObjectId } = mongoose.Types;
const oid = (id: string | mongoose.Types.ObjectId) => new ObjectId(id);

export const TRANSACTION_TYPES = Object.freeze(['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'TRANSFER']);

/** The `$lookup`-joined product/location document, read only for `_id`/`name`. */
type RefSource = { _id?: unknown; name?: unknown };

function ref(obj: RefSource | null | undefined) {
  return obj && obj._id ? { id: String(obj._id), name: obj.name } : null;
}

/**
 * A ledger row after the `$lookup` stages, so it carries the joined product and
 * location alongside the fields `transactionPublic` reads.
 */
type HistoryRow = Parameters<typeof transactionPublic>[0] & {
  product?: RefSource | null;
  location?: RefSource | null;
};

/** Transaction history item: transaction fields plus product/location names. */
export function historyItemPublic(item: HistoryRow) {
  return {
    ...transactionPublic(item),
    product: ref(item.product),
    location: ref(item.location),
  };
}

/**
 * Read-only inventory transaction history (the "Inventory History" screen).
 * Always newest-first; optionally filtered by product, location, type, and a
 * createdAt range. Every query is scoped by the server-derived businessId.
 */
export const transactionsService = {
  async list(businessId: string, { productId, locationId, type, from, to, skip, limit }: HistoryFilters) {
    const bizOid = oid(businessId);
    const match: TransactionFilter = { businessId: bizOid };
    if (productId) match.productId = oid(productId);
    if (locationId) match.locationId = oid(locationId);
    if (type) match.type = type;

    const created: { $gte?: Date; $lte?: Date } = {};
    if (from) created.$gte = new Date(from);
    if (to) created.$lte = new Date(to);
    if (created.$gte || created.$lte) match.createdAt = created;

    const pipeline: PipelineStage[] = [
      { $match: match },
      { $sort: { createdAt: -1, _id: -1 } },
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
      {
        $lookup: {
          from: 'locations',
          let: { lid: '$locationId' },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$businessId', bizOid] }, { $eq: ['$_id', '$$lid'] }] } } },
          ],
          as: 'location',
        },
      },
      {
        $addFields: {
          product: { $arrayElemAt: ['$product', 0] },
          location: { $arrayElemAt: ['$location', 0] },
        },
      },
      {
        $facet: {
          metadata: [{ $count: 'total' }],
          data: [{ $skip: skip }, { $limit: limit }],
        },
      },
    ];

    const [result] = await InventoryTransaction.aggregate(pipeline);
    const items = (result?.data ?? []).map(historyItemPublic);
    const total = result?.metadata?.[0]?.total ?? 0;
    return { items, total };
  },
};

export default transactionsService;
