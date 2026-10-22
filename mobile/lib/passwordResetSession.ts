/**
 * AUTH-06 (two-step recovery) — the verified reset state, held in MEMORY for one journey.
 *
 * WHY IT EXISTS. The reset code is checked on one screen and the password typed on another, so the
 * proof that the check happened has to survive the navigation. It is NOT navigation state: a route
 * param is serialised into the navigation route (and, for a deep-linkable route, potentially into a
 * URL), which is the last place a bearer credential should appear. It is NOT persisted either: an
 * authorization lives fifteen minutes, so writing it to disk would keep a credential alive after
 * the journey it belongs to has ended.
 *
 * It is therefore one module-level record, overwritten by each verification and cleared as soon as
 * it is used, refused, or abandoned. Losing it (the app was killed) is not a failure — the person
 * asks for a new code, which is the same remedy as an expired one.
 *
 * WHAT IT IS NOT. It is not an authorization check. The password screen can only *offer* the token;
 * the server decides whether it is real, unexpired, unused and bound to an account. Everything here
 * is a convenience for the client, and nothing here can make a write happen that the server would
 * otherwise refuse.
 */

export interface VerifiedReset {
  /** The address the code was verified for. Used only to label the journey. */
  email: string;
  /** The single-use authorization minted by `POST /api/auth/password-reset/verify`. */
  resetToken: string;
  /** Epoch milliseconds at which the server will stop accepting it. */
  expiresAt: number;
}

let current: VerifiedReset | null = null;

/**
 * Record a successful verification.
 *
 * `expiresInSeconds` comes from the server, never from a client constant: a screen that guessed the
 * window would either refuse a still-valid authorization or offer an expired one.
 */
export function beginVerifiedReset({
  email,
  resetToken,
  expiresInSeconds,
  now = Date.now(),
}: {
  email: string;
  resetToken: string;
  expiresInSeconds: number;
  now?: number;
}): VerifiedReset {
  current = {
    email,
    resetToken,
    expiresAt: now + Math.max(0, expiresInSeconds) * 1000,
  };
  return current;
}

/**
 * The live verification, or `null` when there is none or it has expired.
 *
 * Expired state is dropped here rather than left for the server to refuse: the screen should show
 * "verify again" before the person types a password, not after they submit it.
 */
export function readVerifiedReset(now = Date.now()): VerifiedReset | null {
  if (!current) return null;
  if (current.expiresAt <= now) {
    current = null;
    return null;
  }
  return current;
}

/**
 * Forget the verification.
 *
 * Called on success (the token is spent and the password has changed), on a definitive refusal (the
 * server said this authorization is gone), and when the person chooses to start over. It is
 * idempotent, so no caller has to know whether anyone else already cleared it.
 */
export function clearVerifiedReset(): void {
  current = null;
}

export default { beginVerifiedReset, readVerifiedReset, clearVerifiedReset };
