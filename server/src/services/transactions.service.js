import mongoose from 'mongoose';

import InventoryTransaction from '../models/inventoryTransaction.model.js';
import { transactionPublic } from './inventory.service.js';

const { ObjectId } = mongoose.Types;
const oid = (id) => new ObjectId(id);

export const TRANSACTION_TYPES = Object.freeze(['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'TRANSFER']);

function ref(obj) {
  return obj && obj._id ? { id: String(obj._id), name: obj.name } : null;
}

/** Transaction history item: transaction fields plus product/location names. */
export function historyItemPublic(item) {
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
  async list(businessId, { productId, locationId, type, from, to, skip, limit }) {
    const bizOid = oid(businessId);
    const match = { businessId: bizOid };
    if (productId) match.productId = oid(productId);
    if (locationId) match.locationId = oid(locationId);
    if (type) match.type = type;

    const created = {};
    if (from) created.$gte = new Date(from);
    if (to) created.$lte = new Date(to);
    if (created.$gte || created.$lte) match.createdAt = created;

    const pipeline = [
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
