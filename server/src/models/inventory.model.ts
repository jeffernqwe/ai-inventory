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

// The inventory list reads newest-changed-first with a deterministic tiebreaker —
// `sort({ updatedAt: -1, _id: -1 })` over `{ businessId }` plus optional
// productId/locationId filters (inventoryService.listRows, which also backs the AI
// assistant's getInventory and getProductsByLocation tools). Same reasoning as the
// product catalog's Phase 20G index: every index above carries a `businessId` prefix
// and can serve the equality match, but none can SUPPLY that order, so the page sort
// was a blocking in-memory sort. It matters more here than anywhere else, because
// `listRows` now applies `$skip`/`$limit` ABOVE its product/location joins (measured
// 2026-10-13: the joins previously ran once per tenant row — 20 105 of them — and
// cost 6.3 s to fill a 25-row page). With this key the sort is index-provided, so the
// window is read straight off the index and only the page is joined. Declaring the
// sort keys after the equality key is what makes the order index-provided; `_id` is
// last because it is the tiebreaker and must share `updatedAt`'s direction. The
// optional filters stay OUT of the key, since an index led by an optional field
// cannot serve the request that omits it. `createdAt` is deliberately NOT used: the
// page follows the row's last change, and a transfer rewrites two rows in place.
// Every index above is kept unchanged.
inventorySchema.index({ businessId: 1, updatedAt: -1, _id: -1 });

const Inventory = mongoose.model('Inventory', inventorySchema);

export default Inventory;
