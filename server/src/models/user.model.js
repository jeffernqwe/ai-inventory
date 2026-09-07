import mongoose from 'mongoose';

const { Schema } = mongoose;

const userRoles = ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'];
const userStatuses = ['ACTIVE', 'DISABLED'];

const userSchema = new Schema(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: [true, 'businessId is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'User name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      // A single person identity across the platform (Phase 03 login is global).
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    passwordHash: {
      type: String,
      required: true,
      // Never return the hash in query results by default.
      select: false,
    },
    role: {
      type: String,
      enum: userRoles,
      default: 'STAFF',
    },
    status: {
      type: String,
      enum: userStatuses,
      default: 'ACTIVE',
    },
  },
  { collection: 'users', timestamps: true }
);

userSchema.index({ businessId: 1, role: 1 });
userSchema.index({ businessId: 1, status: 1 });

const User = mongoose.model('User', userSchema);

export default User;
