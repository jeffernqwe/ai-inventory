/**
 * The email-verification service boundary (AUTH-04-A).
 *
 * This is the module the rest of the application imports. Callers depend on this
 * interface and on nothing else, so no caller learns how a code is generated,
 * which algorithm keys its digest, or that the pepper is read from the
 * environment at all.
 *
 * AUTH-04-A deliberately adds nothing that answers a request: there is no
 * route, no controller, no validator and no service that throws. What it
 * establishes is the reusable half the later phases build on — the pure code and
 * digest primitives, and the one configuration question the endpoints must ask
 * before they touch anything ("may this server key a code at all?").
 *
 * AUTH-04-B3 adds the first operation this boundary actually performs —
 * `requestEmailVerificationCode`, the challenge REQUEST lifecycle — together with
 * the `EmailVerificationError` its callers catch. AUTH-04-B4 adds its counterpart,
 * `confirmEmailVerificationCode`, the challenge CONFIRM lifecycle, which checks a
 * submitted code and then sets Firebase's `emailVerified` flag through the
 * AUTH-04-B2 bridge. The transport question is still absent: there is no route, no
 * controller and no HTTP status anywhere in this layer, so AUTH-04-C remains the
 * only place a domain failure becomes a response.
 *
 * The shape mirrors `services/firebase/index.ts` on purpose. That boundary
 * exposes `isFirebaseConfigured()` as a pure configuration question and never
 * initializes anything; this one exposes its counterpart in exactly the same
 * spirit.
 */

import { isEmailVerificationConfigured as configIsEmailVerificationConfigured } from '../../config/emailVerification.ts';
import {
  formatVerificationCode,
  generateVerificationCode,
  hashVerificationCode,
  hashVerificationEmail,
  verificationHmacMatches,
} from './code.ts';
import { requestEmailVerificationCode } from './request.ts';
import { confirmEmailVerificationCode } from './confirm.ts';
import { EmailVerificationError } from './errors.ts';
import type { RequestEmailVerificationCodeInput } from './request.ts';
import type { ConfirmEmailVerificationCodeInput } from './confirm.ts';
import type { EmailVerificationProblem } from './errors.ts';

export {
  formatVerificationCode,
  generateVerificationCode,
  hashVerificationCode,
  hashVerificationEmail,
  verificationHmacMatches,
  requestEmailVerificationCode,
  confirmEmailVerificationCode,
  EmailVerificationError,
};
export type {
  RequestEmailVerificationCodeInput,
  ConfirmEmailVerificationCodeInput,
  EmailVerificationProblem,
};

/**
 * True when this server may run the AUTH-04 flow: Firebase is configured and the
 * code pepper is present and long enough.
 *
 * A pure configuration question, and never an operation — asking it must not
 * construct a credential, open a connection or mint anything. The AUTH-04-B
 * endpoints call this BEFORE any account or challenge work, so an unconfigured
 * server answers a clean 503 rather than half-performing an operation it cannot
 * finish.
 */
export function isEmailVerificationConfigured(): boolean {
  return configIsEmailVerificationConfigured();
}

export default {
  isEmailVerificationConfigured,
  formatVerificationCode,
  generateVerificationCode,
  hashVerificationCode,
  hashVerificationEmail,
  verificationHmacMatches,
  requestEmailVerificationCode,
  confirmEmailVerificationCode,
  EmailVerificationError,
};
