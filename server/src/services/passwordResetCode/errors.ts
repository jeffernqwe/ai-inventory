/**
 * AUTH-06 — the reset-code flow's domain error.
 *
 * The shape mirrors `EmailVerificationError` and `PasswordResetError`: this is the DOMAIN layer, so
 * nothing here carries an HTTP status. The error exposes a stable `code` — the same string the
 * mobile client branches on — and the controller decides what to answer. That split is what keeps
 * a policy question ("this server cannot issue a code") out of the transport question ("so answer
 * 503 with this body").
 *
 * THERE IS NO COOLDOWN FIELD, and there used to be. `retryAfterSeconds` was removed on 2026-10-20
 * together with the 429 it fed: on a public route a wait that is stated only for an existing
 * account is an account-existence oracle. The instance now carries exactly its code and its
 * message, which is also the smallest possible surface for a crash reporter to serialise.
 *
 * NO CODE, NO DIGEST, NO ADDRESS, NO PASSWORD and no pepper may appear on an instance: the error
 * is the object most likely to be serialised by a crash reporter or reflected by a handler, so its
 * fields are deliberately only the two above, neither of which is a credential.
 */

/**
 * A reset-code failure. `code` is the contract; renaming one silently downgrades a specific,
 * friendly client message to a generic failure, which is why the codes live in
 * `constants/passwordResetCode.ts` and are referenced rather than written as literals here.
 */
export class PasswordResetCodeError extends Error {
  declare code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'PasswordResetCodeError';
    this.code = code;
  }
}

export default { PasswordResetCodeError };
