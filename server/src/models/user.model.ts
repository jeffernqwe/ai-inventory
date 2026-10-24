import mongoose from 'mongoose';

const { Schema } = mongoose;

const userRoles = ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'];
// DELETED (account deletion) is a TOMBSTONE, not a disabled account: the row is
// kept only so that audit rows, transactions and a former USER entityId still
// resolve, and every identifying field is overwritten or unset when it is written.
// A DELETED user can never authenticate again — `status !== 'ACTIVE'` is already
// refused on both the password path and the Firebase exchange — and it cannot be
// re-activated, because the status is write-once by design.
const userStatuses = ['ACTIVE', 'DISABLED', 'DELETED'];

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
    // Phase 32B: the Firebase ↔ MongoDB identity mapping. Absolutely unique where
    // present, and absent on every pre-Firebase account.
    //
    // `sparse: true` is REQUIRED, not decoration. A plain unique index treats a
    // missing value as null, so the FIRST user without a firebaseUid stores null
    // and the SECOND collides with it — a duplicate-key error on a record that has
    // nothing to do with Firebase, breaking the legacy registration path outright.
    // Sparse omits such documents from the index entirely, so any number of
    // unmigrated users coexist.
    //
    // `unique: true` is what declares the index; a separate `index: true` would be
    // redundant and Mongoose would warn about it. The value is written only from a
    // VERIFIED token payload (services/firebase/tokenVerifier.ts) — never from a
    // request body — which is what makes it trustworthy as a join key.
    firebaseUid: {
      type: String,
      unique: true,
      sparse: true,
    },
    // Phase 32B: mirrors the ID token's `email_verified` claim.
    //
    // Persisted because requireAuth runs on OUR application JWT and never sees a
    // Firebase token, so any Firebase claim that must ever be enforceable per
    // request has to live here — the same reason role and status do. Persisting it
    // does NOT enforce it: in Phase 32 nothing reads this field to make a
    // decision. It is written now so a later, separately-approved phase can read
    // it without a second migration.
    emailVerified: {
      type: Boolean,
      default: false,
    },
    passwordHash: {
      type: String,
      // Phase 32B: relaxed from required to optional. A Firebase-native account
      // has no password held by this server at all, and requiring one would force
      // a meaningless placeholder value into exactly the field a reader would
      // trust.
      //
      // The field itself is NOT removed and the legacy path is NOT weakened:
      // POST /api/auth/login still reads it, bcrypt still verifies it, and
      // registerBusinessOwner still writes it. It remains the rollback path for
      // every account that existed before Firebase.
      required: false,
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
    // Account deletion: the instant the row became a tombstone. Only ever set by
    // `accountDeletion.service.ts`, and only together with `status: 'DELETED'`. A
    // null value means the row has never been deleted, so no migration is needed.
    deletedAt: {
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
