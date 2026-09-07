import mongoose from 'mongoose';

const { Schema } = mongoose;

const businessStatuses = ['ACTIVE', 'SUSPENDED', 'ARCHIVED'];

const businessSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Business name is required'],
      trim: true,
    },
    status: {
      type: String,
      enum: businessStatuses,
      default: 'ACTIVE',
    },
  },
  { collection: 'businesses', timestamps: true }
);

businessSchema.index({ status: 1 });

const Business = mongoose.model('Business', businessSchema);

export default Business;
