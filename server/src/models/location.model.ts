import mongoose from 'mongoose';

const { Schema } = mongoose;

const locationStatuses = ['ACTIVE', 'ARCHIVED'];

const locationSchema = new Schema(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: [true, 'businessId is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Location name is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: locationStatuses,
      default: 'ACTIVE',
    },
  },
  { collection: 'locations', timestamps: true }
);

locationSchema.index({ businessId: 1, name: 1 });
locationSchema.index({ businessId: 1, status: 1 });

const Location = mongoose.model('Location', locationSchema);

export default Location;
