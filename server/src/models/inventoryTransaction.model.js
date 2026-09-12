import mongoose from 'mongoose';

const { Schema } = mongoose;

// Stock movement types. TRANSFER (Phase 19) moves one product between two
// locations and is recorded as one row per leg, correlated by `reference`.
const transactionTypes = ['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'TRANSFER'];

const inventoryTransactionSchema = new Schema(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: [true, 'businessId is required'],
      index: true,
    },
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'productId is required'],
    },
    locationId: {
      type: Schema.Types.ObjectId,
      ref: 'Location',
      required: [true, 'locationId is required'],
    },
    type: {
      type: String,
      enum: transactionTypes,
      required: [true, 'Transaction type is required'],
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'Transaction quantity must be a positive number'],
    },
    previousQuantity: {
      type: Number,
      required: true,
      min: [0, 'previousQuantity cannot be negative'],
    },
    newQuantity: {
      type: Number,
      required: true,
      min: [0, 'newQuantity cannot be negative'],
    },
    reason: {
      type: String,
      trim: true,
    },
    reference: {
      type: String,
      trim: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
    },
  },
  { collection: 'inventory_transactions', timestamps: true }
);

inventoryTransactionSchema.index({ businessId: 1, productId: 1, locationId: 1 });
inventoryTransactionSchema.index({ businessId: 1, productId: 1 });
inventoryTransactionSchema.index({ businessId: 1, locationId: 1 });
inventoryTransactionSchema.index({ businessId: 1, createdAt: 1 });
// Phase 20C (H-1): inventory history sorts `{ createdAt: -1, _id: -1 }` in the
// aggregation pipeline (transactions.service.js). As with audit logs, the plain
// `{ businessId: 1, createdAt: 1 }` index cannot order the `_id` tiebreaker, so the
// $sort blocked. This shape matches the pipeline's sort exactly.
inventoryTransactionSchema.index({ businessId: 1, createdAt: -1, _id: -1 });

const InventoryTransaction = mongoose.model(
  'InventoryTransaction',
  inventoryTransactionSchema
);

export default InventoryTransaction;
