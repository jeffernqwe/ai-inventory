import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Phase 26B-2 — password-reset tokens.
 *
 * A reset token is NOT a session credential and must never become one. It is
 * never accepted by `requireAuth`, it names no `jti`, and it authorizes exactly
 * one action: replacing one user's password, once. A `Session` row is a
 * revocable grant of access; this row is a single-use errand. Keeping them in
 * separate collections with separate fields is what stops the two from being
 * confused, so nothing here may grow session-like fields later.
 *
 * The row stores only the SHA-256 HASH of the token. The raw token exists only
 * in the email that carries it — it is never persisted, never logged, never put
 * in audit metadata and never returned by any API. A stolen database therefore
 * yields no usable link, exactly as a stolen `users` table yields no password.
 *
 * The row deliberately carries no `businessId`, no `email`, no `role`, no
 * `status` and no request metadata (IP, user-agent). `userId` is the only
 * identity it holds, it is never accepted from a client, and it exists so the
 * token can be scoped to its owner — the caller who needs the business or the
 * email has the user document already.
 */
const passwordResetTokenSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
    },
    // The SHA-256 digest (hex) of the raw token. Unique, so a hash collision or
    // a duplicated insert is rejected by the index rather than silently
    // producing two links that resolve to the same row. 256 bits of input
    // entropy makes a collision impossible in practice; this is belt-and-braces.
    tokenHash: {
      type: String,
      required: [true, 'tokenHash is required'],
      unique: true,
      trim: true,
    },
    // When the link stops working. Set by the service from its own lifetime
    // constant, which is also the value printed in the email, so the two can
    // never disagree.
    expiresAt: {
      type: Date,
      required: [true, 'expiresAt is required'],
    },
    // The moment the token was CLAIMED, stamped by a single conditional update.
    // Null means "still unused". It is never unset: once a token has been
    // claimed it stays consumed even if the password change that followed
    // failed, so a half-completed reset is never replayable.
    usedAt: {
      type: Date,
      default: null,
    },
  },
  { collection: 'password_reset_tokens', timestamps: true }
);

// The one-active-token lookup: this user's tokens that are still unused.
passwordResetTokenSchema.index({ userId: 1, usedAt: 1 });

// Once the link can no longer be used, the row is garbage. expireAfterSeconds: 0
// removes it at expiresAt (MongoDB's TTL monitor sweeps roughly every 60s, so
// deletion is eventual — the claim query filters on expiresAt anyway and never
// depends on the sweep having run).
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const PasswordResetToken = mongoose.model('PasswordResetToken', passwordResetTokenSchema);

export default PasswordResetToken;
