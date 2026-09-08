import mongoose from 'mongoose';

const { Schema } = mongoose;

const supplierStatuses = ['ACTIVE', 'ARCHIVED'];

const supplierSchema = new Schema(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: [true, 'businessId is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Supplier name is required'],
      trim: true,
    },
    contactName: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: supplierStatuses,
      default: 'ACTIVE',
    },
  },
  { collection: 'suppliers', timestamps: true }
);

supplierSchema.index({ businessId: 1, name: 1 });
supplierSchema.index({ businessId: 1, status: 1 });

const Supplier = mongoose.model('Supplier', supplierSchema);

export default Supplier;
