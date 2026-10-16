import { Platform } from 'react-native';

/**
 * Backend API base URL.
 *
 * The URL is configurable at build/start time via the EXPO_PUBLIC_API_URL env
 * var (see `.env.example`). When unset we fall back to the local development
 * server address for the platform — Android emulators reach the host machine
 * through 10.0.2.2, everything else uses localhost. Physical devices should
 * set EXPO_PUBLIC_API_URL to the machine's LAN address.
 *
 * A LOOPBACK VALUE HERE IS A PHONE TALKING TO ITSELF, and that is the single most
 * confusing state this project has produced: on 2026-10-16 a physical phone was
 * running a dev build whose `mobile/.env` named loopback, every request failed
 * instantly, and the app reported "Cannot reach the server" — which was true and
 * useless, since the address it named was the device in the member's hand. The
 * value is left exactly as configured; `lib/client.ts` makes the *message* say so
 * instead, in a development build only.
 *
 * Only ever a plain HTTP(S) URL — no credentials or secrets belong here.
 */
function defaultBaseUrl(): string {
  if (Platform.OS === 'android') return 'http://10.0.2.2:4000';
  return 'http://localhost:4000';
}

const raw: string = process.env.EXPO_PUBLIC_API_URL || defaultBaseUrl();

export const API_URL: string = raw.replace(/\/+$/, '');

/**
 * The ordinary budget for one request, once the server is known to be awake.
 *
 * DEP-2 narrowed what this constant MEANS rather than changing it: it is the
 * budget a request gets while `lib/client.ts` can see that the server answered
 * something recently (see `SERVER_WARM_WINDOW_MS`). A request made when the server
 * has not answered recently gets `COLD_START_TIMEOUT_MS` instead, because the
 * deployed host needs longer than this to answer its first request after it has
 * been idle — measured, not assumed, and the reason is recorded on that constant.
 */
export const REQUEST_TIMEOUT_MS = 15000;

/**
 * The budget for a request made while the server has NOT been proven awake
 * recently — in practice, the first request of a session (DEP-2).
 *
 * WHY THIS EXISTS, in measurements rather than opinion. The deployed free-tier
 * instance holds a request while it boots: on 2026-10-16 its first byte arrived at
 * **32 369 ms** after an idle period (and 32 440 ms in an earlier reading) against
 * **194 ms** warm, with TCP completing in 52 ms and TLS in 87 ms — so the wait is
 * the host, not the network. The client's single 15 s budget therefore aborted a
 * request the server was still going to answer, on every first request of every
 * session, and reported it as an unreachable server.
 *
 * It also removes a correctness hazard that has nothing to do with politeness: a
 * request the client abandoned at 15 s can still complete on the server, so a
 * member could be told a stock movement failed while the inventory records it.
 * Waiting long enough to hear the real answer is what makes the reply trustworthy.
 *
 * It is spent only when the wait can be needed, and the cost of being wrong is a
 * longer wait rather than a wrong answer — an unreachable host fails this budget
 * immediately (no connection to hold open), so this is not a 60 s stall on a
 * network outage in practice.
 */
export const COLD_START_TIMEOUT_MS = 60000;

/**
 * How long one answered request keeps the client assuming the server is awake.
 *
 * MUST STAY BELOW THE HOST'S OWN IDLE-SLEEP THRESHOLD. Render's free instances
 * sleep after 15 minutes without a request, so a window at or above that would
 * let the client decide a *sleeping* server is awake, apply the 15 s budget to a
 * request that cannot be answered in 15 s, and recreate the exact defect this
 * pair of constants removes. `__tests__/dep2-client-connectivity.test.ts` asserts
 * that relationship rather than trusting it to stay true.
 */
export const SERVER_WARM_WINDOW_MS = 5 * 60 * 1000;

/**
 * The wall-clock budget for ONE assistant turn (AI-1).
 *
 * The assistant is the one route whose server side can legitimately take tens of
 * seconds: the backend bounds a whole turn with `AI_TURN_DEADLINE_MS` (60 s by
 * default) because the model may need several tool rounds before it can answer.
 * Applying the global 15 s budget to it meant the phone aborted a request the
 * server was still answering — a measured WORKING answer took 13 283 ms, 88 % of
 * that budget — and then reported the abort to the user as "Cannot reach the
 * server", which was untrue (ISS-21, root cause RC-1).
 *
 * The margin over the server's deadline absorbs the response write and the two
 * message rows persisted after the model answers. This value must stay ABOVE
 * `AI_TURN_DEADLINE_MS`: `__tests__/ai1-turn-time-budget.test.ts` reads the
 * server's own default out of its source and fails if it does not.
 */
export const AI_REQUEST_TIMEOUT_MS = 75000;

/**
 * Firebase client configuration (Phase 32D).
 *
 * These four values are CLIENT configuration, never secrets. Firebase's own
 * threat model treats the API key as a public project identifier, and it is
 * expected to ship inside the app bundle — the genuinely secret credential is
 * the service account, which lives only on the server (Phase 32B) and must never
 * appear in this file. Phase 32A §13.1 / §17.2.
 *
 * DOT NOTATION IS LOAD-BEARING. Expo's CLI inlines `EXPO_PUBLIC_*` references at
 * build time by substituting the literal `process.env.NAME` expression. Bracket
 * access (`process.env['NAME']`) and destructuring (`const { NAME } = process.env`)
 * are deliberately NOT inlined, so a table-driven lookup over these names would
 * compile to `undefined` in a real bundle while still passing every Jest test —
 * Jest runs against a genuine `process.env`, so it cannot see the difference.
 * The four reads below are written out longhand for that reason, and
 * `__tests__/firebase.test.ts` pins that they stay that way.
 *
 * An unset variable yields `''` rather than `undefined`, so `isFirebaseConfigured`
 * has one shape to test rather than two.
 */
export const FIREBASE_API_KEY: string = (process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '').trim();
export const FIREBASE_AUTH_DOMAIN: string = (
  process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || ''
).trim();
export const FIREBASE_PROJECT_ID: string = (
  process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || ''
).trim();
export const FIREBASE_APP_ID: string = (process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '').trim();

/**
 * Whether Firebase is configured, all-or-nothing (Phase 32D decision 7).
 *
 * `true` only when all four values are present and non-empty. A partial
 * configuration is treated exactly like no configuration at all: Firebase stays
 * disabled and initializes nothing. Half-configured Firebase is not a degraded
 * mode worth supporting — it would fail later, deeper, and less legibly (the SDK
 * reports a missing `authDomain` only when a sign-in is attempted), so the
 * boundary refuses to start instead.
 *
 * This function is deliberately SDK-free. It is pure environment inspection, so
 * a caller can ask whether Firebase is available without importing the Firebase
 * SDK — and without pulling it into that module's bundle graph.
 */
export function isFirebaseConfigured(): boolean {
  return Boolean(
    FIREBASE_API_KEY && FIREBASE_AUTH_DOMAIN && FIREBASE_PROJECT_ID && FIREBASE_APP_ID,
  );
}

/**
 * Google OAuth client IDs (Phase 32I).
 *
 * CLIENT configuration, never secrets — the same standing as the Firebase values
 * above. Google issues one client ID per platform, and which one is used is
 * selected at runtime by {@link googleClientId}. They are read longhand for the
 * same reason the Firebase values are: Expo inlines only the literal
 * `process.env.NAME` expression, so a table-driven lookup would compile to
 * `undefined` in a real bundle while passing every Jest test.
 *
 * An unset variable yields `''`, matching the Firebase convention.
 */
export const GOOGLE_WEB_CLIENT_ID: string = (process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '').trim();
export const GOOGLE_ANDROID_CLIENT_ID: string = (
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || ''
).trim();
export const GOOGLE_IOS_CLIENT_ID: string = (
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || ''
).trim();

/**
 * The Google client ID to use on the current platform.
 *
 * Android and iOS each fall back to the web client ID when their own is unset,
 * so a single configured client is still usable while a platform-specific one is
 * preferred when present. Returns `''` when nothing is configured.
 */
export function googleClientId(): string {
  if (Platform.OS === 'ios') return GOOGLE_IOS_CLIENT_ID || GOOGLE_WEB_CLIENT_ID;
  if (Platform.OS === 'android') return GOOGLE_ANDROID_CLIENT_ID || GOOGLE_WEB_CLIENT_ID;
  return GOOGLE_WEB_CLIENT_ID;
}

/**
 * Whether Google Sign-In is configured for this build.
 *
 * Deliberately SDK-free, exactly like {@link isFirebaseConfigured}: a screen can
 * ask whether to offer the button without importing the Firebase or Google SDK.
 */
export function isGoogleConfigured(): boolean {
  return Boolean(googleClientId());
}
