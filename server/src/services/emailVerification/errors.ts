/**
 * AUTH-04-B3 — the email-verification request lifecycle's domain errors.
 *
 * The shape mirrors `services/mail/mailErrors.ts` and `PasswordResetError`:
 * this is the DOMAIN layer, so nothing here carries an HTTP status. The error
 * exposes a stable `code` — the same string the mobile client will branch on —
 * and the AUTH-04-C controller decides what to answer. That split is what keeps
 * a policy question ("this server cannot issue a code") out of the transport
 * question ("so answer 503 with this body").
 *
 * TWO OPTIONAL FIELDS, EACH FOR ONE FAILURE SHAPE, and both are DECLARED rather
 * than initialised. The `declare` keyword erases the annotation entirely, so the
 * constructor assignments below are the only thing that creates the fields at
 * runtime — which keeps them ABSENT (not `undefined`) when they were not
 * supplied, exactly as `PasswordResetError.problems` behaves. A plain field
 * declaration would have defined both as `undefined` up front and changed the
 * key order an error-serialising test reads.
 *
 *   * `problems` — the `{ field, message }` list every validator in this project
 *     produces. AUTH-04-B3 does NOT emit this shape itself for a missing Firebase
 *     email (that reuses the register path's `ApiError`/`VALIDATION_ERROR`
 *     convention), but the field is declared so the request lifecycle and its
 *     later confirm sibling share one error class rather than growing a second.
 *
 *   * `retryAfterSeconds` — the remaining per-UID resend cooldown (O-1/O-5),
 *     derived from the challenge's `lastSentAt`. It is NOT secret: it describes
 *     how long a caller must wait, which is exactly what a later
 *     `Retry-After` header states. This is the AUTH-04 cooldown and is
 *     deliberately distinct from the later AD-19 route limiter, which is a
 *     different control with a different budget.
 *
 * NO CODE, NO HMAC, NO EMAIL, NO UID, NO PEPPER and no Firebase ID token ever
 * appears on an instance of this class. The error is the object most likely to be
 * serialised by a crash reporter or reflected by a handler, so its fields are
 * deliberately ONLY the two above — neither of which is a credential.
 */

/**
 * A single field-level problem, identical to the shape `utils/validate.ts` and
 * `PasswordResetError` use. Declared here so this module has no import at all.
 */
export interface EmailVerificationProblem {
  field: string;
  message: string;
}

/** Optional details a caller may attach to an `EmailVerificationError`. */
interface EmailVerificationErrorOptions {
  problems?: EmailVerificationProblem[];
  retryAfterSeconds?: number;
}

/**
 * An email-verification failure. Carries a stable `code` and, when the failure
 * is a cooldown refusal, the remaining `retryAfterSeconds`.
 *
 * The **code** is the contract. Renaming one silently downgrades a specific,
 * friendly client message to a generic failure, which is why the codes are
 * declared once in `constants/emailVerification.ts` and referenced rather than
 * written as literals here.
 */
export class EmailVerificationError extends Error {
  declare code: string;
  declare problems: EmailVerificationProblem[] | undefined;
  declare retryAfterSeconds: number | undefined;

  constructor(code: string, message: string, { problems, retryAfterSeconds }: EmailVerificationErrorOptions = {}) {
    super(message);
    this.name = 'EmailVerificationError';
    this.code = code;
    // Assigned only when supplied, so the key is absent rather than `undefined`
    // on the paths that have neither — see the header.
    if (problems) this.problems = problems;
    if (retryAfterSeconds !== undefined) this.retryAfterSeconds = retryAfterSeconds;
  }
}

export default { EmailVerificationError };
