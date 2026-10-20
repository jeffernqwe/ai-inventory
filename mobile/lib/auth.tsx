import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import * as api from './api';
import type { ApiResponse, RegisterPayload } from './api';
import {
  ApiError,
  isRecoverableAuthError,
  setSessionLostHandler,
  setSessionRecoveryHandler,
  setSessionRenewalHandler,
} from './client';
import { isFirebaseConfigured } from './config';
import {
  FirebaseAuthError,
  confirmFirebaseSignIn as firebaseConfirmSignIn,
  currentFirebaseIdToken,
  ensureFirebaseAccount,
  signInWithEmail,
  signInWithGoogle as firebaseSignInWithGoogle,
  signOutOfFirebase,
} from './firebase-auth';
import type { ConfirmSignInOutcome, FirebaseConfirmMethod } from './firebase-auth';
import {
  nativeForceIdToken,
  nativeReloadUser,
  nativeHasCurrentUser,
  nativeUpdatePassword,
} from './firebase-native';
import type { Role } from './permissions';

/**
 * Session state for the whole app.
 *
 * The JWT is the only thing persisted (SecureStore — Android Keystore / iOS
 * Keychain). The user object is always re-fetched from /api/auth/me on boot so
 * role/status/businessId reflect the server, never a stale cache. A token that
 * is invalid, expired, or belongs to a disabled user is cleared and the app
 * returns to the login screen. Authorization stays entirely on the backend —
 * this context only decides which screen is shown.
 *
 * Phase 26A: the token is no longer the whole session. The server keeps a
 * session record named by the token's `jti`, so signing out revokes it for real,
 * one device can be ended without touching the others, and a session ended
 * elsewhere stops working here at the next request — which surfaces as the same
 * 401 this context has always treated as "no longer signed in".
 *
 * Phase 32E: Firebase is a SECOND WAY TO PROVE AN IDENTITY, not a second session.
 * `signIn` asks Firebase first and hands the ID token to
 * POST /api/auth/firebase/exchange; the token this context stores is the same
 * Inventory AI JWT it has always stored, so every rule above is untouched. The
 * legacy password route is kept as a migration path for accounts that predate
 * Firebase, and it is reached ONLY when Firebase reports that it has no identity
 * for the address — never when Firebase or the backend failed, so an outage
 * cannot become a downgrade. `lib/firebase-auth.ts` owns that classification;
 * this file only consumes it.
 *
 * Phase B: Firebase authentication now runs on the NATIVE SDK with native durable
 * persistence (owner decision P2), and this file changes in exactly one place — the
 * session-loss handler below, which now also ends the durable Firebase session. THE
 * BOOT PATH IS DELIBERATELY UNCHANGED AND MUST STAY THAT WAY: the Inventory AI JWT is
 * the only thing that signs anyone in, a restored native `currentUser` is never
 * exchanged and never bridged into session state, and there is no auth-state listener
 * anywhere in this file. A durable Firebase identity with no Inventory AI JWT leaves
 * the app signed out, which is the P2 §6.5 reconciliation rule.
 */

const TOKEN_KEY = 'inventoryai.auth.token';

/**
 * Phase 32J — the one exchange refusal that is also a JOURNEY, not just a message.
 *
 * `REGISTRATION_REQUIRED` means the identity authenticated with Firebase but has no
 * Inventory AI account. Since Phase 32C the server has had the endpoint that fixes
 * exactly this (`POST /api/auth/firebase/register`), and since Phase 32I the client
 * can hold a Google identity that reaches it — what was missing was a path between
 * the two. This constant is where that path begins.
 */
const REGISTRATION_REQUIRED = 'REGISTRATION_REQUIRED';

/**
 * No Firebase identity is signed in, so no registration credential can be produced.
 * The code is this module's own (it never left the device) and exists for the log;
 * the sentence is what a person reads, and it names the one action that helps.
 */
const NO_FIREBASE_IDENTITY = 'firebase/no-current-user';
const NO_FIREBASE_IDENTITY_MESSAGE = 'Your sign-in has expired. Please sign in again.';

/**
 * The onboarding payload. It carries PROFILE TEXT ONLY.
 *
 * There is deliberately no `idToken`, `firebaseUid`, `email`, `businessId`, `role`
 * or `status` field: the identity comes from the Firebase Auth layer and is read
 * inside `completeFirebaseRegistration` at the moment of use, and the rest are the
 * server's to assign. A screen therefore has no variable that could carry a
 * credential or an authorization claim, and no navigation parameter does either.
 */
export interface FirebaseRegistrationInput {
  businessName: string;
  name?: string;
}

/** True for the one server refusal that arms the Firebase onboarding route. */
function isRegistrationRequired(err: unknown): boolean {
  return err instanceof ApiError && err.code === REGISTRATION_REQUIRED;
}

/**
 * Phase 32L-B — the one credential-change refusal that is an INSTRUCTION, not a verdict.
 *
 * The server refuses with this when the Firebase authentication behind the
 * request is older than its 300 s window. Nothing is wrong with the account and
 * nothing was mutated; the caller simply has to prove the sign-in again and ask
 * once more. It is a 409 precisely so it cannot be mistaken for a dead session
 * (see `lib/client.ts`), and it is the ONLY credential-change refusal this layer
 * retries.
 */
const REAUTHENTICATION_REQUIRED = 'FIREBASE_REAUTHENTICATION_REQUIRED';

/** True for the recoverable credential-change freshness refusal, and nothing else. */
function isReauthenticationRequired(err: unknown): boolean {
  return err instanceof ApiError && err.code === REAUTHENTICATION_REQUIRED;
}

/**
 * The three sentences a failed CONFIRMATION can produce, in this layer's voice.
 *
 * They exist here rather than in `lib/firebase-auth.ts` because the Firebase
 * module owns what a Firebase FAULT means, while this layer owns what an
 * unfinished sign-in means to the session. `wrong-method` is the actionable one:
 * the account confirms through the other option, not through this one. None of
 * these names a provider, a uid or a token.
 */
const CONFIRM_CANCELLED = 'firebase/confirm-cancelled';
const CONFIRM_CANCELLED_MESSAGE = 'Your sign-in was not confirmed.';
const CONFIRM_WRONG_METHOD = 'firebase/confirm-wrong-method';
const CONFIRM_WRONG_METHOD_MESSAGE =
  'That is not how this account confirms its sign-in. Try the other option.';

/** No Inventory AI session is held, so there is no account to disconnect. */
const NO_SESSION_CODE = 'firebase/no-session';
const NO_SESSION_MESSAGE = 'Your session has expired. Please sign in again.';

/**
 * Turns a non-token confirmation outcome into the error this layer raises.
 *
 * A `failure` already carries the Firebase module's own safe sentence, so it is
 * passed through untouched. `cancelled` and `wrong-method` are ordinary states
 * with no message of their own — this is where they become something a caller
 * can catch, phrased for the session rather than for a Firebase operation.
 */
function confirmationError(
  outcome: Exclude<ConfirmSignInOutcome, { kind: 'idToken' }>
): FirebaseAuthError {
  if (outcome.kind === 'failure') return new FirebaseAuthError(outcome.code, outcome.message);
  if (outcome.kind === 'wrong-method') {
    return new FirebaseAuthError(CONFIRM_WRONG_METHOD, CONFIRM_WRONG_METHOD_MESSAGE);
  }
  return new FirebaseAuthError(CONFIRM_CANCELLED, CONFIRM_CANCELLED_MESSAGE);
}

/** The signed-in user as the server's public shape exposes it. */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  status?: string;
  /**
   * Sent by `toPublicUser` (server/src/services/auth.service.js) and rendered by
   * the Profile screen as "Member since". Declared optional because the mobile
   * type does not depend on the server sending it.
   */
  createdAt?: string;
  /**
   * Phase 32K — the provider-neutral capability block the server publishes on
   * its public user DTO.
   *
   * `password: false` means Inventory AI does not manage this account's local
   * password, so the change-password control is not offered. It does NOT mean the
   * account has no credential: a Firebase-linked account keeps its legacy hash,
   * which simply no longer authenticates.
   *
   * There is deliberately no field naming the provider. The server sends a
   * capability, not the `firebaseUid` behind it, and this type consumes exactly
   * that — so adding another provider later changes nothing here.
   *
   * Optional for the same reason `createdAt` is: an older server's user object is
   * a valid value, and absence means "assume the historical behaviour" (a local
   * password the user may change).
   *
   * `firebase` (Phase 32L-B) is the other half of the same block, and it is what
   * the DISCONNECT flow gates on: `firebase: true` means this account authenticates
   * through a Firebase identity, so there is a connection to detach and the
   * Security entry point is offered. It is TRUE for a Firebase-NATIVE account and
   * for a Firebase-LINKED legacy account alike — the server publishes a capability,
   * not the identity behind it, so the client cannot and must not tell the two
   * apart. `password: false` does NOT imply `firebase: true` on an older server
   * that never sent the field; absence is again "assume the historical behaviour",
   * which here means offering no disconnect action at all.
   */
  authMethods?: { password: boolean; firebase?: boolean };
}

/** 'loading' until the boot restore settles, then one of the two settled states. */
export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

/**
 * AUTH-03 — the fine-grained authentication phase, layered ON TOP of `status` so
 * navigation keeps reading the coarse value it always has.
 *
 *   idle      — nothing in flight; a signed-in session is healthy.
 *   renewing  — one renewal/recovery is in flight (single-flight).
 *   degraded  — the session is STILL VALID but a transient failure (Firebase
 *               unreachable, a renewal rate limit, a network fault) means renewal
 *               could not complete. Requests continue where possible; the user is
 *               NOT signed out.
 *
 * `REAUTH_REQUIRED` is conceptual in AUTH-03 (no dedicated screen): a terminal
 * failure simply returns the app to `signedOut`, which is the re-authentication
 * entry point the login screen already is.
 */
export type AuthPhase = 'idle' | 'renewing' | 'degraded';

export interface SignInCredentials {
  email: string;
  password: string;
}

/**
 * A "confirm your sign-in" request (Phase 32L-B).
 *
 * `method` is a CHOICE the person makes, never something the app discovers — the
 * server publishes no provider data, and Firebase's only email-based discovery
 * API is deprecated and discouraged. `email` is the account's OWN address, taken
 * by the screen from `user.email` and displayed read-only; it is never compared
 * to anything and never used to find an account. It is needed only by the
 * password method, because `signInWithEmailAndPassword` takes one and, after a
 * cold start, there is no Firebase session to read it from.
 */
export interface FirebaseConfirmInput {
  method: FirebaseConfirmMethod;
  email?: string;
  password?: string;
}

/**
 * A password-change request (Phase A / F-1): ONE attempt's inputs, and nothing
 * carried between attempts.
 *
 * `newPassword` is the credential that will own the account afterwards. It is set
 * AT FIREBASE and validated there; the shared server validator is never consulted
 * for it, because Inventory AI holds no credential for this account at all.
 */
export interface ChangeFirebasePasswordInput extends FirebaseConfirmInput {
  newPassword: string;
}

/**
 * What ONE password-change attempt produced.
 *
 * `reauth-required` is not a failure and not an error: the refusal came only
 * because the Firebase authentication behind the request was older than its 300 s
 * window, and it mutated nothing. It is RETURNED rather than handled here because
 * its remedy needs the person — a confirmation they complete, and a new password
 * they type again — and because handling it here would mean finishing the flow with
 * the credential this call was handed still in scope. The caller re-confirms and
 * calls again with a password it collected afterwards.
 */
export type ChangeFirebasePasswordOutcome =
  | { kind: 'changed' }
  | { kind: 'reauth-required' };

/**
 * Per-call options.
 *
 * `retry` marks a call as the flow's SECOND and LAST attempt, and it is what makes
 * "retry at most once" structural rather than a convention a caller is trusted to
 * remember: a `retry` call refused for freshness THROWS instead of answering
 * `reauth-required`, so no caller can ask a third time and no loop can exist.
 * Enforced here rather than in the caller because this is the one place every
 * attempt passes through.
 */
export interface ChangeFirebasePasswordOptions {
  retry?: boolean;
}

/**
 * What ONE Connect Google attempt produced (Phase 32M).
 *
 * `cancelled` is an ORDINARY state rather than an error, for the same reason
 * `signInWithGoogle` resolves `null` for it: the person closed the Google sheet, so
 * nothing was sent and nothing changed. `in-flight` means a previous attempt is still
 * running, so this one started nothing — a duplicate tap must not open a second consent
 * sheet or send a second link request.
 */
export type ConnectFirebaseOutcome =
  | { kind: 'linked' }
  | { kind: 'cancelled' }
  | { kind: 'in-flight' };

/**
 * Phase 16 - the explicit, IN-MEMORY Firebase onboarding state.
 *
 * Three states, and the distinction matters because the two journeys have different
 * destinations: an identity that has not VERIFIED its address must go to the verify
 * screen, while a verified identity with no tenant must go to the business-name screen.
 * A single boolean could not tell them apart, and the exchange cannot either - an
 * unverified identity has no User, so it receives the same REGISTRATION_REQUIRED a
 * verified-but-tenant-less one does. It is deliberately NOT persisted: a cold start has
 * no live credential to resume from, so there is nothing to restore, and persisting it
 * would let a stale state outlive the identity it describes.
 */
export type FirebaseOnboarding =
  | 'none'
  | 'verify-email'
  /** AUTH-04-F — a persisted identity whose verification state could not be read. */
  | 'verify-unreachable'
  | 'register';

/** The profile details an identity awaiting verification will need to register. */
export interface PendingFirebaseRegistration {
  businessName: string;
  name?: string;
}

/** The informational code a verification refusal carries; the route is already armed. */
const FIREBASE_VERIFICATION_REQUIRED = 'firebase/verification-required';

/** What a person reads. No Firebase or native error text is ever relayed. */
const VERIFY_EMAIL_MESSAGE = 'Verify your email address to continue.';
const VERIFY_CHECK_FAILED_MESSAGE =
  'Unable to check your email verification status. Please try again.';
const NO_FIREBASE_TOKEN_MESSAGE =
  'Your sign-in could not be refreshed. Please sign in again.';

/**
 * AUTH-04-F (Option B) — what a person reads when the INITIAL verification-code request
 * fails during registration. The server's own client-facing copy is preferred when the
 * failure carries one; this is the fallback, so the verify screen always has a safe
 * sentence and never a raw error, a provider reason, a uid, an email or a token.
 */
const VERIFICATION_REQUEST_FAILED_MESSAGE =
  'We could not send your verification code. Please try again.';

/** The safe, client-facing sentence for an initial-verification-request failure. */
function verificationSendFailureMessage(err: unknown): string {
  const message = (err as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message.trim()
    ? message
    : VERIFICATION_REQUEST_FAILED_MESSAGE;
}

/**
 * AUTH-04-F — the READ-ONLY restart/resume probe (owner-ratified Option A).
 *
 * Answers which screen a SIGNED-OUT launch belongs on, from the DURABLE native
 * Firebase identity alone. Five states:
 *
 *   no Firebase configuration         -> 'none'                (Login)
 *   no persisted identity             -> 'none'                (Login)
 *   persisted identity, verified      -> 'none'                (Login; user-driven)
 *   persisted identity, unverified    -> 'verify-email'
 *   identity present, state unreadable-> 'verify-unreachable'
 *
 * IT PROVES NOTHING AND MINTS NOTHING. It never signs in, never exchanges an ID token,
 * never mints or applies an Inventory AI session, never retries and never clears or
 * signs out the durable Firebase identity — not even on failure. A verified identity is
 * deliberately sent to Login rather than exchanged, because only a user-driven sign-in
 * may open a session.
 *
 * EXISTENCE IS CHECKED FIRST. `nativeReloadUser()` answers `false` when there is NO
 * user, so it cannot tell "no identity" from "unverified identity" by itself; and the
 * native boundary is lazily loaded, so a fault while asking means we cannot confirm an
 * identity at all — which is the Login answer, never a verification screen.
 */
async function probeVerificationResume(): Promise<FirebaseOnboarding> {
  if (!isFirebaseConfigured()) return 'none';

  let hasIdentity = false;
  try {
    hasIdentity = nativeHasCurrentUser();
  } catch {
    hasIdentity = false;
  }
  if (!hasIdentity) return 'none';

  try {
    const verified = await nativeReloadUser();
    return verified ? 'none' : 'verify-email';
  } catch {
    return 'verify-unreachable';
  }
}

/** The native code on an error, or null. Structural, so no SDK class is required. */
function nativeErrorCode(err: unknown): string | null {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code ? code : null;
}

/**
 * Reads the LIVE Firebase verification state, mapping a native fault to a
 * FirebaseAuthError so every caller has one shape to handle.
 *
 * THROWS RATHER THAN ANSWERING false, and that is load-bearing: a failure to READ the
 * state must never be collapsed into a not-verified answer, or a network blip would
 * send a verified person down the verification road. The native boundary reads the
 * getter after a reload, so the answer is Firebase's, never a cached claim.
 */
async function readEmailVerified(): Promise<boolean> {
  try {
    return await nativeReloadUser();
  } catch (err) {
    throw new FirebaseAuthError(nativeErrorCode(err), VERIFY_CHECK_FAILED_MESSAGE);
  }
}

/** The value exposed by {@link useSession}. */export interface AuthValue {
  user: AuthUser | null;
  token: string | null;
  status: AuthStatus;
  signIn: (credentials: SignInCredentials) => Promise<AuthUser>;
  /**
   * Phase 16 / AUTH-04-F - resolves the signed-in user, or `null` when the Firebase
   * identity was created and a verification code requested but NO session exists yet; the
   * caller should then follow `firebaseOnboarding` to the verify screen.
   */
  signUp: (input: RegisterPayload) => Promise<AuthUser | null>;
  /**
   * Google Sign-In (Phase 32I). Resolves with the signed-in user, or `null` when
   * the user CANCELLED the Google sheet — a cancellation is an ordinary outcome,
   * not an error a screen should render. Every real refusal (a Firebase fault, an
   * exchange refusal such as `REGISTRATION_REQUIRED`) throws, exactly as `signIn`
   * does, so the screens' existing error path handles it with no new branch.
   */
  signInWithGoogle: () => Promise<AuthUser | null>;
  /**
   * Phase 32J — completes registration for an identity Firebase has ALREADY
   * authenticated, then signs that same identity in.
   *
   * It is the register/exchange pair of Phase 32A §8.2 over the endpoints that
   * already own each step — `POST /api/auth/firebase/register` creates the tenant
   * and issues no token, and `POST /api/auth/firebase/exchange` is what opens the
   * session — so no session mechanism is duplicated and the token this settles on
   * is the same Inventory AI JWT every other route produces.
   *
   * The Firebase ID token is obtained here, from the live Firebase user, and never
   * passed in by a caller. Contact with the Firebase SDK stays in
   * `lib/firebase-auth.ts`; a screen knows only `{ businessName, name }`.
   *
   * Throws `FirebaseAuthError` when there is no Firebase identity to register, an
   * `ApiError` when the server refuses (`EMAIL_IN_USE`), and whatever the transport
   * raises on a network fault.
   */
  completeFirebaseRegistration: (input: FirebaseRegistrationInput) => Promise<AuthUser>;
  /**
   * True while a `REGISTRATION_REQUIRED` refusal is outstanding — i.e. an identity
   * is authenticated and waiting for a tenant. Armed where the refusal actually
   * happens, so it survives the transition from the login screen to onboarding
   * without a credential (or anything derived from one) travelling through a route
   * parameter. It is in-memory state and is deliberately NOT persisted: a cold
   * start has no Firebase user to register either, so there is nothing to restore.
   */
  firebaseRegistrationRequired: boolean;
  /** Phase 16 - the explicit onboarding state. In-memory; never persisted. */
  firebaseOnboarding: FirebaseOnboarding;
  /** Profile details retained across the verify screen; never a route parameter. */
  pendingRegistration: PendingFirebaseRegistration | null;
  /**
   * AUTH-04-F (Option B) — a safe, one-sentence reason the verification journey was armed
   * after a FAILED initial code request, or `null`. In-memory; shown once on the verify
   * screen and cleared when the person acts.
   */
  verificationEntryError: string | null;
  /**
   * AUTH-04-F (Option B) — clears {@link verificationEntryError}. It never signs anyone in
   * and never touches the durable Firebase identity.
   */
  clearVerificationEntryError: () => void;
  /**
   * WHEN a verification code was last issued during this app run, in ms since epoch, or
   * `null` when none has been.
   *
   * WHY THIS IS CONTEXT STATE RATHER THAN SCREEN STATE. Registration SENDS a code before
   * it navigates to the verify screen, so by the time that screen mounts a code is already
   * in the person's inbox and the server's 60-second per-identity cooldown is already
   * running. The screen could not know either fact, so it opened on "Send verification
   * code" — an enabled button whose only possible outcome was a 429 — and its subtitle
   * asked the person to enter a code it did not admit had been sent. Passing the instant
   * across the navigation fixes both, without persisting anything and without a route
   * parameter. It is in-memory, like the rest of the onboarding state, and cleared when
   * the journey ends: a cold start has no pending send to describe.
   */
  verificationCodeIssuedAt: number | null;
  /**
   * AUTH-04-F — requests a fresh six-digit verification code for the signed-in
   * Firebase identity. Replaces the Phase 16 verification-LINK resend: the code is
   * minted and mailed by the AUTH-04 server flow, and the plaintext code never
   * touches this app.
   *
   * Throws `FirebaseAuthError` when no Firebase identity is present, and the
   * server's `ApiError` (429 with `Retry-After`, 503, 400) for every refusal.
   */
  requestVerificationCode: () => Promise<void>;
  /**
   * AUTH-04-F — submits a six-digit code, and on success completes the journey.
   *
   * THE ORDER IS THE OPERATION: confirm the code with the server, reload Firebase so
   * the address really reads verified, mint a FORCED-refresh token (RG-9), register a
   * pending tenant, exchange, and apply the session. It resolves `null` when Firebase
   * still reports the address unverified after a successful confirm — an ordinary
   * state, not an error — and a wrong/expired/exhausted code propagates the server's
   * single `INVALID_VERIFICATION_CODE` refusal.
   */
  confirmVerificationCode: (code: string) => Promise<AuthUser | null>;
  /**
   * AUTH-04-F — re-runs the READ-ONLY restart/resume probe. Exposed so the
   * unreachable state's Try Again can ask Firebase again without any automatic retry
   * loop. It never signs in, never exchanges, never mints a session and never clears
   * the durable Firebase identity.
   */
  retryVerificationResume: () => Promise<void>;
  /** Phase 16 - abandons the journey: ends Firebase, clears the session, resets state. */
  cancelFirebaseOnboarding: () => Promise<void>;
  signOut: () => Promise<void>;
  signOutEverywhere: () => Promise<void>;
  /**
   * Phase 32L-B — proves the sign-in of the Firebase identity that owns this
   * account, so the server can see a RECENT `auth_time` when the disconnect is
   * asked for.
   *
   * This is NOT a sign-in and deliberately not shaped like one: its outcome has no
   * `legacyFallback`, so a confirmation can never downgrade to the legacy password
   * route, and `wrong-method` is a distinct state meaning "the other option
   * confirms this account". It resolves rather than throwing for the ordinary
   * states (cancelled, wrong method), following `signInWithEmail` and
   * `signInWithGoogle`.
   *
   * It is exposed on the session so a screen can complete the flow's FIRST phase
   * without importing the Firebase SDK — the SDK stays behind this layer.
   */
  confirmFirebaseSignIn: (input: FirebaseConfirmInput) => Promise<ConfirmSignInOutcome>;
  /**
   * Phase A (F-1) — CHANGES this account's FIREBASE password.
   *
   * IT IS NOT A DETACH, AND IT CANNOT BECOME ONE. The account keeps its
   * `firebaseUid`, so it keeps resolving through the exchange and nothing else in the
   * app has to learn a new state; there is deliberately no code path here that could
   * clear the mapping, because clearing it is what produced the detached-identity
   * dead end this phase removes.
   *
   * FIREBASE OWNS THE CREDENTIAL (L-1/L-5), so the change happens there and never in
   * Inventory AI: no local password is created, no `passwordHash` is written, and the
   * server is told only that the credential changed so it can withdraw the sessions
   * minted against the old one.
   *
   * THE SEQUENCE IS THE APPROVED ONE AND ITS ORDER IS LOAD-BEARING: confirm, then
   * `updatePassword`, then a TEMPORARY exchange, then the credential-change bridge,
   * then the FINAL exchange, then `applySession`. Each step depends on the one before
   * it — the confirmation is what gives Firebase a recent `auth_time`; the temporary
   * session exists because the bridge revokes every session including the one it is
   * called with; and the final exchange works because it is PUBLIC and its `iat` is
   * not before the stamp.
   *
   * ONE ATTEMPT PER CALL, on purpose. A freshness refusal is returned as
   * `reauth-required` instead of being retried in here, because its remedy (confirm
   * again, then type the new password again) is the caller's to perform and because
   * retrying in here would hold this attempt's password across a confirmation that
   * can background or kill the app. The caller's second call passes `retry`, which
   * makes the cap the caller cannot exceed.
   *
   * IT DOES NOT CALL `api.logout`: the bridge has already revoked every session
   * server-side, so that request would be a guaranteed 401.
   *
   * Throws `FirebaseAuthError` when no credential could be produced, and the SDK's or
   * the server's own error for every refusal — a Firebase credential that cannot be
   * changed, a rejected token, a disabled account.
   */
  changeFirebasePassword: (
    input: ChangeFirebasePasswordInput,
    options?: ChangeFirebasePasswordOptions
  ) => Promise<ChangeFirebasePasswordOutcome>;
  /**
   * Phase 32M — CONNECTS a verified Google/Firebase identity to THIS account: the
   * mobile half of Phase 32H's linking boundary.
   *
   * IT IS NOT A SIGN-IN, and it shares nothing with `signInWithGoogle` beyond the
   * Firebase consent step. `signInWithGoogle` EXCHANGES the token for a session; this
   * ATTACHES the identity to the session the caller already holds. The Inventory AI
   * token, the session and the signed-in user are unchanged by a successful link
   * except for the account's own `authMethods` capability, which the server returns in
   * the response and this layer applies.
   *
   * The ID token is read here, from the live Firebase user, and never passed in by a
   * caller — so no screen holds a credential. The request carries only `{ idToken }`;
   * the account is the session and the identity is the verified token's uid, so no
   * client-supplied id, uid, businessId or role can steer it, and no email is compared.
   *
   * `linked` is a success, including the idempotent CASE A answer where the server
   * reports `linked: false` because the account already carries this identity. Every
   * real refusal throws the server's `ApiError` (409 conflict, 400 bad provider
   * credential, 403/503) or a `FirebaseAuthError` for a Firebase fault before the
   * request. A 400/409 can never be session loss: the client's session-loss rule keys
   * on 401/403, and the server answers a rejected Firebase token as 400 for that reason.
   */
  connectFirebase: () => Promise<ConnectFirebaseOutcome>;
  refresh: () => Promise<AuthUser | null>;
  clearSession: () => Promise<void>;
  /** AUTH-03 — the fine-grained phase; see {@link AuthPhase}. */
  authPhase: AuthPhase;
  /**
   * AUTH-03 — the true authentication horizon in milliseconds since epoch, or
   * `null` when unknown. It is `min(tokenExpiresAt, sessionExpiresAt)`: the earlier
   * boundary wins, so near the 14-day cap this is the session's expiry even though
   * the freshly renewed token lives longer.
   */
  authHorizonMs: number | null;
}

/**
 * AUTH-03 — the TERMINAL authentication/session codes. Every one of these ends the
 * session, so a screen's `signOut()` or the centralized handler may act on it.
 *
 * `SESSION_EXPIRED` is deliberately NOT here: it is RECOVERABLE, and classifying
 * it as session loss is exactly the behavior AUTH-03 removes. The taxonomy is:
 *
 *   recoverable  SESSION_EXPIRED
 *   terminal     SESSION_REVOKED, SESSION_INVALIDATED, INVALID_TOKEN, AUTH_REQUIRED,
 *                ACCOUNT_DISABLED, FIREBASE_TOKEN_INVALID, FIREBASE_IDENTITY_CONFLICT
 *   transient    FIREBASE_UNAVAILABLE, SESSION_RENEW_RATE_LIMITED, network/timeout
 *   business     BUSINESS_NOT_ACTIVE (preserve auth, block workspace)
 */
export const TERMINAL_SESSION_CODES: ReadonlySet<string> = new Set([
  'SESSION_REVOKED',
  'SESSION_INVALIDATED',
  'INVALID_TOKEN',
  'AUTH_REQUIRED',
  'ACCOUNT_DISABLED',
  'FIREBASE_TOKEN_INVALID',
  'FIREBASE_IDENTITY_CONFLICT',
]);

/** True when a failure means the session is terminally over. */
export function isTerminalSessionError(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  // `code` is read into a local first so the narrowing test is a local `typeof
  // code` check rather than a comparison against the member itself. The Phase 23
  // client-code guard harvests member comparisons against quoted literals, and a
  // member-level type test would be misread as a branch on a quoted word.
  const code: unknown = err.code;
  return typeof code === 'string' && TERMINAL_SESSION_CODES.has(code);
}

/**
 * Errors that mean the stored session is no longer valid.
 *
 * AUTH-03 — CLASSIFICATION IS BY APPLICATION ERROR CODE, never by HTTP status. A
 * plain 401 says nothing about recoverability; `SESSION_EXPIRED` (recoverable) and
 * `SESSION_REVOKED` (terminal) are both 401s. The one fallback that still consults
 * the status is a response that carried NO application code at all (a malformed or
 * legacy refusal), where there is nothing else to classify on.
 */
export function isSessionError(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  if (isRecoverableAuthError(err)) return false;
  if (isTerminalSessionError(err)) return true;
  const code: unknown = err.code;
  return !code && (err.status === 401 || err.status === 403);
}

/** AUTH-03 — proactive renewal fires when the horizon is inside this window. */
const PROACTIVE_RENEWAL_THRESHOLD_MS = 10 * 60 * 1000;

/** AUTH-03 — fallback in-memory backoff when a failure stated no Retry-After. */
const RENEWAL_COOLDOWN_MS = 60 * 1000;

/**
 * AUTH-03 — the client's effective authentication horizon in ms, or `null`.
 *
 * It is the EARLIER of the two boundaries: the JWT's absolute expiry and the
 * Inventory session's 14-day cap. Near the cap the session ends first even though
 * the freshly renewed token lives ~1h longer, so treating the token alone as the
 * horizon would let the client believe it has an hour when the session dies in a
 * minute. The session cap is the hard boundary and renewal never moves it.
 */
function minHorizonMs(tokenExpiresAt: number | null, sessionExpiresAt: number | null): number | null {
  const finite = [tokenExpiresAt, sessionExpiresAt].filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  );
  return finite.length ? Math.min(...finite) : null;
}

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Decodes a base64url segment to a binary string, without `atob`.
 *
 * React Native does not guarantee `atob`/`Buffer`, and this must work identically
 * in the app and under jest, so the decode is done by hand. Only ASCII is needed:
 * the caller scans the result for a numeric `exp` claim.
 */
function base64UrlToBinary(input: string): string {
  const str = input.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  let output = '';
  let buffer = 0;
  let bits = 0;
  for (const ch of str) {
    const idx = B64_CHARS.indexOf(ch);
    if (idx < 0) continue;
    buffer = (buffer << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return output;
}

/**
 * AUTH-03 — the JWT's own absolute `exp`, in ms, or `null`.
 *
 * Used ONLY on boot, to give a RESTORED session a horizon: the server returns
 * `tokenExpiresAt`, but a cold start has only the stored JWT. The value is read
 * without verification because the token was verified by the server when it was
 * issued and is not trusted for anything except scheduling a renewal — an attacker
 * who could forge it could already forge the whole token. Any malformed value
 * yields `null`, which simply disables proactive renewal for that session; recovery
 * on a real `SESSION_EXPIRED` still works.
 */
function tokenExpiryMsFromJwt(token: string): number | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const match = /"exp"\s*:\s*(\d+)/.exec(base64UrlToBinary(parts[1]));
    return match ? Number(match[1]) * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * The label this device will show as in the user's own session list
 * ("Android · Pixel 7"). Purely cosmetic: the server coerces it, never validates
 * it, and never uses it for a decision — so a device that cannot be described
 * still signs in.
 *
 * No dependency is added for this (`expo-device` would be the obvious one).
 * Android is the only platform that exposes a hardware model through
 * `Platform.constants`; elsewhere the OS name is the best honest answer.
 */
function currentDeviceLabel(): string {
  if (Platform.OS === 'android') {
    // Android exposes `Model` at runtime, and React Native declares it in its own
    // Flow types (Libraries/Utilities/PlatformTypes.js), but the published
    // TypeScript `PlatformConstants` shape omits it — so this narrow is the only
    // way to read a value that genuinely exists. Optional chaining is preserved
    // because the original expression used it.
    const constants = Platform.constants as { Model?: string } | undefined;
    const model = constants?.Model;
    return model ? `Android · ${model}` : 'Android device';
  }
  if (Platform.OS === 'ios') return 'iOS device';
  return 'Web browser';
}

// SecureStore is native-only; an in-memory fallback keeps the web target working
// (there the token simply is not persisted across reloads).
const mem: { token: string | null } = { token: null };

async function persistToken(token: string | null): Promise<void> {
  mem.token = token ?? null;
  if (Platform.OS === 'web') return;
  try {
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // Non-fatal: the in-memory copy keeps this launch working.
  }
}

async function readStoredToken(): Promise<string | null> {
  if (Platform.OS === 'web') return mem.token;
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return mem.token;
  }
}

/**
 * D-E1 — the marker that says a durable Firebase sign-out FAILED and must be
 * retried. A second key rather than a field on the token, because the two facts
 * have different lifetimes: the token is cleared BY the sign-out, and this marker
 * is meaningful precisely because the token is gone.
 *
 * WHAT IT IS NOT. Not a credential, token, uid, password, hash or error detail —
 * one bit whose only meaning is "Firebase may still hold a session on this device".
 * Nothing is rendered from it, and the only value ever read is `'1'` — the key's
 * own existence says nothing, because a successful sign-out writes `'0'` rather than
 * removing it.
 */
const FIREBASE_SIGNOUT_PENDING_KEY = 'inventoryai.auth.firebaseSignOutPending';

// The web target's in-memory mirror, exactly as `mem` is for the token: there is no
// native keychain to persist to, so there the marker lives for the launch only.
const memFirebaseSignOutPending = { pending: false };

/**
 * Records whether a durable Firebase sign-out is still outstanding.
 *
 * Quiet on failure, like `persistToken`: the in-memory copy keeps the current launch
 * honest, and a storage fault must never be able to fail a sign-out.
 */
async function persistFirebaseSignOutPending(pending: boolean): Promise<void> {
  memFirebaseSignOutPending.pending = pending;
  if (Platform.OS === 'web') return;
  try {
    // ONE SET of '1'/'0', not a set/delete pair. Both states are meaningful and a
    // write is always truthful, so a successful sign-out never has to guess whether
    // a stale marker exists in order to remove it — which is also what keeps this
    // marker from ever touching the token's own storage entry.
    await SecureStore.setItemAsync(FIREBASE_SIGNOUT_PENDING_KEY, pending ? '1' : '0');
  } catch {
    // Non-fatal: the in-memory copy keeps this launch honest.
  }
}

/** Whether an earlier Firebase sign-out is still outstanding. False on any fault. */
async function readFirebaseSignOutPending(): Promise<boolean> {
  if (Platform.OS === 'web') return memFirebaseSignOutPending.pending;
  try {
    return (await SecureStore.getItemAsync(FIREBASE_SIGNOUT_PENDING_KEY)) === '1';
  } catch {
    return memFirebaseSignOutPending.pending;
  }
}

// ---------------------------------------------------------------------------
// N-4 — the recovery marker
// ---------------------------------------------------------------------------
//
// WHAT IT IS FOR. A Firebase password reset completes entirely inside Firebase, so the
// server never learns of it and the sessions minted against the OLD credential would
// otherwise stay alive until they expired. Recording that change is
// `POST /api/auth/credentials-changed` — and it is AUTHENTICATED, deliberately, so the
// person has to sign in once with the new password before it can be called. This marker is
// how the app knows, at that sign-in, that it must call it: a durable, device-local note
// left by the reset screen, read and consumed by `signIn` below.
//
// IT IS A FLOW SELECTOR AND NEVER A CREDENTIAL. It grants nothing, authorizes nothing and
// is never sent anywhere. The account it describes is still decided entirely server-side
// from the session and the verified uid, so the worst a forged marker can do is ask the
// server to revoke the forger's OWN sessions (see `bridgePendingPasswordReset`).
//
// THE SAME SHAPE AS THE SIGN-OUT MARKER ABOVE (a second SecureStore key, a module-scope
// helper pair, an in-memory mirror for the web target, and a write that is quiet on
// failure), with ONE deliberate difference: clearing REMOVES the key rather than writing
// `'0'`. The sign-out marker writes a negative value because a third party (Firebase) may
// still hold the session it is about, so "cleared" is a fact worth recording; here absence
// is the honest state, because there is no outstanding obligation once the bridge has been
// acknowledged, and the value is a fingerprint rather than a flag.

/** The locked key (design §14C.3.9 M-1). */
const PASSWORD_RESET_PENDING_KEY = 'inventoryai.auth.passwordResetPending';

/**
 * The current stored format's tag, so a future change cannot be misread as a fingerprint.
 * Only the fingerprint is ever returned to a caller — see `parsePasswordResetPending`.
 */
const PASSWORD_RESET_PENDING_VERSION = 'v1';

// The web target's in-memory mirror, exactly as `mem` is for the token.
const memPasswordResetPending: { fingerprint: string | null } = { fingerprint: null };

/**
 * A NON-SECRET fingerprint of the reset account, derived from its email.
 *
 * DELIBERATELY NOT CRYPTOGRAPHIC, and that is a decision rather than a shortcut. The
 * project removed `expo-crypto` in Phase F2 and this phase adds no dependency, and more
 * importantly a cryptographic hash would buy nothing here: the marker is a flow selector
 * whose only effect is to ask the server to revoke THE CALLER'S OWN sessions, the server
 * re-derives the account from the session it issued, and the value never leaves the
 * device. There is no attacker inside this trust boundary to defend against — anyone who
 * can read this key already has the unlocked device — and a collision could at worst make
 * the bridge run for the account that is signing in, which is the account it would have
 * been run for anyway.
 *
 * FNV-1a over the trimmed, lower-cased address, so the same account always produces the
 * same value regardless of how the address was typed. The address ITSELF is never stored.
 */
function accountFingerprint(email: string): string {
  const normalized = email.trim().toLowerCase();
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * The fingerprint a stored value carries, or `null` for absent, malformed or unknown-format
 * values. Fails closed in every direction: an unrecognised value is treated as "no marker",
 * which runs no bridge and consumes nothing.
 */
function parsePasswordResetPending(raw: string | null): string | null {
  if (typeof raw !== 'string') return null;
  const [version, fingerprint] = raw.split(':');
  if (version !== PASSWORD_RESET_PENDING_VERSION) return null;
  return fingerprint && /^[0-9a-f]{8}$/.test(fingerprint) ? fingerprint : null;
}

/**
 * Records (or, with `null`, clears) the marker. Quiet on failure, like `persistToken`.
 *
 * A STORAGE FAULT MUST NOT FAIL THE CALLER, and both callers can afford it: the reset
 * screen is completing a password change that has already happened, and the sign-in is
 * consuming a marker it has already acted on.
 */
async function persistPasswordResetPending(fingerprint: string | null): Promise<void> {
  memPasswordResetPending.fingerprint = fingerprint;
  if (Platform.OS === 'web') return;
  try {
    if (fingerprint) {
      await SecureStore.setItemAsync(
        PASSWORD_RESET_PENDING_KEY,
        `${PASSWORD_RESET_PENDING_VERSION}:${fingerprint}`
      );
    } else {
      await SecureStore.deleteItemAsync(PASSWORD_RESET_PENDING_KEY);
    }
  } catch {
    // Non-fatal: the in-memory copy keeps this launch honest.
  }
}

/** The stored fingerprint, or `null` when no recovery is pending for anyone. */
async function readPasswordResetPending(): Promise<string | null> {
  if (Platform.OS === 'web') return memPasswordResetPending.fingerprint;
  try {
    return parsePasswordResetPending(await SecureStore.getItemAsync(PASSWORD_RESET_PENDING_KEY));
  } catch {
    return memPasswordResetPending.fingerprint;
  }
}

/**
 * Leaves the marker for an account whose password is about to change (N-4).
 *
 * CALLED BEFORE THE PASSWORD CHANGE, NEVER AFTER, and that ordering is the whole
 * guarantee: an interruption at any later point — a crash, a kill, a lost network — still
 * leaves the note behind, so the next sign-in with the new password closes the revocation.
 * Writing it afterwards would leave exactly the window the design forbids, where the
 * credential is new and no revocation is owed by anything.
 *
 * It takes the ADDRESS rather than a fingerprint so the normalisation lives in one place,
 * and the screen never computes a hash. The address is not stored — only its fingerprint.
 */
export async function markPasswordResetPending(email: string): Promise<void> {
  await persistPasswordResetPending(accountFingerprint(email));
}

/**
 * Drops the marker without running a bridge. Used for the one case where the reset
 * DEFINITIVELY did not happen — a code Firebase refused — so no credential change is owed
 * and a later sign-in must not revoke the account's sessions for it.
 */
export async function clearPasswordResetPending(): Promise<void> {
  await persistPasswordResetPending(null);
}

/** `SESSION_INVALIDATED` — the bridge's success-equivalent answer (design §14C.3.9 M-5). */
const SESSION_INVALIDATED = 'SESSION_INVALIDATED';

function isSessionInvalidated(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401 && err.code === SESSION_INVALIDATED;
}

/** What the handoff did, for the caller's own bookkeeping and for the tests. */
type PasswordResetHandoff = 'none' | 'bridged' | 'owed';

/**
 * Runs the N-4 recovery handoff for a sign-in that owes one.
 *
 * THE LOCKED SEQUENCE, and every step of it is load-bearing:
 *
 *   signInWithEmail(email, newPassword)          the caller already did this, so the
 *                                                token below came from a REAL credential
 *                                                sign-in and its signed `auth_time` is
 *                                                fresh — which is what the server's
 *                                                300 s window requires. A refreshed token
 *                                                (`getIdToken(true)`) would move `iat` and
 *                                                leave `auth_time` old, so it is not a
 *                                                substitute and is not used.
 *   → read the marker, and stop unless it is THIS account's (a mismatch must neither
 *     consume the marker nor run the bridge — another account's revocation is not ours)
 *   → POST /api/auth/firebase/exchange       the existing PUBLIC exchange mints the
 *                                            TEMPORARY session
 *   → POST /api/auth/credentials-changed     the bridge, carrying that temporary session
 *                                            and the same fresh ID token
 *   → acknowledge: 2xx, or `401 SESSION_INVALIDATED` (the revocation already happened)
 *     clears the marker; anything else keeps it, because the revocation is still owed and
 *     the next sign-in is the retry
 *   → the CALLER then exchanges once more for the FINAL session and applies only that.
 *
 * THE TEMPORARY SESSION LIVES IN ONE LOCAL VARIABLE. It is never returned, never
 * persisted, never applied and never handed to a screen; it exists to authenticate one
 * request, and the bridge revokes it along with every other session because
 * `revokeAllSessions` has no caller exception. The final session works because its `iat` is
 * not before the stamp the bridge wrote.
 *
 * A THROWN TEMPORARY EXCHANGE PROPAGATES, and that is the honest behaviour: the temporary
 * exchange and the final one are the same endpoint with the same token, so a refusal there
 * is a refusal the sign-in would have met a moment later. The marker survives, so the retry
 * completes the revocation.
 *
 * `owed` and `none` are deliberately NOT errors. The person has already changed their
 * password and signed in successfully; a revocation the server would not accept is ours to
 * retry, not theirs to be blocked on.
 */
async function bridgePendingPasswordReset({
  email,
  idToken,
  deviceLabel,
}: {
  email: string;
  idToken: string;
  deviceLabel: string;
}): Promise<PasswordResetHandoff> {
  const pending = await readPasswordResetPending();
  if (!pending) return 'none';
  if (pending !== accountFingerprint(email)) return 'none';

  const temporary = await api.firebaseExchange({ idToken, deviceLabel });

  try {
    await api.credentialsChanged({ idToken }, temporary.token);
    await persistPasswordResetPending(null);
    return 'bridged';
  } catch (err) {
    if (isSessionInvalidated(err)) {
      await persistPasswordResetPending(null);
      return 'bridged';
    }
    return 'owed';
  }
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading'); // loading | signedOut | signedIn
  // AUTH-03 — the fine-grained phase (see AuthPhase). Separate from `status` so
  // navigation keeps reading the coarse value it always has.
  const [authPhase, setAuthPhase] = useState<AuthPhase>('idle');
  // AUTH-03 — the client's effective horizon, as STATE (not a ref read during
  // render). It is `min(tokenExpiresAt, sessionExpiresAt)`, recomputed whenever a
  // session is applied.
  const [authHorizonMs, setAuthHorizonMs] = useState<number | null>(null);

  // The current token, readable without re-creating callbacks; and whether the
  // server has already refused it, so sign-out knows there is nothing left to
  // revoke. Both are refs because neither should re-render anything.
  const tokenRef = useRef<string | null>(null);
  // AUTH-03 — the current user, readable inside the renewal callback without
  // re-creating it (a renewal keeps the same account).
  const userRef = useRef<AuthUser | null>(null);
  const sessionLostRef = useRef(false);

  // AUTH-03 — the AUTH EPOCH. It is incremented whenever the authentication state
  // is replaced or torn down (a sign-out, or a fresh sign-in/session), and captured
  // by any renewal/recovery before it starts. A response whose captured epoch no
  // longer matches is DISCARDED, which is what stops a slow renewal from
  // resurrecting a session the user has since signed out of, or from overwriting a
  // NEWER session.
  //
  // This — not promise cancellation — is the stale-response protection: clearing
  // the in-flight promise does NOT cancel the underlying network request, only
  // stops new callers sharing it.
  const epochRef = useRef(0);
  // AUTH-03 — single-flight: while a renewal is running, every other caller awaits
  // the SAME promise rather than starting a competing one.
  const renewalPromiseRef = useRef<Promise<string | null> | null>(null);
  // AUTH-03 — the absolute instants the server returned, used to compute the
  // client's horizon and to decide when proactive renewal is due.
  const tokenExpiresAtRef = useRef<number | null>(null);
  const sessionExpiresAtRef = useRef<number | null>(null);
  // AUTH-03 — the in-memory renewal backoff. A transient failure (or a 429 with a
  // Retry-After) suppresses further renewal attempts until the deadline, so a
  // Firebase/network outage cannot turn into a hammering loop.
  const renewalCooldownUntilRef = useRef(0);

  /**
   * Whether the durable Firebase session has ALREADY been ended for the current
   * session loss. One loss is reported by several callers — see `endFirebaseSession`
   * — and this is the claim that makes the native operation happen exactly once.
   */
  const firebaseEndedRef = useRef(false);

  // Phase 16 - the explicit onboarding state. Phase 32J's boolean is now DERIVED from
  // it, so the shipped onboarding screen keeps reading exactly what it always did.
  const [firebaseOnboarding, setFirebaseOnboarding] = useState<FirebaseOnboarding>('none');
  // The profile details collected at signup, held across the verify screen. In-memory
  // and never a route parameter, so no token, uid or email travels through navigation.
  const [pendingRegistration, setPendingRegistration] =
    useState<PendingFirebaseRegistration | null>(null);
  // AUTH-04-F (Option B) — why the verification journey was armed when the INITIAL code
  // request failed during signup. The verify screen shows this once; the person's own
  // actions take over from there. In-memory only, never persisted, and it holds nothing
  // but a safe client-facing sentence: no provider text, uid, email or token.
  const [verificationEntryError, setVerificationEntryError] = useState<string | null>(null);
  // The instant the CURRENT journey's code was issued, in ms. Set by the signup path (which
  // sends before it navigates) and by a resend; cleared whenever the journey ends or starts
  // without a successful send. In-memory only — see `AuthValue.verificationCodeIssuedAt`.
  const [verificationCodeIssuedAt, setVerificationCodeIssuedAt] = useState<number | null>(null);
  const firebaseRegistrationRequired = firebaseOnboarding === 'register';

  // Whether THIS attempt's `firebase/register` call already succeeded, so a retry
  // after a failed EXCHANGE does not create a second business. A ref, not state:
  // it never changes what is rendered, and it must be readable inside the
  // callback without re-creating it.
  //
  // The failure this guards is real and asymmetric — registration returns no
  // token, so the two calls are separate HTTP requests and the first can succeed
  // while the second fails. `firebaseRegister` is not idempotent (it creates a
  // Business and an OWNER), whereas the exchange is (calling it twice with fresh
  // tokens from one live Firebase session opens two sessions, which is what the
  // server documents as intended). So the retry must resume at the exchange.
  const firebaseAccountRegisteredRef = useRef(false);

  /**
   * Phase 32M — the claim that a Connect Google call is running.
   *
   * See `connectFirebase` for why this cannot live in the screen's `busy` state. A ref
   * rather than state because it never changes what is rendered and must be readable
   * inside the callback without re-creating it.
   */
  const connectInFlightRef = useRef(false);

  /**
   * Arms the onboarding route for a refusal that has just happened. Resets the
   * register-completed flag because a NEW sign-in attempt starts a new
   * registration attempt: only a retry of the SAME attempt keeps it.
   */
  const armRegistrationRequired = useCallback((): void => {
    firebaseAccountRegisteredRef.current = false;
    setFirebaseOnboarding('register');
  }, []);

  /**
   * Phase 16 - arms the verification route for an authenticated but UNVERIFIED
   * Firebase identity. `info` is present only on the signup path, where the business
   * name has already been typed and must survive the screen; on a sign-in it is null
   * and the identity's tenant state is discovered from the exchange after verification.
   */
  const armVerificationRequired = useCallback(
    (
      info: PendingFirebaseRegistration | null,
      // AUTH-04-F (Option B) — present only when the INITIAL code request failed. Every
      // other caller (sign-in, Google) passes nothing, which CLEARS any stale reason.
      entryError: string | null = null,
      // The instant this journey's code was sent, when one was. Passed ONLY by the signup
      // path, which mails a code before navigating: the verify screen then opens knowing a
      // code is in flight and how much of the server's cooldown remains. Every other caller
      // omits it, which clears a value left by a previous journey — a sign-in for an
      // unverified identity has not had a code sent for it.
      codeIssuedAt: number | null = null
    ): void => {
      firebaseAccountRegisteredRef.current = false;
      setPendingRegistration(info);
      setVerificationEntryError(entryError);
      setVerificationCodeIssuedAt(codeIssuedAt);
      setFirebaseOnboarding('verify-email');
    },
    []
  );

  /** AUTH-04-F (Option B) — clears the one-shot entry reason once it is shown or acted on. */
  const clearVerificationEntryError = useCallback((): void => {
    setVerificationEntryError(null);
  }, []);

  /**
   * AUTH-03 — applies a session, optionally recording the server's absolute
   * instants and controlling whether this is a NEW authentication epoch.
   *
   * `bumpEpoch` is true for a sign-in/exchange (a new authentication state must
   * invalidate any in-flight renewal) and FALSE for a renewal (which continues the
   * SAME session — bumping there would make a renewal discard its own result).
   */
  const applySession = useCallback(async (
    nextToken: string | null,
    nextUser: AuthUser | null,
    options: { tokenExpiresAt?: string | null; sessionExpiresAt?: string | null; bumpEpoch?: boolean } = {},
  ): Promise<void> => {
    const { tokenExpiresAt = null, sessionExpiresAt = null, bumpEpoch = true } = options;
    await persistToken(nextToken);
    tokenRef.current = nextToken;
    userRef.current = nextUser;
    if (nextToken) sessionLostRef.current = false;
    // A new session may have authenticated a Firebase user again, so the NEXT loss must
    // be able to end it (see `endFirebaseSession`).
    if (nextToken) firebaseEndedRef.current = false;
    if (nextToken && bumpEpoch) epochRef.current += 1;
    tokenExpiresAtRef.current = tokenExpiresAt ? Date.parse(tokenExpiresAt) : null;
    sessionExpiresAtRef.current = sessionExpiresAt ? Date.parse(sessionExpiresAt) : null;
    setAuthHorizonMs(minHorizonMs(tokenExpiresAtRef.current, sessionExpiresAtRef.current));
    // A freshly applied session is healthy again.
    setAuthPhase('idle');
    // Phase 16 - applying OR clearing a session ends any Firebase onboarding. A live
    // session means nothing is waiting any more, and clearing one (a sign-out) must not
    // leave a stale verify-email behind for the next attempt to inherit.
    setFirebaseOnboarding('none');
    setPendingRegistration(null);
    setVerificationEntryError(null);
    setVerificationCodeIssuedAt(null);
    setToken(nextToken);
    setUser(nextUser);
    setStatus(nextToken && nextUser ? 'signedIn' : 'signedOut');
  }, []);

  const clearSession = useCallback(async (): Promise<void> => {
    // AUTH-03 — tearing the session down advances the epoch, so any in-flight
    // renewal's result is discarded rather than resurrecting this session.
    epochRef.current += 1;
    renewalPromiseRef.current = null;
    renewalCooldownUntilRef.current = 0;
    await applySession(null, null, { bumpEpoch: false });
  }, [applySession]);

  /**
   * D-E1 / D-E2 — ends the durable native Firebase session and CONSUMES the outcome
   * `signOutOfFirebase()` reports.
   *
   * IDEMPOTENT PER SESSION LOSS, WHICH IS NOT THE SAME AS PER RESPONSE. Three
   * independent callers reach here for ONE dead session: the centralized handler below,
   * the boot restore's own cleanup, and — because this app has always done it — a
   * screen's `signOut()` from its `onSessionError` / `isSessionError` branch. A screen
   * commonly has two requests in flight as well, so the naive shape asks the native SDK
   * to sign out once per refused response, and on device that was measurably two
   * `signOut` calls for one loss. The first call claims the loss and every later one is
   * a no-op until a NEW session is applied, which clears the claim because a fresh
   * sign-in can have a live Firebase user again.
   *
   * It lives in the component rather than at module scope for exactly that reason: the
   * claim is per Provider instance, so a remount starts clean.
   *
   * WHY THE BOOLEAN IS READ. `signOutOfFirebase` is total by design: it never throws and
   * answers `false` when the native session could not be ended (offline, the native
   * module absent, an SDK fault). Discarding that answer left the one state the P2
   * decision exists to avoid — a persisted Firebase credential on a device whose
   * Inventory AI session has already ended — with no signal at all. The boolean IS the
   * signal: it is persisted as the `FIREBASE_SIGNOUT_PENDING` marker, which
   * `retryPendingFirebaseSignOut` consumes on a later signed-out launch.
   *
   * WHY THERE IS NO USER-FACING ERROR (owner decision D-E1). A failed Firebase sign-out
   * has no action a person could take, and a prompt would say so about a credential they
   * cannot see. Retrying later is the remedy that actually converges.
   *
   * NEVER THROWS, and that is load-bearing: every caller runs it AFTER the Inventory AI
   * session is already gone, so a Firebase failure must not be able to undo that.
   */
  const endFirebaseSession = useCallback(async (): Promise<void> => {
    if (firebaseEndedRef.current) return;
    firebaseEndedRef.current = true;
    const completed = await signOutOfFirebase();
    // `true` also covers "there was nothing to end", which is the same outcome for every
    // caller and must clear a marker left by an earlier failed attempt.
    await persistFirebaseSignOutPending(!completed);
  }, []);

  /**
   * D-E1 — the retry point, and the only one.
   *
   * A launch that resolves to SIGNED OUT is the sole state in which retrying is safe:
   * no live Inventory AI session can be disturbed, and it is exactly the state a previous
   * failed sign-out leaves behind. A signed-in launch deliberately does not retry — the
   * marker is only ever set while signed out, and retrying from a live session would sign
   * the freshly authenticated Firebase user out from under someone.
   */
  const retryPendingFirebaseSignOut = useCallback(async (): Promise<void> => {
    if (!(await readFirebaseSignOutPending())) return;
    await endFirebaseSession();
  }, [endFirebaseSession]);

  // One place decides what a refused token means. Registered here rather than in
  // each screen (see lib/client.ts), so a dead session is handled identically
  // whether it was noticed by a list, a form, or a background refresh.
  //
  // PHASE B ADDS ONE STEP, AND THE ORDER IS THE OPERATION. The Inventory AI session
  // is cleared FIRST — it is authoritative, and the app must return to login whatever
  // Firebase does — and only then is the durable native Firebase session ended,
  // best-effort. Under P2 that second step is no longer optional hygiene: leaving it
  // out would keep a persisted Firebase credential alive on a device whose Inventory
  // AI session the server has already refused, which is the split-brain state the P2
  // decision §6.5 exists to avoid. Clearing first is what keeps the guarantee intact —
  // `signOutOfFirebase` is total and REPORTS its outcome rather than throwing, so a
  // failed or offline Firebase sign-out can never take the Inventory AI sign-out down
  // with it. D-E1: that reported outcome is now CONSUMED (`endFirebaseSession`) rather
  // than discarded, so a failure is recorded for retry on a later signed-out launch
  // instead of leaving an unsignalled durable credential.
  useEffect(() => {
    setSessionLostHandler((err) => {
      if (!isSessionError(err)) return;
      // One loss arrives as SEVERAL refused responses, because a screen commonly has two
      // requests in flight and `lib/client.ts` reports each. The first claims it; the rest
      // are no-ops. `endFirebaseSession` is idempotent for the same reason, so the native
      // sign-out happens once even though a screen's own `signOut()` may also run.
      if (sessionLostRef.current) return;
      sessionLostRef.current = true;
      void (async () => {
        await clearSession();
        await endFirebaseSession();
      })();
    });
    return () => setSessionLostHandler(null);
  }, [clearSession, endFirebaseSession]);

  // ==========================================================================
  // AUTH-03 — session renewal, recovery, and the authentication horizon
  // ==========================================================================

  /**
   * Runs ONE renewal for the current session. Single-flight, epoch-guarded.
   *
   * The epoch is captured before the request and re-checked before the result is
   * applied, and that check is the WHOLE stale-response protection: a sign-out or a
   * new sign-in during the request advances the epoch, so the late result is
   * discarded rather than resurrecting an old session or overwriting a newer one.
   * (Clearing `renewalPromiseRef` does not cancel the request — only stops new
   * callers sharing it — which is why the epoch, not cancellation, is relied on.)
   *
   * Returns the new token on success, or `null` when renewal did not complete.
   * A TERMINAL failure (the session is genuinely over) signs out through the same
   * path every other terminal refusal uses; a TRANSIENT or recoverable-but-failed
   * one preserves the session and marks the phase `degraded`.
   */
  const performRenewal = useCallback(async (): Promise<string | null> => {
    const currentToken = tokenRef.current;
    if (!currentToken) return null;

    // Single-flight: a second caller joins the running operation.
    if (renewalPromiseRef.current) return renewalPromiseRef.current;

    const epochAtStart = epochRef.current;
    const run = (async (): Promise<string | null> => {
      try {
        const idToken = await currentFirebaseIdToken();
        if (!idToken) return null;
        const session = await api.renew(currentToken, { idToken });

        // Stale-response guard: the request already completed, so a sign-out or a
        // new sign-in during it must cause this result to be discarded.
        if (epochRef.current !== epochAtStart) return null;

        await applySession(session.token, session.user ?? userRef.current, {
          tokenExpiresAt: session.tokenExpiresAt ?? null,
          sessionExpiresAt: session.sessionExpiresAt ?? null,
          // A renewal continues the SAME session; only a sign-in starts a new epoch.
          bumpEpoch: false,
        });
        renewalCooldownUntilRef.current = 0;
        return session.token as string;
      } catch (err) {
        if (isSessionError(err)) {
          // Terminal: the session really is over. Sign out via the one path.
          if (epochRef.current === epochAtStart && !sessionLostRef.current) {
            sessionLostRef.current = true;
            await clearSession();
            await endFirebaseSession();
          }
          return null;
        }
        // Recoverable-but-failed, or transient (Firebase unavailable, a renewal
        // rate limit, a network fault): PRESERVE the session and back off. A 429's
        // `Retry-After` is the server's own number and takes precedence.
        const retryAfter = err instanceof ApiError ? err.retryAfter : null;
        renewalCooldownUntilRef.current =
          Date.now() +
          (typeof retryAfter === 'number' && retryAfter > 0
            ? retryAfter * 1000
            : RENEWAL_COOLDOWN_MS);
        setAuthPhase('degraded');
        return null;
      } finally {
        renewalPromiseRef.current = null;
      }
    })();

    renewalPromiseRef.current = run;
    return run;
  }, [applySession, clearSession, endFirebaseSession]);

  /**
   * The pre-request / foreground hook: renew ONLY when the horizon is inside the
   * 10-minute threshold and no backoff is active. Returns the current token when no
   * renewal is due, so a caller can always use the result.
   */
  const renewIfDue = useCallback(
    async (requestToken: string): Promise<string | null> => {
      if (requestToken !== tokenRef.current) return null;
      if (Date.now() < renewalCooldownUntilRef.current) return null;
      const horizon = minHorizonMs(tokenExpiresAtRef.current, sessionExpiresAtRef.current);
      if (horizon === null) return null;
      if (horizon - Date.now() > PROACTIVE_RENEWAL_THRESHOLD_MS) return null;
      setAuthPhase('renewing');
      const renewed = await performRenewal();
      return renewed ?? tokenRef.current;
    },
    [performRenewal],
  );

  // Register the two transport hooks. `lib/client.ts` asks BEFORE a request
  // (proactive renewal) and AFTER a recoverable refusal (recovery + one retry).
  useEffect(() => {
    setSessionRenewalHandler((tok) => renewIfDue(tok));
    setSessionRecoveryHandler(async () => {
      setAuthPhase('renewing');
      return performRenewal();
    });
    return () => {
      setSessionRenewalHandler(null);
      setSessionRecoveryHandler(null);
    };
  }, [performRenewal, renewIfDue]);

  // AUTH-03 — foreground renewal. On a return to the foreground, if a session is
  // live and renewal is due, renew it. ONE listener, removed on unmount; there is
  // deliberately no background timer in this MVP.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      const current = tokenRef.current;
      if (current) void renewIfDue(current);
    });
    return () => subscription.remove();
  }, [renewIfDue]);

  /**
   * Sign in (Phase 32E). Firebase first, then the legacy password route.
   *
   * The branch is exhaustive over `FirebaseSignInOutcome`, so the legacy call is
   * reachable from exactly two states and neither of them is a Firebase fault:
   * this build has no Firebase configuration, or Firebase reported that no
   * identity answers to these credentials. Everything else — a misconfigured
   * project, a disabled Firebase user, a rate limit, a dropped connection, or a
   * token that could not be minted — becomes a `FirebaseAuthError` and the legacy
   * route is NOT tried. That is the whole point of the split: treating a failure
   * as "try the other door" would let anyone who can break Firebase choose the
   * weaker door.
   *
   * A `failure` is thrown rather than returned so the screens' existing error path
   * (`err.message` after `fieldMap`) handles it with no new branch — and it is not
   * an `ApiError`, because nothing here produced an HTTP response.
   *
   * The exchange's response is the same envelope `login` returns, so the session
   * is applied identically whichever route proved the identity. Server-side
   * refusals of the exchange (`REGISTRATION_REQUIRED`, `ACCOUNT_DISABLED`,
   * `BUSINESS_NOT_ACTIVE`, `FIREBASE_TOKEN_INVALID`, `FIREBASE_NOT_CONFIGURED`)
   * propagate as `ApiError`s and are never retried against the legacy route.
   */
  const signIn = useCallback(
    async ({ email, password }: SignInCredentials): Promise<AuthUser> => {
      const deviceLabel = currentDeviceLabel();
      const outcome = await signInWithEmail(email, password);

      if (outcome.kind === 'failure') {
        throw new FirebaseAuthError(outcome.code, outcome.message);
      }

      // Phase 16 - VERIFICATION IS CHECKED BEFORE ANY SERVER CALL. An unverified
      // Firebase identity owns no Inventory AI User, so the exchange would answer the
      // same REGISTRATION_REQUIRED a verified-but-tenant-less identity gets - which
      // would send this person to the business-name screen instead of the verify
      // screen. Firebase's signed `email_verified` state decides; the provider name
      // never does (L-7/RG-11).
      if (outcome.kind === 'idToken') {
        const verified = await readEmailVerified();
        if (!verified) {
          armVerificationRequired(null);
          throw new FirebaseAuthError(FIREBASE_VERIFICATION_REQUIRED, VERIFY_EMAIL_MESSAGE);
        }
      }

      // Phase 32J: a `REGISTRATION_REQUIRED` refusal is not merely printed — it
      // arms the Firebase onboarding route, because the identity that produced it
      // is still signed in to Firebase and is exactly what must be registered.
      // Flagged at the point of refusal so the state exists before any screen
      // handles the error, then rethrown unchanged: this context decides where a
      // user may go next, and the screen still decides what they read.
      let session: ApiResponse;
      try {
        if (outcome.kind === 'idToken') {
          // N-4 — THE RECOVERY HANDOFF, and the ONLY place it runs. A sign-in whose
          // account left a recovery marker goes through the bridge BEFORE the session is
          // applied, because the bridge revokes every session this account holds — the
          // temporary one it authenticates with included — and the session that survives
          // is the one the exchange below mints. `applySession` therefore never sees the
          // temporary token, and the marker is cleared only once the server has
          // acknowledged. A sign-in with no marker (or one belonging to another account)
          // takes the exact path it always took.
          await bridgePendingPasswordReset({ email, idToken: outcome.idToken, deviceLabel });
          session = await api.firebaseExchange({ idToken: outcome.idToken, deviceLabel });
        } else {
          session = await api.login({ email, password, deviceLabel });
        }
      } catch (err) {
        if (isRegistrationRequired(err)) armRegistrationRequired();
        throw err;
      }

      // THE FINAL SESSION AND NOTHING ELSE. `session` is the second exchange's response on
      // the recovery path, so the temporary token minted above cannot reach this line.
      await applySession(session.token, session.user, {
        tokenExpiresAt: session.tokenExpiresAt ?? null,
        sessionExpiresAt: session.sessionExpiresAt ?? null,
      });
      return session.user;
    },
    [applySession, armRegistrationRequired, armVerificationRequired]
  );

  /**
   * Register a business owner (Phase 32E).
   *
   * WITH NO FIREBASE CONFIGURATION this is the pre-32D flow unchanged: the server
   * creates the account and the owner is signed straight in. That branch is what
   * keeps an unconfigured build (the repository today) fully usable, and it is
   * decided from the build's environment rather than from a runtime outcome, so it
   * cannot be reached by anything an attacker does.
   *
   * OTHERWISE the three steps of Phase 32A §8.2 run in order, each through the
   * endpoint that already owns its step: Firebase creates the identity, the server
   * creates the tenant, and the exchange opens the session. No token is issued by
   * `firebaseRegister` — exactly as `POST /api/auth/register` issues none — so the
   * exchange is what signs the new owner in.
   */
  const signUp = useCallback(
    async ({ businessName, name, email, password }: RegisterPayload): Promise<AuthUser | null> => {
      if (!isFirebaseConfigured()) {
        await api.register({ businessName, name, email, password });
        return signIn({ email, password });
      }

      // Phase 16 - NO TENANT BEFORE VERIFICATION (RG-1/RG-3). The identity is created
      // and the server mails a verification code; the Business and the User wait, and
      // so does the exchange. The token minted here is deliberately not carried
      // anywhere: the verify screen reloads the identity and mints a FORCED-REFRESH
      // token (RG-9) once the address is verified, so no cached pre-verification claim
      // is ever presented to the server.
      // AUTH-04-F — the custom six-digit code is REQUESTED where the Phase 16 link was
      // sent, so a registration still lands on the verification screen with a code
      // already in flight. The server mints and mails it; the plaintext never reaches
      // this app.
      const { idToken } = await ensureFirebaseAccount({ email, password, name });
      // The instant the code was accepted, or `null` when the send failed. Recorded here
      // rather than in the arming call inside the `try`, because the journey is armed on
      // BOTH paths by the single call after this block — one place decides the state, and
      // only the timestamp distinguishes "a code is in flight" from "the send failed".
      let codeIssuedAt: number | null = null;
      try {
        await api.requestEmailVerification({ idToken });
        // The send SUCCEEDED, so the code is in flight and the server's 60-second
        // per-identity cooldown is running. Passing the instant lets the verify screen say
        // so and start its countdown, instead of offering a send that could only be refused.
        codeIssuedAt = Date.now();
      } catch (err) {
        // AUTH-04-F (Option B) — THE IDENTITY EXISTS AND IS UNVERIFIED, so the
        // verification journey is armed even though the FIRST send failed. The send is an
        // action WITHIN this journey, not the thing that creates it, and the restart/resume
        // probe already routes this same identity to the verify screen — so arming keeps
        // ONE rule instead of two (in-session vs after restart). Nothing is resent here:
        // retry is the person's own action on the verify screen, where the server's
        // `Retry-After` stays authoritative and "Wrong account? Sign out" is immediately
        // reachable. No tenant, no exchange and no session can appear on this path; the
        // registration context is the SAME in-memory value the success path passes.
        armVerificationRequired({ businessName, name }, verificationSendFailureMessage(err));
        return null;
      }
      armVerificationRequired({ businessName, name }, null, codeIssuedAt);
      return null;
    },
    [armVerificationRequired, signIn]
  );

  /**
   * Complete registration for an already-authenticated Firebase identity
   * (Phase 32J).
   *
   * THE IDENTITY IS READ HERE, NOT ACCEPTED FROM THE CALLER. The only credential
   * involved is a Firebase ID token obtained from the live Firebase user, and it is
   * obtained at the moment of use, inside this callback — so no screen, route
   * parameter, stored value or caller-supplied argument is ever an input to it. A
   * body naming `firebaseUid`, `businessId` or `role` is inert for the same reason
   * on the server: the payload this builds contains only the token, and the server
   * derives the uid and email from the token's verified payload.
   *
   * REGISTRATION AND EXCHANGE ARE SEPARATE STEPS, AND ONLY ONE OF THEM IS
   * REPEATABLE. `firebaseRegister` creates a Business and an OWNER and issues no
   * token, so the exchange is what signs the new owner in — but it is a second
   * request, and it can fail after the first has already succeeded. Re-running
   * registration then would create a second business for the same person, so the
   * ref above records the successful first half and a retry resumes AT the
   * exchange. That is the whole reason the two calls are not simply wrapped in one
   * retry: the recovery differs between them.
   *
   * A 409 `EMAIL_IN_USE` deliberately does NOT set the ref and does NOT touch
   * Firebase: registration was refused, so nothing exists to skip and the identity
   * must not be attached to somebody else's account. The server's refusal is the
   * correct outcome and this function only propagates it.
   */
  const completeFirebaseRegistration = useCallback(
    async ({ businessName, name }: FirebaseRegistrationInput): Promise<AuthUser> => {
      const idToken = await currentFirebaseIdToken();
      if (!idToken) {
        throw new FirebaseAuthError(NO_FIREBASE_IDENTITY, NO_FIREBASE_IDENTITY_MESSAGE);
      }

      if (!firebaseAccountRegisteredRef.current) {
        await api.firebaseRegister({ idToken, businessName, name });
        // Only a RESOLVED call sets this. A refusal leaves it false so the user can
        // correct the input; a network fault leaves it false so the attempt is
        // genuinely repeatable.
        firebaseAccountRegisteredRef.current = true;
      }

      const session = await api.firebaseExchange({
        idToken,
        deviceLabel: currentDeviceLabel(),
      });
      await applySession(session.token, session.user, {
        tokenExpiresAt: session.tokenExpiresAt ?? null,
        sessionExpiresAt: session.sessionExpiresAt ?? null,
      });
      firebaseAccountRegisteredRef.current = false;
      return session.user;
    },
    [applySession]
  );

  /**
   * Sign in with Google (Phase 32I).
   *
   * The Google branch is exhaustive over `GoogleSignInOutcome`, and it is the
   * SAME session path as every other sign-in: a Firebase ID token is exchanged at
   * `POST /api/auth/firebase/exchange` and applied with `applySession`. There is
   * no Google-specific endpoint, token, or session shape — the provider is an
   * implementation detail of how the identity was proved, and the JWT this stores
   * is indistinguishable from a password login's.
   *
   * A cancellation returns `null` WITHOUT touching the network or the session: the
   * user changed their mind, so there is nothing to report and nothing to clear.
   * A failure throws `FirebaseAuthError` (not an `ApiError`) for the same reason
   * `signIn` does — nothing here produced an HTTP response — while a server
   * refusal of the exchange propagates as the `ApiError` it is, so
   * `REGISTRATION_REQUIRED` reaches the login screen unchanged.
   */
  const googleSignIn = useCallback(async (): Promise<AuthUser | null> => {
    const outcome = await firebaseSignInWithGoogle();

    if (outcome.kind === 'cancelled') return null;
    if (outcome.kind === 'failure') {
      throw new FirebaseAuthError(outcome.code, outcome.message);
    }

    // Same Phase 32J arming as `signIn`: Google is the primary way an identity
    // reaches `REGISTRATION_REQUIRED`, and the identity stays signed in to
    // Firebase, so the refusal is what points the user at onboarding.
    // Phase 16 - a Google identity is verified according to Firebase's SIGNED
    // `email_verified` claim, never because the provider is Google (L-7/RG-11), and the
    // check runs BEFORE the exchange for the reason `signIn` records above.
    const googleVerified = await readEmailVerified();
    if (!googleVerified) {
      armVerificationRequired(null);
      throw new FirebaseAuthError(FIREBASE_VERIFICATION_REQUIRED, VERIFY_EMAIL_MESSAGE);
    }

    let session: ApiResponse;
    try {
      session = await api.firebaseExchange({
        idToken: outcome.idToken,
        deviceLabel: currentDeviceLabel(),
      });
    } catch (err) {
      if (isRegistrationRequired(err)) armRegistrationRequired();
      throw err;
    }

    await applySession(session.token, session.user, {
        tokenExpiresAt: session.tokenExpiresAt ?? null,
        sessionExpiresAt: session.sessionExpiresAt ?? null,
      });
    return session.user;
  }, [applySession, armRegistrationRequired, armVerificationRequired]);

  /**
   * Sign out (Phase 26A). The server session is revoked FIRST, so the token stops
   * working everywhere immediately, and the local session is cleared whatever the
   * server answers — someone who taps "Sign out" on a plane is still signed out
   * on this device.
   *
   * If the token has already been refused by the server (revoked here or from
   * another device) there is nothing left to revoke, so the request is skipped
   * instead of being sent to collect a guaranteed 401.
   *
   * `all` ends every session the user has open, this one included ("sign out
   * everywhere", the same route with `{ all: true }`).
   *
   * The durable Firebase session is ended too. Under owner decision P2 a native
   * Firebase session OUTLIVES the process, so this is no longer hygiene: leaving it
   * live would keep a credential on a device whose Inventory AI session the server has
   * just revoked, which is the split-brain state P2 §6.5 exists to avoid. It runs
   * AFTER `clearSession`, so the Inventory AI sign-out is complete whatever Firebase
   * does, and its reported outcome is consumed rather than discarded (D-E1) — a failure
   * is recorded for retry on a later signed-out launch and never surfaced as an error.
   */
  const endSession = useCallback(
    async ({ all = false }: { all?: boolean } = {}): Promise<void> => {
      const current = tokenRef.current;
      const alreadyLost = sessionLostRef.current;
      sessionLostRef.current = false;
      if (current && !alreadyLost) {
        try {
          await api.logout(current, { all });
        } catch {
          // Offline, or the session ended between the tap and the request. The
          // local sign-out proceeds either way — the server is the authority on
          // whether the session is really gone.
        }
      }
      await clearSession();
      // Phase 32J / Phase 16: signing out abandons any half-finished onboarding, and
      // the Firebase user it belonged to is about to be signed out of too. The
      // onboarding state is reset here as well as in `applySession` so this path does
      // not depend on the two staying in step.
      firebaseAccountRegisteredRef.current = false;
      setFirebaseOnboarding('none');
      setPendingRegistration(null);
      setVerificationEntryError(null);
      setVerificationCodeIssuedAt(null);
      await endFirebaseSession();
    },
    [clearSession, endFirebaseSession]
  );

  const signOut = useCallback((): Promise<void> => endSession(), [endSession]);
  const signOutEverywhere = useCallback((): Promise<void> => endSession({ all: true }), [endSession]);

  /**
   * Phase 32L-B — the thin pass-through a screen's FIRST phase calls.
   *
   * It adds nothing to the Firebase module's outcome, and that is the point: the
   * module decides what a Firebase fault means, and this layer only makes it
   * reachable without a screen importing the SDK. The token it produces is
   * deliberately discarded — `changeFirebasePassword` reads the live Firebase user
   * instead, so no credential ever sits in a component's state.
   */
  const confirmFirebaseSignIn = useCallback(
    (input: FirebaseConfirmInput): Promise<ConfirmSignInOutcome> => firebaseConfirmSignIn(input),
    []
  );

  /**
   * Phase A (F-1) — the Firebase password change, with the retry cap built in.
   *
   * THREE PROPERTIES THIS FUNCTION EXISTS TO GUARANTEE:
   *
   * 1. THE CREDENTIAL CHANGES AT FIREBASE AND NOWHERE ELSE. `updatePassword` is the
   *    one call that mutates authority, and it runs against the live Firebase session.
   *    This flow writes NOTHING to MongoDB — no hash, no field — so there is no second
   *    credential for the two systems to disagree about.
   *
   * 2. THE IDENTITY IS NEVER DETACHED. `firebaseUid` is neither read, written nor
   *    cleared here, and no call in this sequence can clear it. The account keeps
   *    resolving through the exchange, which is what makes an interruption
   *    recoverable: someone cut off half-way simply signs in again with the new
   *    password, because the mapping that resolves them is still in place.
   *
   * 3. NO LOOP, AND NO PASSWORD CARRIED ACROSS A CONFIRMATION. One attempt is made per
   *    call: a freshness refusal is handed back to the caller, which confirms again and
   *    collects a NEW password before calling a second time. `retry` is what closes the
   *    loop — the second call's refusal propagates instead of being handed back.
   *
   * A LIVE FIREBASE SESSION IS ESTABLISHED, NOT ASSUMED. The screen normally confirms
   * first, so a live user already exists; a cold start has none, and `updatePassword`
   * is a user-scoped operation that cannot run without one. The confirmation is
   * therefore performed when there is no current user rather than trusted.
   */
  const changeFirebasePassword = useCallback(
    async (
      { method, email, password, newPassword }: ChangeFirebasePasswordInput,
      { retry = false }: ChangeFirebasePasswordOptions = {}
    ): Promise<ChangeFirebasePasswordOutcome> => {
      /** Confirm from scratch, and throw rather than return when it does not take. */
      const forceConfirmation = async (): Promise<string> => {
        const outcome = await firebaseConfirmSignIn({ method, email, password });
        if (outcome.kind === 'idToken') return outcome.idToken;
        throw confirmationError(outcome);
      };

      // STEP 1 — a live, recent Firebase session. `currentFirebaseIdToken()` answers
      // null when there is none (or when the refresh failed), which is the only
      // condition under which the confirmation is performed here.
      let idToken = await currentFirebaseIdToken();
      if (!idToken) idToken = await forceConfirmation();

      // STEP 2 — THE CREDENTIAL CHANGE. Ordered BEFORE the bridge because the bridge's
      // whole purpose is to record a change that has already happened; reversing them
      // would revoke every session for a password that never changed.
      try {
        await nativeUpdatePassword(newPassword);
      } catch (err) {
        // FIREBASE'S OWN RECENCY RULE, answered with the same remedy as the server's:
        // not a failure to retry, an instruction to prove the sign-in again. Mapped
        // here rather than in the screen so both recency refusals travel one path.
        if (nativeErrorCode(err) === 'auth/requires-recent-login' && !retry) {
          return { kind: 'reauth-required' };
        }
        throw err;
      }

      // Minted AFTER the change so the token the server sees belongs to the credential
      // as it now stands. `auth_time` is unchanged by `updatePassword` — it is the
      // CONFIRMATION's — which is exactly the freshness the bridge reads.
      idToken = (await currentFirebaseIdToken()) ?? idToken;

      try {
        // STEPS 3 AND 4 — a TEMPORARY session, then the bridge. The temporary session
        // exists because the bridge revokes EVERY session the account holds, this one
        // included: holding the app's real token across it would destroy the app's own
        // session in the request that destroys the others, and a 401 from it would be
        // read as session loss. `temporarySession: true` in `lib/api.ts` is truthful
        // precisely because this token is never applied to the app.
        const temporary = await api.firebaseExchange({
          idToken,
          deviceLabel: currentDeviceLabel(),
        });
        await api.credentialsChanged({ idToken }, temporary.token);
      } catch (err) {
        // A freshness refusal is the CALLER's to answer, handed back rather than
        // retried here for the reason the type records. A `retry` refusal is
        // terminal — that is the cap.
        if (!isReauthenticationRequired(err) || retry) throw err;
        return { kind: 'reauth-required' };
      }

      // STEP 5 — THE FINAL SESSION, and nothing else. The exchange is PUBLIC, so the
      // revocation above cannot block it, and its `iat` is not before the stamp the
      // bridge wrote, so `requireAuth` admits it.
      const session = await api.firebaseExchange({
        idToken,
        deviceLabel: currentDeviceLabel(),
      });
      await applySession(session.token, session.user, {
        tokenExpiresAt: session.tokenExpiresAt ?? null,
        sessionExpiresAt: session.sessionExpiresAt ?? null,
      });
      return { kind: 'changed' };
    },
    [applySession]
  );

  /**
   * Phase 32M — attaches a Google/Firebase identity to the signed-in account.
   *
   * THE ORDER IS FIREBASE FIRST, AND IT IS FORCED. The credential must exist before
   * there is anything to attach, so the consent step runs first and only its token
   * authorises a request. A cancellation therefore ends the operation having sent
   * nothing and changed nothing.
   *
   * A REFUSAL TEARS NOTHING DOWN LOCALLY, and that is deliberate rather than an
   * omission. The device may now hold a durable Firebase session for an identity the
   * server declined to associate, but every path that ends the Inventory AI session
   * already ends the Firebase session too (`endSession`, the centralized session-loss
   * handler, and the boot restore's own cleanup), and nothing in between consults a
   * restored Firebase user — there is no auth-state listener and the boot path never
   * exchanges one. Ending it here as well would mean writing the sign-out-pending marker
   * from a second place, which the D-E1 decision deliberately keeps to `endFirebaseSession`'s
   * one consumer. A 401/403 here would still be acted on as session loss; a 400 and a 409
   * are not, so the caller stays signed in and may retry.
   *
   * THE RESPONSE IS APPLIED RATHER THAN RE-FETCHED. The server answers with the account
   * as it now stands (`toPublicUser`), so `authMethods.firebase` is already true in the
   * payload. Applying it is both the accurate state and one request fewer than a
   * `refresh()` round-trip, and it is what removes the Connect action the moment it has
   * succeeded. A `linked: false` (CASE A) answer carries the same account and is treated
   * as the success it is: either way this account can now sign in with Google.
   *
   * THE IN-FLIGHT GUARD IS NOT THE SCREEN'S. A screen disables its button while busy,
   * but a duplicate tap, a double-invoked handler or a second screen reading the same
   * session would otherwise open a second consent sheet and send a second link request.
   * The claim is taken for the call's duration and released in a `finally`, so a failure
   * cannot leave it stuck, and the loser is told so as an OUTCOME rather than by throwing
   * — "a connection is already running" is not an error the person caused.
   *
   * It deliberately does not touch `firebaseRegistrationRequired`: nothing here reaches
   * the exchange, so no `REGISTRATION_REQUIRED` can arise.
   */
  const connectFirebase = useCallback(async (): Promise<ConnectFirebaseOutcome> => {
    const session = tokenRef.current;
    if (!session) {
      throw new FirebaseAuthError(NO_SESSION_CODE, NO_SESSION_MESSAGE);
    }

    if (connectInFlightRef.current) return { kind: 'in-flight' };
    connectInFlightRef.current = true;

    try {
      const outcome = await firebaseSignInWithGoogle();
      if (outcome.kind === 'cancelled') return { kind: 'cancelled' };
      if (outcome.kind === 'failure') {
        throw new FirebaseAuthError(outcome.code, outcome.message);
      }

      const result = await api.firebaseLink(session, { idToken: outcome.idToken });
      if (result?.user) setUser(result.user);
      return { kind: 'linked' };
    } finally {
      connectInFlightRef.current = false;
    }
  }, []);

  /** Re-validate the current token against /api/auth/me and refresh the user. */
  const refresh = useCallback(async (): Promise<AuthUser | null> => {
    if (!token) {
      setUser(null);
      setStatus('signedOut');
      return null;
    }
    try {
      const { user: fresh } = await api.me(token);
      setUser(fresh);
      setStatus('signedIn');
      return fresh;
    } catch (err) {
      if (isSessionError(err)) {
        await clearSession();
        return null;
      }
      // AUTH-03 — a NON-TERMINAL failure must never destroy a still-valid session.
      // The token and user are kept; the phase records that the refresh could not
      // complete (DEGRADED), so the UI can reflect it without signing anyone out.
      // This replaces the old "any non-session error means signed out" behavior,
      // which destroyed a valid session on a transient network fault.
      setAuthPhase('degraded');
      return null;
    }
  }, [token, clearSession]);

  // Restore the session exactly once on boot. The Inventory AI JWT is the ONLY thing
  // consulted: a restored native Firebase `currentUser` never signs anyone in, is never
  // exchanged, and there is no auth-state listener anywhere in this file.
  useEffect(() => {
    let active = true;
    void (async () => {
      const stored = await readStoredToken();
      if (!stored) {
        if (active) {
          tokenRef.current = null;
          setToken(null);
          setUser(null);
          setStatus('signedOut');
        }
        // D-E1 — a SIGNED-OUT launch is the retry point for a Firebase sign-out that
        // previously failed. It runs AFTER the signed-out state is set, so a slow or
        // offline retry cannot delay the login screen, and it is a no-op when nothing
        // is outstanding.
        if (active) await retryPendingFirebaseSignOut();
        // AUTH-04-F — the READ-ONLY restart/resume probe. It runs AFTER the pending
        // sign-out retry so a completed sign-out is never mistaken for a live unverified
        // identity, and it sets ONLY the in-memory onboarding state: nothing durable is
        // written, nothing is exchanged and no session can appear.
        const resume = await probeVerificationResume();
        if (active) setFirebaseOnboarding(resume);
        return;
      }
      try {
        const { user: fresh } = await api.me(stored);
        if (active) {
          // Restored without going through applySession (the token is already
          // persisted), so the refs signOut reads must be set here too.
          tokenRef.current = stored;
          userRef.current = fresh;
          sessionLostRef.current = false;
          firebaseEndedRef.current = false;
          // AUTH-03 — give the restored session a horizon from the token's own
          // `exp`, so proactive renewal works after a cold start. The session cap
          // is unknown until the next renewal; the token `exp` alone is a safe
          // lower bound (renewing early never hurts).
          tokenExpiresAtRef.current = tokenExpiryMsFromJwt(stored);
          setAuthHorizonMs(tokenExpiresAtRef.current);
          setToken(stored);
          setUser(fresh);
          setStatus('signedIn');
        }
      } catch (err) {
        if (isSessionError(err)) {
          await persistToken(null);
          // D-E2 — the boot path ends the durable Firebase session EXPLICITLY rather
          // than relying on which React effect happened to run first. It calls the one
          // consumer unconditionally: for a 401/403 that travelled through
          // `lib/client.ts` the centralized handler has already claimed the loss and
          // this is a no-op, and when the refusal did NOT come through the handler this
          // is the call that performs the cleanup. The idempotency lives in
          // `endFirebaseSession` rather than in a condition here, so there is one rule
          // to reason about instead of two.
          await endFirebaseSession();
        }
        if (active) {
          tokenRef.current = null;
          setToken(null);
          setUser(null);
          setStatus('signedOut');
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [endFirebaseSession, retryPendingFirebaseSignOut]);

  /**
   * AUTH-04-F — requests a fresh six-digit code for the signed-in Firebase identity.
   *
   * THE IDENTITY IS READ HERE, at the moment of use, and never passed in by a caller, so
   * no screen holds a credential. A missing identity is a FirebaseAuthError; every server
   * refusal (429 with Retry-After, 503, 400) propagates as the ApiError it is, which is
   * what lets the screen render the cooldown from the server's own number.
   */
  const requestVerificationCode = useCallback(async (): Promise<void> => {
    const idToken = await currentFirebaseIdToken();
    if (!idToken) {
      throw new FirebaseAuthError(NO_FIREBASE_IDENTITY, NO_FIREBASE_IDENTITY_MESSAGE);
    }
    await api.requestEmailVerification({ idToken });
    // Recorded only after the call RESOLVES: a refusal sent nothing, so it must not start
    // a countdown the screen would then present as "a code was sent".
    setVerificationCodeIssuedAt(Date.now());
  }, []);

  /**
   * AUTH-04-F — the confirm action on the verify screen, replacing the Phase 16
   * "I have verified - continue" link check.
   *
   * ORDER IS THE OPERATION, and every step is load-bearing:
   *
   *   1. The Firebase identity is read here, at the moment of use, never passed in.
   *   2. THE CODE IS CONFIRMED SERVER-SIDE. A wrong, expired, exhausted or absent code
   *      is the server's ONE INVALID_VERIFICATION_CODE refusal and propagates unchanged
   *      — nothing is reloaded and no token is minted for a failed confirm.
   *   3. RELOAD, so Firebase itself reports the address verified: the Admin write
   *      changed Firebase's record, not this device's cached copy.
   *   4. RG-9 FORCED REFRESH. A cached token can still carry `email_verified:false`, so
   *      only a token minted AFTER the reload may be presented to register/exchange.
   *   5. Register a pending tenant when signup left one, then exchange, then apply.
   *
   * It resolves `null` when Firebase still reports the address unverified after a
   * successful confirm — an ORDINARY state, not an error — so nothing throws for it.
   */
  const confirmVerificationCode = useCallback(
    async (code: string): Promise<AuthUser | null> => {
      const confirmToken = await currentFirebaseIdToken();
      if (!confirmToken) {
        throw new FirebaseAuthError(NO_FIREBASE_IDENTITY, NO_FIREBASE_IDENTITY_MESSAGE);
      }

      let verifiedByConfirm = false;
      try {
        await api.confirmEmailVerification({ idToken: confirmToken, code });
      } catch (err) {
        // NO DEAD END AFTER A CONSUMED CODE.
        //
        // The server CONSUMES the challenge as part of a successful confirmation
        // (`usedAt`), so a failure AFTER that write — the reload below, the forced
        // refresh, registration, the exchange, or just this response being lost — leaves
        // the person holding a code the server will now refuse as invalid. Retrying the
        // same code could only ever produce "that code is invalid or has expired", and
        // requesting a new one would be a silent no-op, because an already-verified
        // identity short-circuits the request path without sending anything. The one
        // state the screen could not escape was the state it created itself.
        //
        // So before reporting the refusal, ask FIREBASE — the authority the whole flow
        // exists to update — whether this identity is now verified. If it is, the code
        // did its job and the journey continues exactly as it would have on the success
        // path; if it is not, or the check itself fails, the original refusal stands.
        //
        // This cannot turn a wrong code into a sign-in: Firebase's signed
        // `email_verified` state is what the server and the exchange re-check, and a
        // forged or unverified identity still gets no session. It only stops a spent
        // code from stranding someone who has already done what was asked.
        const alreadyVerified = await readEmailVerified().catch(() => false);
        if (!alreadyVerified) throw err;
        // Already known, so the reload below is skipped rather than repeated.
        verifiedByConfirm = true;
      }

      const verified = verifiedByConfirm || (await readEmailVerified());
      if (!verified) return null;

      let idToken: string | null;
      try {
        idToken = await nativeForceIdToken();
      } catch (err) {
        throw new FirebaseAuthError(nativeErrorCode(err), NO_FIREBASE_TOKEN_MESSAGE);
      }
      if (!idToken) throw new FirebaseAuthError(null, NO_FIREBASE_TOKEN_MESSAGE);

      const deviceLabel = currentDeviceLabel();
      try {
        if (pendingRegistration && !firebaseAccountRegisteredRef.current) {
          await api.firebaseRegister({
            idToken,
            businessName: pendingRegistration.businessName,
            name: pendingRegistration.name,
          });
          firebaseAccountRegisteredRef.current = true;
        }
        const session: ApiResponse = await api.firebaseExchange({ idToken, deviceLabel });
        await applySession(session.token, session.user, {
          tokenExpiresAt: session.tokenExpiresAt ?? null,
          sessionExpiresAt: session.sessionExpiresAt ?? null,
        });
        firebaseAccountRegisteredRef.current = false;
        return session.user;
      } catch (err) {
        if (isRegistrationRequired(err)) armRegistrationRequired();
        throw err;
      }
    },
    [applySession, armRegistrationRequired, pendingRegistration]
  );

  /**
   * AUTH-04-F — re-runs the READ-ONLY restart/resume probe. The unreachable state's
   * Try Again calls this; it is user-initiated, never an automatic loop, and it can only
   * ever set the in-memory onboarding state.
   */
  const retryVerificationResume = useCallback(async (): Promise<void> => {
    // The probe is READ-ONLY and describes a COLD START, so any earlier send belongs to a
    // journey this probe is replacing: forget it rather than let a stale countdown describe
    // a code this launch never sent.
    setVerificationCodeIssuedAt(null);
    setFirebaseOnboarding(await probeVerificationResume());
  }, []);

  /**
   * Phase 16 - abandons the verification journey: ends the durable Firebase session and
   * clears the local session (there is none), which also resets the onboarding state.
   */
  const cancelFirebaseOnboarding = useCallback(async (): Promise<void> => {
    await endFirebaseSession();
    await clearSession();
  }, [clearSession, endFirebaseSession]);

  const value = useMemo<AuthValue>(    () => ({
      user,
      token,
      status,
      signIn,
      signUp,
      completeFirebaseRegistration,
      firebaseRegistrationRequired,
      firebaseOnboarding,
      pendingRegistration,
      verificationEntryError,
      clearVerificationEntryError,
      verificationCodeIssuedAt,
      requestVerificationCode,
      confirmVerificationCode,
      retryVerificationResume,
      cancelFirebaseOnboarding,
      signInWithGoogle: googleSignIn,
      signOut,
      signOutEverywhere,
      confirmFirebaseSignIn,
      changeFirebasePassword,
      connectFirebase,
      refresh,
      clearSession,
      authPhase,
      authHorizonMs,
    }),
    [
      user,
      token,
      status,
      authPhase,
      authHorizonMs,
      signIn,
      signUp,
      completeFirebaseRegistration,
      firebaseRegistrationRequired,
      firebaseOnboarding,
      pendingRegistration,
      verificationEntryError,
      clearVerificationEntryError,
      verificationCodeIssuedAt,
      requestVerificationCode,
      confirmVerificationCode,
      retryVerificationResume,
      cancelFirebaseOnboarding,
      googleSignIn,
      signOut,
      signOutEverywhere,
      confirmFirebaseSignIn,
      changeFirebasePassword,
      connectFirebase,
      refresh,
      clearSession,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useSession(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useSession must be used within an AuthProvider');
  return ctx;
}

export default AuthProvider;
