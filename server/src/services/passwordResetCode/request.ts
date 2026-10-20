/**
 * AUTH-06 — the reset-code REQUEST lifecycle.
 *
 * One exported operation: `requestPasswordResetCode({ email })`. It mints a six-digit code for an
 * eligible account, makes it that account's current challenge, and emails it. No HTTP surface here
 * (that is the controller), no confirmation and no session.
 *
 * THE ORDER OF THE STEPS IS THE DESIGN, and several reorderings that look harmless are not.
 *
 *   1. THE CONFIGURATION QUESTIONS COME FIRST AND BEFORE ANY DATABASE WORK. A server that cannot
 *      key a digest (`isPasswordResetCodeConfigured`) or cannot send mail (`isMailConfigured`) must
 *      not look an account up at all: those two conditions are checked identically for every
 *      caller, so answering 503 for them discloses nothing, whereas checking them after the lookup
 *      would make the 503 reachable only for addresses that exist — an account-existence oracle.
 *      Minting is refused for the same reason 26B refuses it: a code that cannot be delivered
 *      would put the address into a cooldown window for an email that cannot arrive.
 *
 *   2. THE ADDRESS IS THE LOOKUP KEY, AND IT IS NORMALIZED ONCE. `normalizeEmail` is total, so a
 *      non-string simply matches no account rather than throwing — the same totality 26B's request
 *      path has.
 *
 *   3. AN INELIGIBLE ACCOUNT IS A SILENT RETURN, and "ineligible" covers four different facts:
 *      no such account, a DISABLED account, a suspended tenant, and an account with no
 *      `firebaseUid` (which in practice means one that predates or bypasses Firebase). ALL FOUR
 *      must be indistinguishable from the outside, because each of them is account state a caller
 *      may not learn. The silent return is what makes the controller's single 202 truthful.
 *
 *   4. THE ACCOUNT IS PINNED ON THE CHALLENGE. `userId` is written here, from the document just
 *      found, so confirming acts on THIS account and never on one re-derived from the address
 *      submitted with the code.
 *
 *   5. THE CODE IS MINTED IN MEMORY ONLY. The plaintext code is put in the message and forgotten;
 *      the row holds two keyed digests and an expiry.
 *
 *   6/7. THE CHALLENGE IS MADE CURRENT BY ONE CONDITIONAL `findOneAndUpdate` USING THE
 *      `{ emailHmac }` UNIQUE INDEX — no new index, no transaction, no lock. The predicate carries
 *      the resend cooldown, so an update either supersedes an existing challenge in place or
 *      matches nothing. A miss is resolved by reading the row: PRESENT means the cooldown is still
 *      active and the request is refused with the accurate remaining seconds; ABSENT means this is
 *      the address's first challenge, and the insert path is attempted. A concurrent creator loses
 *      on the unique index (E11000), read with the repository's existing `duplicateKeyField()`
 *      precedent and resolved to the same cooldown refusal. Concurrent callers therefore CONVERGE
 *      to one row and at most one send per window.
 *
 *   8. THE SEND IS DETACHED, exactly as Phase 28 B1 detached the reset link. Awaiting it would put
 *      a synchronous outbound HTTPS POST between the caller and their 202 — the largest term
 *      distinguishing a real address from an unknown one, and the reason a delivery failure must
 *      not be observable at all. The rejection handler is attached in the same synchronous turn
 *      the promise is created, so no rejection can escape: an unhandled rejection here would crash
 *      the process on a delivery failure, converting a swallowed, operator-visible event into an
 *      outage.
 *
 * THE COOLDOWN IS THE GUESS BUDGET, NOT MERELY A RATE LIMIT. Because supersession resets
 * `attempts` to 0, a caller can obtain a fresh guess budget by waiting out the cooldown: at most
 * ~1440 challenges per day against a 10^6 space with five guesses each. That is the same accepted
 * arithmetic AUTH-04 records (AD-9), and it is why the cooldown is enforced here, server-side, in
 * the write predicate rather than trusted to a client.
 *
 * AND THE COOLDOWN IS SILENT, WHICH IS A CORRECTION RATHER THAN A PREFERENCE (2026-10-20).
 * Refusing it with a 429 would have been a ONE-REQUEST ORACLE: a challenge row exists only for an
 * ELIGIBLE account, so "429 on the second request" would answer "this address has an account" —
 * the exact question every other part of this path is built not to answer, and the reason the
 * status is uniform in the first place. AUTH-04's cooldown MAY be a 429 because that route is
 * authenticated: the caller has already proved control of the account, so there is nothing left
 * to learn. A public route has no such licence. A refusal the server is not allowed to describe is
 * therefore not a refusal — the request resolves 202, sends nothing, and leaves the code already
 * in the person's inbox valid for its full ten minutes, which is also why sending nothing costs
 * them nothing. The route limiters still answer 429 with `Retry-After` for BOTH address classes,
 * because they are keyed on the submitted address and the caller's IP and never on whether an
 * account exists; that is where an honest throttle belongs, and it is where the client's
 * `Retry-After` handling still reads one.
 *
 * THE RESIDUAL, RECORDED RATHER THAN GLOSSED. An eligible account costs one extra MongoDB write
 * compared with an unknown one. That term is the same order as the lookup itself and is accepted
 * for V1 in exactly the terms Phase 29 recorded for B1's residual database-work term.
 */

import { error as logError, info as logInfo } from '../../utils/logger.ts';
import { normalizeEmail } from '../../utils/validate.ts';
import User from '../../models/user.model.ts';
import PasswordResetChallenge from '../../models/passwordResetChallenge.model.ts';
import {
  PASSWORD_RESET_CODE_LOG_EVENTS,
  PASSWORD_RESET_CODE_NOT_CONFIGURED,
  PASSWORD_RESET_CODE_RESEND_COOLDOWN_SECONDS,
  PASSWORD_RESET_CODE_TTL_MINUTES,
} from '../../constants/passwordResetCode.ts';
import { isPasswordResetCodeConfigured, passwordResetCodePepper } from '../../config/passwordResetCode.ts';
import { duplicateKeyField } from '../firebaseAuth.service.ts';
import { assertActiveBusiness } from '../business.service.ts';
import { MailDeliveryError, MailNotConfigured, isMailConfigured, sendPasswordResetCodeEmail } from '../mail/index.ts';
import { generateResetCode, hashResetCode, hashResetEmail } from './code.ts';
import { PasswordResetCodeError } from './errors.ts';

/** The `{ email }` a caller submits. `unknown`, because the lookup is total over any value. */
export interface RequestPasswordResetCodeInput {
  email?: unknown;
}

const NOT_CONFIGURED_MESSAGE =
  'Password reset is temporarily unavailable. Please try again later.';

const ACTIVE_STATUS = 'ACTIVE';

function notConfigured() {
  return new PasswordResetCodeError(PASSWORD_RESET_CODE_NOT_CONFIGURED, NOT_CONFIGURED_MESSAGE);
}

/** Records that a code became an address's current challenge. Carries no identifier and no value. */
function logCodeRequested() {
  logInfo({
    type: PASSWORD_RESET_CODE_LOG_EVENTS.CODE_REQUESTED,
    message: '[password-reset-code] a reset code was issued',
  });
}

/**
 * Records why a DETACHED send failed.
 *
 * MUST NOT THROW, and is written so that it cannot: the caller is a `.catch` handler, and an
 * exception raised inside one produces a fresh rejected promise with nothing attached — the exact
 * unhandled rejection this boundary exists to prevent. `reason` is a CLOSED-SET fixed string chosen
 * by `instanceof`, and the upstream message is never relayed: the mail layer builds its messages
 * from safe facts, but this is the record an operator reads, and one programming fault could carry
 * request-derived text. No address, no uid and no code appears.
 */
function logDetachedMailFailure(err: unknown) {
  let reason = 'mail_dispatch_error';
  if (err instanceof MailNotConfigured) reason = 'mail_not_configured';
  else if (err instanceof MailDeliveryError) reason = 'mail_delivery_failure';

  logError({
    type: PASSWORD_RESET_CODE_LOG_EVENTS.FAILED,
    reason,
    message: '[password-reset-code] the reset code could not be delivered',
  });
}

/** True when this account may receive a reset code at all — see step 3. */
async function isEligibleAccount(user: {
  status?: string;
  firebaseUid?: string | null;
  businessId?: unknown;
}): Promise<boolean> {
  if (user.status !== ACTIVE_STATUS) return false;
  // A Firebase-owned account is the ordinary case here; the opposite is what makes a code
  // unspendable, because the credential write needs a uid to write.
  if (typeof user.firebaseUid !== 'string' || user.firebaseUid.trim() === '') return false;
  try {
    await assertActiveBusiness(user.businessId as never);
  } catch {
    // Fails closed and silently, so a suspended tenant is indistinguishable from an unknown
    // address — the same rule 26B's request path states.
    return false;
  }
  return true;
}

/**
 * Issue a reset code for the account an address names.
 *
 * Resolves with `undefined` on EVERY non-error path — code sent, no such account, ineligible
 * account, and discarded delivery — so the controller has no field it could reflect.
 *
 * Throws `PasswordResetCodeError` for an unusable configuration, and only for that: the resend
 * cooldown resolves exactly like a completed request (see the header), because describing a wait
 * on a public route would say whether the address has an account.
 */
export async function requestPasswordResetCode({
  email,
}: RequestPasswordResetCodeInput = {}): Promise<void> {
  // ---- 1. Configuration first, and before any lookup (see the header). -----------------
  if (!isPasswordResetCodeConfigured()) throw notConfigured();
  if (!isMailConfigured()) throw notConfigured();

  const now = new Date();
  const address = normalizeEmail(email);
  if (!address) return;

  // ---- 2/3. The lookup, and the one silent exit every ineligible case shares. ----------
  const user = await User.findOne({ email: address });
  if (!user) return;
  if (!(await isEligibleAccount(user))) return;

  // ---- 4/5. Mint in memory; the plaintext code never leaves this function. -------------
  const pepper = passwordResetCodePepper();
  const code = generateResetCode();
  const emailHmac = hashResetEmail(pepper, address);
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_CODE_TTL_MINUTES * 60_000);
  const cooldownFloor = new Date(
    now.getTime() - PASSWORD_RESET_CODE_RESEND_COOLDOWN_SECONDS * 1000
  );
  const currentChallenge = {
    userId: user._id,
    codeHmac: hashResetCode(pepper, code),
    expiresAt,
    attempts: 0,
    usedAt: null,
    lastSentAt: now,
  };

  // ---- 6. One conditional update: supersede in place, or match nothing. ---------------
  const superseded = await PasswordResetChallenge.findOneAndUpdate(
    { emailHmac, lastSentAt: { $lte: cooldownFloor } },
    { $set: currentChallenge },
    { returnDocument: 'after' }
  );

  // ---- 7. Resolve a miss: silent cooldown, or the first-challenge insert. --------------
  if (!superseded) {
    // A row means a code was issued inside the cooldown window. It is still valid and still in
    // the person's inbox, so this request sends nothing — and says nothing about why. See the
    // header: an observable refusal here is an account-existence oracle.
    const existing = await PasswordResetChallenge.findOne({ emailHmac });
    if (existing) return undefined;

    // The insert can still lose a race: two concurrent first requests both see no row and both
    // insert, and the unique index lets exactly one win, so the pair leaves ONE row and at most
    // ONE send.
    try {
      await PasswordResetChallenge.create({ emailHmac, ...currentChallenge });
    } catch (err) {
      // The loser of the race has converged on the SAME state as the winner — one row, one
      // send — so it answers the same way. Reading the row back is pointless here: there is no
      // cooldown figure to state, and stating one is exactly what this path must not do.
      if (duplicateKeyField(err) === 'emailHmac') return undefined;
      throw err;
    }
  }

  // ---- 8. The challenge is durably current: record the event, then send detached. -----
  logCodeRequested();

  // NOT awaited, and the rejection handler is attached in this same synchronous turn. See the
  // header: awaiting here would make delivery latency, and delivery failure, observable to a
  // caller who must not be able to tell one address from another.
  sendPasswordResetCodeEmail({
    to: address,
    code,
    expiresInMinutes: PASSWORD_RESET_CODE_TTL_MINUTES,
  }).catch(logDetachedMailFailure);
}

export default {
  requestPasswordResetCode,
};
