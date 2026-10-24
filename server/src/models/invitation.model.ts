import mongoose from 'mongoose';

import { INVITABLE_ROLES, INVITATION_COLLECTION } from '../constants/invitations.ts';

const { Schema } = mongoose;

/**
 * Invitation-based onboarding — the pending invitation.
 *
 * WHAT THIS ROW IS. The server's record that a particular business has asked a
 * particular address to join, with a particular role, until a particular moment. It is
 * the ONLY thing the emailed link resolves to; the link is not an account and grants no
 * session (see constants/invitations.ts for why that is safe).
 *
 * THE TOKEN IS NOT STORED, ONLY ITS DIGEST. `tokenHash` holds the SHA-256 hex of the
 * 32-byte random token. A copy of this collection cannot be turned back into working
 * invitation links, and a database reader cannot join a business by reading it. A plain
 * SHA-256 is enough here, unlike the reset flows' keyed HMACs: the input is 256 bits of
 * CSPRNG output rather than a six-digit code, so there is no guessing space to defend
 * and no second environment secret to manage.
 *
 * ONE PENDING INVITATION PER ADDRESS PER BUSINESS, enforced by a partial unique index
 * rather than by a check-then-write in the service. Re-inviting somebody replaces the
 * pending row (or revokes it and inserts), and two admins pressing the button at once
 * cannot leave two live links for one address.
 *
 * EXPIRED ROWS ARE REMOVED BY A TTL INDEX rather than kept forever. The audit trail
 * already records that an invitation was sent, accepted or revoked; retaining an expired
 * token digest in a second place only lengthens the shadow a leaked backup casts.
 */
const invitationSchema = new Schema(
  {
    // The tenant the invitation belongs to. Taken from the authenticated actor, never
    // from a request body — the same rule every business-owned resource follows.
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: [true, 'businessId is required'],
      index: true,
    },
    // The invited address, normalized (lowercased, trimmed) by the service before the
    // write. This is the value a verified Firebase identity must match.
    email: {
      type: String,
      required: [true, 'email is required'],
      trim: true,
      lowercase: true,
      maxlength: 254,
    },
    // What the person becomes on acceptance. OWNER is not representable: the enum is the
    // same frozen list the validator uses, so a hand-crafted body cannot widen it.
    role: {
      type: String,
      required: [true, 'role is required'],
      enum: {
        values: [...INVITABLE_ROLES],
        message: 'role must be one of ADMIN, MANAGER, STAFF',
      },
    },
    // SHA-256 of the emailed token. Unique because one token names one invitation.
    tokenHash: {
      type: String,
      required: [true, 'tokenHash is required'],
      unique: true,
      trim: true,
      select: false,
    },
    // Who sent it. Kept for the audit viewer and for the mail ("X invited you"), and
    // never used as an authorization input.
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'invitedBy is required'],
    },
    status: {
      type: String,
      required: true,
      enum: ['PENDING', 'ACCEPTED', 'REVOKED'],
      default: 'PENDING',
      index: true,
    },
    // When the link stops working. Every predicate tests this itself as well as relying
    // on the TTL sweep, because the sweep is eventual and a delayed sweep must never
    // widen a window.
    expiresAt: {
      type: Date,
      required: [true, 'expiresAt is required'],
    },
    // The account created by the acceptance. Null until then, and never unset.
    acceptedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
  },
  { collection: INVITATION_COLLECTION, timestamps: true }
);

// The one-live-invitation-per-address rule. Partial so ACCEPTED and REVOKED rows — which
// are history, not standing grants — never block a fresh invitation to the same address.
invitationSchema.index(
  { businessId: 1, email: 1 },
  { unique: true, partialFilterExpression: { status: 'PENDING' } }
);

// The list the admin screens read: this business's live invitations, newest first.
invitationSchema.index({ businessId: 1, status: 1, createdAt: -1 });

// Remove a row at its own expiry. Eventual, like the challenge collections', which is why
// no predicate depends on the sweep having run.
invitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Invitation = mongoose.model('Invitation', invitationSchema);

export default Invitation;
