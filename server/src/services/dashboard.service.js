import mongoose from 'mongoose';

import Product from '../models/product.model.js';
import Inventory from '../models/inventory.model.js';
import InventoryTransaction from '../models/inventoryTransaction.model.js';

const { ObjectId } = mongoose.Types;
const oid = (id) => new ObjectId(id);

const RECENT_LIMIT = 5;

function recentPublic(t) {
  return {
    id: String(t._id),
    type: t.type,
    quantity: t.quantity,
    previousQuantity: t.previousQuantity,
    newQuantity: t.newQuantity,
    product: t.productId?._id ? { id: String(t.productId._id), name: t.productId.name } : null,
    location: t.locationId?._id ? { id: String(t.locationId._id), name: t.locationId.name } : null,
    createdAt: t.createdAt,
  };
}

/**
 * Dashboard summary (SYSTEM_SPECIFICATION.md §20). Definitions match the
 * product/inventory stock-status logic so filters and the dashboard agree
 * (§19): low stock = available <= minimumStock, out of stock = available <= 0.
 * Availability is summed across the business (no location selected on the
 * V1 dashboard). Only ACTIVE products are counted for product metrics.
 */
export const dashboardService = {
  async summary(businessId) {
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
        .sort({ createdAt: -1 })
        .limit(RECENT_LIMIT),
    ]);

    const facet = stockFacets[0] ?? {};
    return {
      totalProducts,
      totalInventoryQuantity: qtyAgg[0]?.total ?? 0,
      lowStockProducts: facet.low?.[0]?.count ?? 0,
      outOfStockProducts: facet.out?.[0]?.count ?? 0,
      recentActivity: recent.map(recentPublic),
    };
  },
};

export default dashboardService;
