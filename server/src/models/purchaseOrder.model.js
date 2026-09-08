import mongoose from 'mongoose';

const { Schema } = mongoose;

export const PURCHASE_ORDER_STATUSES = ['DRAFT', 'OPEN', 'RECEIVED', 'CANCELED'];

/**
 * One ordered product line. Snapshot productName/sku at order time so the PO
 * keeps its own record if the product is later renamed or archived. quantityReceived
 * starts at 0 and is only ever increased by receiving (Phase 13C) — never edited.
 */
const poItemSchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'productId is required'],
    },
    productName: {
      type: String,
      required: [true, 'productName is required'],
      trim: true,
    },
    sku: {
      type: String,
      trim: true,
    },
    quantityOrdered: {
      type: Number,
      required: [true, 'quantityOrdered is required'],
      min: [1, 'quantityOrdered must be at least 1'],
    },
    quantityReceived: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'quantityReceived cannot be negative'],
    },
    unitCost: {
      type: Number,
      min: [0, 'unitCost cannot be negative'],
    },
  },
  { _id: false }
);

const purchaseOrderSchema = new Schema(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: [true, 'businessId is required'],
      index: true,
    },
    number: {
      type: String,
      required: [true, 'number is required'],
      trim: true,
    },
    supplierId: {
      type: Schema.Types.ObjectId,
      ref: 'Supplier',
      required: [true, 'supplierId is required'],
    },
    locationId: {
      type: Schema.Types.ObjectId,
      ref: 'Location',
      required: [true, 'locationId is required'],
    },
    status: {
      type: String,
      enum: PURCHASE_ORDER_STATUSES,
      default: 'DRAFT',
    },
    expectedAt: {
      type: Date,
    },
    notes: {
      type: String,
      trim: true,
    },
    items: {
      type: [poItemSchema],
      default: [],
    },
  },
  { collection: 'purchase_orders', timestamps: true }
);

// PO numbers are sequential per business and never reused, so the compound
// index is plain-unique. It is the final authority under concurrency: number
// allocation computes max+1 and the create retries on a duplicate-key race.
purchaseOrderSchema.index({ businessId: 1, number: 1 }, { unique: true });
purchaseOrderSchema.index({ businessId: 1, status: 1 });
purchaseOrderSchema.index({ businessId: 1, supplierId: 1 });
purchaseOrderSchema.index({ businessId: 1, locationId: 1 });

const PurchaseOrder = mongoose.model('PurchaseOrder', purchaseOrderSchema);

export default PurchaseOrder;
