import mongoose from 'mongoose';

const { Schema } = mongoose;

// V1 transaction types. TRANSFER is reserved for a future version.
const transactionTypes = ['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT'];

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

const InventoryTransaction = mongoose.model(
  'InventoryTransaction',
  inventoryTransactionSchema
);

export default InventoryTransaction;
