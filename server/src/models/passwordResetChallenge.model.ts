import mongoose from 'mongoose';

import { PASSWORD_RESET_CHALLENGE_COLLECTION } from '../constants/passwordResetCode.ts';

const { Schema } = mongoose;

/**
 * AUTH-06 — password-reset challenges.
 *
 * A challenge is the server's record that a six-digit reset code was minted for one account's
 * address and has not yet been spent. It is NOT a credential store and must never become one.
 *
 * WHY THIS IS A SEPARATE COLLECTION RATHER THAN A SECOND MODE ON `email_verification_challenges`.
 * That model is keyed by a required, uniquely-indexed `uid`, and AUTH-04's request and confirm
 * paths both depend on that: one row per identity, always addressable by uid. A reset challenge
 * has no uid — the caller is signed out and presents no Firebase credential — so representing it
 * there would mean a nullable `uid`, which would weaken a unique index that is currently a load-
 * bearing invariant of a shipped flow. A new collection keeps both models honest.
 *
 * KEYED BY `emailHmac`, AND THE ADDRESS ITSELF IS NOT STORED. The row holds a keyed digest of the
 * normalized address, not the address: a collection of readable "someone asked to reset this
 * account" rows would be a target list, and a digest under the reset domain label cannot be
 * reversed without the pepper.
 *
 * IT DOES HOLD `userId`, and that is a deliberate difference from the verification model. The
 * account to be written is decided ONCE, when the code is issued, by the ordinary lookup that
 * already happens to send the mail; confirming then acts on that recorded document. So the
 * submitted address can only ever address a challenge, never choose an account.
 *
 * ONE ROW PER ADDRESS: a new request supersedes the previous challenge in place rather than
 * accumulating rows, and uniqueness is enforced by the index rather than by a check-then-write in
 * the service, because the index is atomic and the check is not.
 */
const passwordResetChallengeSchema = new Schema(
  {
    // The keyed digest of the normalized address, under `reset-email:`. `unique: true` IS what
    // declares the index — one live challenge per address, superseded in place.
    emailHmac: {
      type: String,
      required: [true, 'emailHmac is required'],
      unique: true,
      trim: true,
    },
    // The account this code is for, resolved when the code was issued. Required, because a
    // challenge that names no account could never be acted on — and because the confirm path must
    // never re-derive it from the submitted address.
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
      index: true,
    },
    // The HMAC digest of the code, under `reset-code:`. NOT unique — the code space is 10^6, so
    // two challenges sharing a digest is expected and a unique index would reject a legitimate
    // mint. Never queried on its own, so no index either.
    codeHmac: {
      type: String,
      required: [true, 'codeHmac is required'],
      trim: true,
    },
    // The resend-cooldown anchor. Required, not nullable: a row exists only because a send was
    // requested, so there is no "never sent" state to represent.
    lastSentAt: {
      type: Date,
      required: [true, 'lastSentAt is required'],
    },
    // When the code stops working. Every predicate filters this itself as well as relying on the
    // TTL index, because the TTL sweep is eventual and a delayed sweep must never widen a window.
    expiresAt: {
      type: Date,
      required: [true, 'expiresAt is required'],
    },
    // Guesses RESERVED against this challenge. The cap lives in constants/ and is enforced by the
    // reservation predicate, not here: `findOneAndUpdate` does not run schema validators, so a
    // `max` declared here would be inert — and an inert bound reads like enforcement.
    attempts: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    // When the CODE was verified. Null means the code has not been checked yet.
    //
    // ITS PRESENCE IS ONE-WAY, and that is what makes the code non-reusable: the verify predicate
    // includes `verifiedAt: null`, so a code that has been successfully presented once can never
    // be verified again — not by the same person, and not by anyone who read the inbox later. A
    // person who loses the verified state asks for a new code, which supersedes this row.
    verifiedAt: {
      type: Date,
      default: null,
    },
    // The keyed digest of the reset AUTHORIZATION minted by a successful verification.
    //
    // Sparse and unique: one live authorization per challenge, and absent rows stay out of the
    // index entirely (a plain unique index would allow exactly one unverified challenge, because
    // every unverified row would carry the same `null`). The digest is what the second step
    // presents; the token itself is never stored.
    authorizationHmac: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    // When that authorization stops working. A dedicated field rather than a reuse of the code's
    // `expiresAt`, because the two credentials are issued at different moments and the person is
    // entitled to a full working window after they type the code correctly.
    authorizationExpiresAt: {
      type: Date,
      default: null,
    },
    // When the challenge was consumed. Null means live. Never unset, so a spent code stays spent
    // and a partially completed confirmation is never replayable.
    usedAt: {
      type: Date,
      default: null,
    },
  },
  { collection: PASSWORD_RESET_CHALLENGE_COLLECTION, timestamps: true }
);

// Remove a row at its own expiry. Eventual, like the verification collection's, which is why no
// predicate depends on the sweep having run.
passwordResetChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const PasswordResetChallenge = mongoose.model(
  'PasswordResetChallenge',
  passwordResetChallengeSchema
);

export default PasswordResetChallenge;
