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
    // Phase 15: stamped when the user changes their own password. requireAuth
    // compares a token's issued-at second against this and rejects tokens
    // minted before it (SESSION_INVALIDATED). null = never changed → no
    // invalidation (safe default for every pre-existing user, no migration).
    passwordChangedAt: {
      type: Date,
      default: null,
    },
  },
  { collection: 'users', timestamps: true }
);

userSchema.index({ businessId: 1, role: 1 });
userSchema.index({ businessId: 1, status: 1 });

// Phase 20G: the user list is read OLDEST-first with a deterministic tiebreaker —
// `sort({ createdAt: 1, _id: 1 })` over `{ businessId }` plus optional status/q
// filters (users.service.js list). This is the one ascending sort among the
// Phase 20G candidates, and the index is declared descending anyway: MongoDB can
// walk a compound index backwards, and because BOTH sort keys invert together a
// full-reverse scan (direction: "backward") supplies this order with no blocking
// sort — so one key shape covers the ascending and descending lists alike. A
// mixed-direction sort could not be served this way. `_id` is last because it is
// the tiebreaker in every sort clause. Every index above is kept unchanged.
userSchema.index({ businessId: 1, createdAt: -1, _id: -1 });

const User = mongoose.model('User', userSchema);

export default User;
