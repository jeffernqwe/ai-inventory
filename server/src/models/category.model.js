import mongoose from 'mongoose';

const { Schema } = mongoose;

const categoryStatuses = ['ACTIVE', 'ARCHIVED'];

const categorySchema = new Schema(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: [true, 'businessId is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Category name is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: categoryStatuses,
      default: 'ACTIVE',
    },
  },
  { collection: 'categories', timestamps: true }
);

categorySchema.index({ businessId: 1, name: 1 });
categorySchema.index({ businessId: 1, status: 1 });

const Category = mongoose.model('Category', categorySchema);

export default Category;
