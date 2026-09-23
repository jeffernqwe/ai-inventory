/**
 * Firebase constants that are about OUR policy rather than Firebase's protocol.
 *
 * Kept out of `services/firebase/` on purpose. That directory is the verify
 * boundary and holds Firebase's own vocabulary (token errors, the admin app
 * lifecycle); this file holds the two things that are ours to choose and that a
 * test or a guard needs to read as a single value: how long an authentication
 * stays "recent" for our purposes, and the stable codes our own endpoints emit.
 */

/**
 * How long a Firebase authentication remains fresh enough to authorize a
 * sensitive identity operation (Phase 32L, frozen as Option D).
 *
 * 300 seconds, and the value is deliberately Firebase's own — the runtime
 * verification for Phase 32L measured Firebase refusing `updatePassword` at a
 * 390-second-old authentication while ACCEPTING a provider unlink at the same
 * age, so there is no upstream constant to inherit and this one is ours. Matching
 * Firebase's documented ~5-minute notion keeps the two boundaries from
 * disagreeing in a way a user could observe: a client that reauthenticates
 * because Firebase asked will also satisfy this check.
 *
 * The check itself lives in `authTimeIsFresh` below, and it is enforced
 * SERVER-SIDE from the signed claim. Nothing a client can send chooses it.
 */
export const FIREBASE_REAUTH_WINDOW_SECONDS = 300;

/**
 * The caller must reauthenticate with Firebase before this operation may
 * proceed. A 409, never a 401 or a 403 — see the unlink controller for why the
 * status is load-bearing rather than cosmetic.
 */
export const FIREBASE_REAUTHENTICATION_REQUIRED = 'FIREBASE_REAUTHENTICATION_REQUIRED';

/**
 * The caller's own account carries no Firebase identity, so there is nothing to
 * detach.
 *
 * Deliberately distinct from `FIREBASE_IDENTITY_CONFLICT` (Phase 32H): "nothing
 * is linked" and "the identity you presented belongs to someone else" are
 * different facts, and collapsing them would tell a caller that a mapping exists
 * when none does.
 */
export const FIREBASE_IDENTITY_NOT_LINKED = 'FIREBASE_IDENTITY_NOT_LINKED';

/**
 * True when `authTime` is inside the freshness window at `nowMs`.
 *
 * FAILS CLOSED on every malformed input, and that is the whole contract:
 *
 *   * `null` — the token carried no usable `auth_time` — is NOT recent. A token
 *     that cannot be dated cannot be trusted to be fresh.
 *   * a non-finite value is not recent (belt-and-braces; the verifier already
 *     narrows to `number | null`, so this only guards a direct caller).
 *
 * `nowSeconds - authTime` is compared rather than `authTime` against a clock the
 * caller supplied, so the comparison is the same one the token's own lifetime
 * uses. A `auth_time` slightly in the FUTURE — clock skew between Google's
 * signing host and this server — yields a negative difference and is therefore
 * accepted; that is correct, because the claim is signed by Google and rejecting
 * it would fail closed against honest traffic.
 */
export function authTimeIsFresh(
  authTime: number | null | undefined,
  nowMs: number,
  windowSeconds: number = FIREBASE_REAUTH_WINDOW_SECONDS
): boolean {
  if (typeof authTime !== 'number' || !Number.isFinite(authTime)) return false;
  const nowSeconds = Math.floor(nowMs / 1000);
  return nowSeconds - authTime <= windowSeconds;
}

export default {
  FIREBASE_REAUTH_WINDOW_SECONDS,
  FIREBASE_REAUTHENTICATION_REQUIRED,
  FIREBASE_IDENTITY_NOT_LINKED,
  authTimeIsFresh,
};
