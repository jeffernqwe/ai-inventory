import mongoose from 'mongoose';

const { Schema } = mongoose;

const productStatuses = ['ACTIVE', 'ARCHIVED'];

const productSchema = new Schema(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: [true, 'businessId is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
    },
    sku: {
      type: String,
      trim: true,
    },
    barcode: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
    },
    costPrice: {
      type: Number,
      min: [0, 'costPrice cannot be negative'],
      default: 0,
    },
    sellingPrice: {
      type: Number,
      min: [0, 'sellingPrice cannot be negative'],
      default: 0,
    },
    unit: {
      type: String,
      trim: true,
    },
    minimumStock: {
      type: Number,
      min: [0, 'minimumStock cannot be negative'],
      default: 0,
    },
    imageUrl: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: productStatuses,
      default: 'ACTIVE',
    },
  },
  { collection: 'products', timestamps: true }
);

// SKU and barcode must be unique within a business — but only among products
// that actually define them. A plain compound *sparse* unique index cannot give
// that here: any document already carries the prefix field (businessId), and
// MongoDB still indexes such a document when the trailing field (sku) is
// missing, treating it as null. Two SKU-less products in the same business
// would then collide on (businessId, null). A partial index filters on the
// value being a real string, so SKU-less / undefined products stay out of the
// uniqueness check entirely.
productSchema.index(
  { businessId: 1, sku: 1 },
  { unique: true, partialFilterExpression: { sku: { $type: 'string' } } }
);
productSchema.index(
  { businessId: 1, barcode: 1 },
  { unique: true, partialFilterExpression: { barcode: { $type: 'string' } } }
);
productSchema.index({ businessId: 1, name: 1 });
productSchema.index({ businessId: 1, categoryId: 1 });
productSchema.index({ businessId: 1, status: 1 });

const Product = mongoose.model('Product', productSchema);

export default Product;
