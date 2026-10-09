import mongoose from 'mongoose';

import { EMAIL_VERIFICATION_CHALLENGE_COLLECTION } from '../constants/emailVerification.ts';

const { Schema } = mongoose;

/**
 * AUTH-04-A — email-verification challenges.
 *
 * A challenge is the server's record that a 6-digit code was minted for one
 * Firebase identity and has not yet been spent. It is NOT a credential store and
 * must never become one: it names no user, no business and no session, and the
 * code it guards is not reversible from anything here.
 *
 * THREE THINGS ARE DELIBERATELY ABSENT, and each absence is the design.
 *
 *   * NO PLAINTEXT CODE. The code is generated, emailed and forgotten; only its
 *     keyed digest is stored. A stolen collection therefore yields no code to
 *     submit, and — because the digest is an HMAC keyed by a server-side pepper
 *     rather than an unkeyed hash of a 6-digit value — it also yields nothing to
 *     brute-force. An unkeyed digest of a 10^6 space would be a lookup table.
 *
 *   * NO EMAIL. `emailHmac` stores a keyed digest of the normalized address, not
 *     the address. The row can therefore be used to check that a code was minted
 *     for the identity presenting it without the collection becoming a second,
 *     unprotected copy of the user table.
 *
 *   * NO businessId, role OR status. A challenge exists BEFORE any of them do —
 *     it is created while the Firebase identity is still unverified, when no
 *     Inventory AI session and no tenant context exist — so there is nothing
 *     authoritative to copy. Adding one "for completeness" would create a field
 *     that is stale the moment the user is linked to a different business, in the
 *     exact place a reader would trust it.
 *
 * The row is keyed on the Firebase `uid` and there is ONE row per uid: a new
 * request supersedes the previous challenge in place rather than accumulating
 * rows. Uniqueness is enforced by the index, not by the service, because the
 * service's check-then-write is not atomic and the index is.
 */
const emailVerificationChallengeSchema = new Schema(
  {
    // The Firebase uid, and the only identity this row holds. `unique: true` IS
    // what declares the index (a separate `index: true` would be a second,
    // weaker declaration of the same thing). Deliberately NOT sparse: a uid is
    // always present, so sparse would be decoration.
    uid: {
      type: String,
      required: [true, 'uid is required'],
      unique: true,
      trim: true,
    },
    // The HMAC-SHA256 digest of the code, under the `code:` domain label. NOT
    // unique — and this is the one place where copying the neighbouring
    // password-reset model's declaration would be a live bug. The code space is
    // only 10^6, so two challenges having the same digest is EXPECTED, and a
    // unique index would reject a perfectly legitimate mint with E11000. It is
    // also never queried on its own: the challenge is looked up by uid, so no
    // index on this field is warranted either.
    codeHmac: {
      type: String,
      required: [true, 'codeHmac is required'],
      trim: true,
    },
    // The HMAC-SHA256 digest of the normalized email, under the `email:` domain
    // label. Non-unique and unindexed for the same reasons as `codeHmac`, plus
    // one more: nothing looks a challenge up by address, so an index here would
    // be write cost for no read.
    emailHmac: {
      type: String,
      required: [true, 'emailHmac is required'],
      trim: true,
    },
    // The resend-cooldown anchor (AD-9). REQUIRED, not nullable: a row exists
    // only because a send was requested, so there is no "never sent" state to
    // represent. The cooldown is enforced by the write path from this value.
    lastSentAt: {
      type: Date,
      required: [true, 'lastSentAt is required'],
    },
    // When the code stops working (AD-7). Enforced in every query predicate as
    // well as by the TTL index below, because the TTL sweep is eventual and a
    // delayed sweep must never widen a window.
    expiresAt: {
      type: Date,
      required: [true, 'expiresAt is required'],
    },
    // How many guesses have been RESERVED against this challenge (AD-8). The cap
    // itself lives in constants/emailVerification.ts and is enforced by the
    // reservation predicate, NOT here: the reservation is a findOneAndUpdate,
    // which does not run schema validators, so a `max` declared here would be
    // inert — and an inert bound is worse than an absent one because it reads
    // like enforcement. `min: 0` is declared because it CAN be enforced
    // meaningfully on create.
    attempts: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    // The moment the challenge was CONSUMED, stamped by a single conditional
    // update after the Firebase write succeeded (AD-12). Null means "still
    // live". It is never unset: once spent it stays spent even if everything
    // after it failed, so a half-completed confirmation is never replayable.
    usedAt: {
      type: Date,
      default: null,
    },
  },
  { collection: EMAIL_VERIFICATION_CHALLENGE_COLLECTION, timestamps: true }
);

// The TTL index, and the ONLY extra index on this collection. expireAfterSeconds:
// 0 removes a row at its own expiresAt (MongoDB's TTL monitor sweeps roughly
// every 60s, so deletion is eventual — every predicate filters expiresAt itself
// and never depends on the sweep having run). One row per uid means no compound
// index is needed: `{ uid: 1 }` from the path option above already serves the
// only read this collection has.
emailVerificationChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const EmailVerificationChallenge = mongoose.model(
  'EmailVerificationChallenge',
  emailVerificationChallengeSchema
);

export default EmailVerificationChallenge;
