import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import * as api from './api';
import type { ApiResponse, RegisterPayload } from './api';
import { ApiError, setSessionLostHandler } from './client';
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
 * Phase 32L-B — the one unlink refusal that is an INSTRUCTION, not a verdict.
 *
 * The server refuses with this when the Firebase authentication behind the
 * request is older than its 300 s window. Nothing is wrong with the account and
 * nothing was mutated; the caller simply has to prove the sign-in again and ask
 * once more. It is a 409 precisely so it cannot be mistaken for a dead session
 * (see `lib/client.ts`), and it is the ONLY unlink refusal this layer retries.
 */
const REAUTHENTICATION_REQUIRED = 'FIREBASE_REAUTHENTICATION_REQUIRED';

/** True for the recoverable unlink refusal, and for nothing else. */
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
 * A disconnect request (Phase 32L-B): ONE attempt's inputs, and nothing carried
 * between attempts.
 *
 * `newPassword` is the credential that will own the account afterwards, and it is
 * validated by the SERVER's shared password validator — anything checked here is
 * a courtesy to the person typing, never a control.
 */
export interface DisconnectFirebaseInput extends FirebaseConfirmInput {
  newPassword: string;
}

/**
 * What ONE disconnect attempt produced.
 *
 * `reauth-required` is not a failure and not an error: the server refused only
 * because the Firebase authentication behind the request was older than its 300 s
 * window, and it mutated nothing. It is RETURNED rather than handled here because
 * its remedy needs the person — a confirmation they complete, and a new password
 * they type again — and because handling it here would mean finishing the flow with
 * the credential this call was handed still in scope. The caller re-confirms and
 * calls again with a password it collected afterwards.
 */
export type DisconnectFirebaseOutcome =
  | { kind: 'unlinked' }
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
export interface DisconnectFirebaseOptions {
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

/** The value exposed by {@link useSession}. */
export interface AuthValue {
  user: AuthUser | null;
  token: string | null;
  status: AuthStatus;
  signIn: (credentials: SignInCredentials) => Promise<AuthUser>;
  signUp: (input: RegisterPayload) => Promise<AuthUser>;
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
   * Phase 32L-B — DETACHES this account's Firebase identity and establishes a new
   * local password, in the order the Phase 32L freeze requires.
   *
   * THE ORDERING IS THE OPERATION: the server is asked first and only a 200
   * authorises anything local. A confirmation is (re)obtained when there is no live
   * one, ONE unlink request is sent, and the answer is reported back as an outcome.
   * On success the Firebase session is ended and the local session cleared, which
   * returns the app to login where the new password works.
   *
   * ONE ATTEMPT PER CALL, on purpose. A `FIREBASE_REAUTHENTICATION_REQUIRED` refusal
   * is returned as `reauth-required` instead of being retried in here, because its
   * remedy (confirm again, then type the new password again) is the caller's to
   * perform and because retrying in here would mean holding this attempt's password
   * across a confirmation that can background or kill the app. The caller's second
   * call passes `retry`, which makes the cap the caller cannot exceed.
   *
   * It deliberately does NOT call `api.logout`: a successful unlink has already
   * revoked every session server-side, so that request would be a guaranteed 401.
   *
   * Throws `FirebaseAuthError` when a confirmation produced no token, and the
   * server's `ApiError` for every refusal it can return — including the two
   * TERMINAL 409s, `FIREBASE_IDENTITY_NOT_LINKED` and `FIREBASE_IDENTITY_CONFLICT`,
   * which are never retried.
   */
  disconnectFirebase: (
    input: DisconnectFirebaseInput,
    options?: DisconnectFirebaseOptions
  ) => Promise<DisconnectFirebaseOutcome>;
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
}

/** Errors that mean the stored session is no longer valid. */
export function isSessionError(err: unknown): boolean {
  if (err instanceof ApiError) {
    return err.status === 401 || (err.status === 403 && err.code === 'ACCOUNT_DISABLED');
  }
  return false;
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

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading'); // loading | signedOut | signedIn

  // The current token, readable without re-creating callbacks; and whether the
  // server has already refused it, so sign-out knows there is nothing left to
  // revoke. Both are refs because neither should re-render anything.
  const tokenRef = useRef<string | null>(null);
  const sessionLostRef = useRef(false);

  /**
   * Whether the durable Firebase session has ALREADY been ended for the current
   * session loss. One loss is reported by several callers — see `endFirebaseSession`
   * — and this is the claim that makes the native operation happen exactly once.
   */
  const firebaseEndedRef = useRef(false);

  // Phase 32J: an identity is authenticated and waiting for a tenant.
  const [firebaseRegistrationRequired, setFirebaseRegistrationRequired] = useState(false);

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
    setFirebaseRegistrationRequired(true);
  }, []);

  const applySession = useCallback(async (nextToken: string | null, nextUser: AuthUser | null): Promise<void> => {
    await persistToken(nextToken);
    tokenRef.current = nextToken;
    if (nextToken) sessionLostRef.current = false;
    // A new session may have authenticated a Firebase user again, so the NEXT loss must
    // be able to end it (see `endFirebaseSession`).
    if (nextToken) firebaseEndedRef.current = false;
    // A live session means nothing is waiting for a tenant any more, whichever
    // path produced it.
    if (nextToken) setFirebaseRegistrationRequired(false);
    setToken(nextToken);
    setUser(nextUser);
    setStatus(nextToken && nextUser ? 'signedIn' : 'signedOut');
  }, []);

  const clearSession = useCallback(async (): Promise<void> => {
    await applySession(null, null);
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

      // Phase 32J: a `REGISTRATION_REQUIRED` refusal is not merely printed — it
      // arms the Firebase onboarding route, because the identity that produced it
      // is still signed in to Firebase and is exactly what must be registered.
      // Flagged at the point of refusal so the state exists before any screen
      // handles the error, then rethrown unchanged: this context decides where a
      // user may go next, and the screen still decides what they read.
      let session: ApiResponse;
      try {
        session =
          outcome.kind === 'idToken'
            ? await api.firebaseExchange({ idToken: outcome.idToken, deviceLabel })
            : await api.login({ email, password, deviceLabel });
      } catch (err) {
        if (isRegistrationRequired(err)) armRegistrationRequired();
        throw err;
      }

      await applySession(session.token, session.user);
      return session.user;
    },
    [applySession, armRegistrationRequired]
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
    async ({ businessName, name, email, password }: RegisterPayload): Promise<AuthUser> => {
      if (!isFirebaseConfigured()) {
        await api.register({ businessName, name, email, password });
        return signIn({ email, password });
      }

      const { idToken } = await ensureFirebaseAccount({ email, password, name });
      await api.firebaseRegister({ idToken, businessName, name });
      const { token: nextToken, user: nextUser } = await api.firebaseExchange({
        idToken,
        deviceLabel: currentDeviceLabel(),
      });
      await applySession(nextToken, nextUser);
      return nextUser;
    },
    [applySession, signIn]
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
      await applySession(session.token, session.user);
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

    await applySession(session.token, session.user);
    return session.user;
  }, [applySession, armRegistrationRequired]);

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
      // Phase 32J: signing out abandons any half-finished onboarding, and the
      // Firebase user it belonged to is about to be signed out of too. Clearing
      // here as well as in `applySession` is not redundant — `clearSession` passes
      // no token, so it cannot clear this itself.
      firebaseAccountRegisteredRef.current = false;
      setFirebaseRegistrationRequired(false);
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
   * deliberately discarded — `disconnectFirebase` reads the live Firebase user
   * instead, so no credential ever sits in a component's state.
   */
  const confirmFirebaseSignIn = useCallback(
    (input: FirebaseConfirmInput): Promise<ConfirmSignInOutcome> => firebaseConfirmSignIn(input),
    []
  );

  /**
   * Phase 32L-B — the server-first disconnect, with the retry cap built in.
   *
   * THREE PROPERTIES THIS FUNCTION EXISTS TO GUARANTEE:
   *
   * 1. A 200 is the ONLY thing that produces a local teardown, and the Firebase
   *    session is ended AFTER that 200 — never before. Ending it earlier would
   *    leave the person signed out of Firebase while Inventory AI still holds the
   *    mapping, which is the split-brain the freeze's sequence exists to avoid.
   *
   * 2. NO LOOP, AND NO PASSWORD CARRIED ACROSS A CONFIRMATION. One attempt is made
   *    per call: a freshness refusal is handed back to the caller, which confirms
   *    again and collects a NEW password before calling a second time — so the
   *    credential this frame was given is out of scope long before the second
   *    confirmation runs. `retry` is what closes the loop: the second call's refusal
   *    propagates instead of being handed back, so there is no third attempt. The
   *    retry must also NOT re-send the token it just used: the refusal is a statement
   *    about that token's `auth_time`, so resending it would be refused identically,
   *    which is why the caller confirms afresh and `forceConfirmation` is called with
   *    no fallback to the cached token.
   *
   * 3. NO DOOMED REQUEST. `sessionLostRef` is set before the central sign-out, so
   *    `endSession` skips `api.logout`. The server revoked every session in the
   *    same transition as the unlink, so there is nothing left to revoke and the
   *    request could only collect a 401.
   *
   * The cached token is preferred for the FIRST attempt because the flow is
   * reauth-first: the screen has usually just confirmed, so a live Firebase user
   * already exists and its token carries the confirmation's `auth_time`. A cold
   * start — or a screen that skipped its first phase — has no such user, and
   * `forceConfirmation` then performs the confirmation itself.
   */
  const disconnectFirebase = useCallback(
    async (
      { method, email, password, newPassword }: DisconnectFirebaseInput,
      { retry = false }: DisconnectFirebaseOptions = {}
    ): Promise<DisconnectFirebaseOutcome> => {
      const session = tokenRef.current;
      if (!session) {
        throw new FirebaseAuthError(NO_SESSION_CODE, NO_SESSION_MESSAGE);
      }

      /** Confirm from scratch, and throw rather than return when it does not take. */
      const forceConfirmation = async (): Promise<string> => {
        const outcome = await firebaseConfirmSignIn({ method, email, password });
        if (outcome.kind === 'idToken') return outcome.idToken;
        throw confirmationError(outcome);
      };

      /** The already-confirmed token when there is one; a fresh confirmation otherwise. */
      const confirmedOrExisting = async (): Promise<string> =>
        (await currentFirebaseIdToken()) ?? (await forceConfirmation());

      try {
        await api.firebaseUnlink(session, { idToken: await confirmedOrExisting(), newPassword });
      } catch (err) {
        // A freshness refusal is the CALLER's to answer, and it is handed back rather
        // than retried here for two reasons at once: the remedy is a second
        // confirmation plus a new password, which only the caller can ask for, and
        // performing that confirmation inside this frame would keep `newPassword`
        // alive across it. A `retry` refusal is terminal — that is the cap.
        if (!isReauthenticationRequired(err) || retry) throw err;
        return { kind: 'reauth-required' };
      }

      // Reached only on 200. The session the server just revoked is marked lost so
      // the central sign-out does not chase it, then the single sign-out path ends
      // the Firebase session and clears local state — in that order.
      sessionLostRef.current = true;
      await signOut();
      return { kind: 'unlinked' };
    },
    [signOut]
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
      } else {
        // Server unreachable / transient — do not drop a still-valid token.
        setUser(null);
        setStatus('signedOut');
      }
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
        return;
      }
      try {
        const { user: fresh } = await api.me(stored);
        if (active) {
          // Restored without going through applySession (the token is already
          // persisted), so the refs signOut reads must be set here too.
          tokenRef.current = stored;
          sessionLostRef.current = false;
          firebaseEndedRef.current = false;
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

  const value = useMemo<AuthValue>(
    () => ({
      user,
      token,
      status,
      signIn,
      signUp,
      completeFirebaseRegistration,
      firebaseRegistrationRequired,
      signInWithGoogle: googleSignIn,
      signOut,
      signOutEverywhere,
      confirmFirebaseSignIn,
      disconnectFirebase,
      connectFirebase,
      refresh,
      clearSession,
    }),
    [
      user,
      token,
      status,
      signIn,
      signUp,
      completeFirebaseRegistration,
      firebaseRegistrationRequired,
      googleSignIn,
      signOut,
      signOutEverywhere,
      confirmFirebaseSignIn,
      disconnectFirebase,
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
