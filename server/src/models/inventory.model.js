import mongoose from 'mongoose';

const { Schema } = mongoose;

const inventorySchema = new Schema(
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
    quantity: {
      type: Number,
      required: true,
      min: [0, 'Quantity cannot be negative'],
      default: 0,
    },
    // V1 keeps reservations at 0; the field preserves the architecture for later.
    reservedQuantity: {
      type: Number,
      required: true,
      min: [0, 'reservedQuantity cannot be negative'],
      default: 0,
    },
  },
  { collection: 'inventory', timestamps: true }
);

// availableQuantity = quantity - reservedQuantity (derived, never stored).
// Business logic (Phase 04) must prevent availableQuantity < 0 on writes.
inventorySchema.virtual('availableQuantity').get(function availableQuantity() {
  return (this.quantity || 0) - (this.reservedQuantity || 0);
});

inventorySchema.set('toJSON', { virtuals: true });

// One inventory record per product + location within a business.
inventorySchema.index(
  { businessId: 1, productId: 1, locationId: 1 },
  { unique: true }
);
inventorySchema.index({ businessId: 1, productId: 1 });
inventorySchema.index({ businessId: 1, locationId: 1 });

const Inventory = mongoose.model('Inventory', inventorySchema);

export default Inventory;
