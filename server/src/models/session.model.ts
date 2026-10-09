import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Phase 26A — server-side session records.
 *
 * Before this model a JWT was the whole session: it could not be withdrawn, so
 * "sign out" was a client-side gesture and a lost device could not be cut off
 * except by changing the password (which ends EVERY session) or disabling the
 * user. A session row makes the token revocable.
 *
 * The row is keyed on the token's `jti` claim, so one token maps to exactly one
 * session. It deliberately carries NO authorization data — no role, no
 * businessId — for the same reason the token itself does not (Phase 03/24):
 * role and tenant context are reloaded from the User on every request, so a
 * stale session row can never widen what its owner may do. `userId` exists only
 * to scope the row to its owner; it is never accepted from a client.
 */
const sessionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
    },
    // The JWT `jti` claim naming this session. Unique, so a token can never
    // resolve to two rows and a reused jti is rejected by the index.
    jti: {
      type: String,
      required: [true, 'jti is required'],
      unique: true,
      trim: true,
    },
    // Client-supplied, cosmetic only. Purely a label for the session list — it
    // takes no part in any query or authorization decision, and the server
    // normalizes/caps it (see services/session.service.js normalizeDeviceLabel).
    deviceLabel: {
      type: String,
      default: 'Unknown device',
      trim: true,
    },
    // Updated opportunistically while the session is in use, so the owner can
    // recognize a session. Null means "opened but not used yet".
    lastUsedAt: {
      type: Date,
      default: null,
    },
    // Set to the moment the session was ended. Not a hard delete: a revoked row
    // is kept (until its TTL) so it cannot be silently re-created.
    revokedAt: {
      type: Date,
      default: null,
    },
    // AUTH-02: the session's own ABSOLUTE cap — 14 days from creation — and NOT
    // the JWT's `exp`. The access token is short-lived (~1 hour) and many tokens
    // may reference this one row; the row is the long-lived record. The cap is
    // set once at creation and never moved, so renewing a token can never make a
    // session immortal (see session.service.js createSessionForToken).
    expiresAt: {
      type: Date,
      required: [true, 'expiresAt is required'],
    },
  },
  { collection: 'sessions', timestamps: true }
);

// The list/liveness query: this user's sessions that are still open.
sessionSchema.index({ userId: 1, revokedAt: 1 });

// Once the session's 14-day absolute cap passes, the row is garbage.
// expireAfterSeconds: 0 removes it at expiresAt (MongoDB's TTL monitor sweeps
// roughly every 60s, so deletion is eventual — the liveness query filters on
// expiresAt anyway and never depends on the sweep having run). AUTH-02: this is
// the SESSION cap, not the token lifetime; the two are now independent, so a
// token expiring does not make its session row collectable.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Session = mongoose.model('Session', sessionSchema);

export default Session;
