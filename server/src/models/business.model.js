import mongoose from 'mongoose';
import { DEFAULT_PLAN_CODE } from '../constants/plans.js';

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
    // Phase 10 — Commercialization Foundation. Which catalog plan (see
    // src/constants/plans.js) this business is on. Defaults to the unlimited V1
    // baseline; a future billing flow assigns paid-tier codes. Deliberately no
    // enum — the field must stay open to plan codes defined after this phase.
    planCode: {
      type: String,
      default: DEFAULT_PLAN_CODE,
      trim: true,
    },
  },
  { collection: 'businesses', timestamps: true }
);

businessSchema.index({ status: 1 });
businessSchema.index({ planCode: 1 });

const Business = mongoose.model('Business', businessSchema);

export default Business;
