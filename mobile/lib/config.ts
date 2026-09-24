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
 * Only ever a plain HTTP(S) URL — no credentials or secrets belong here.
 */
function defaultBaseUrl(): string {
  if (Platform.OS === 'android') return 'http://10.0.2.2:4000';
  return 'http://localhost:4000';
}

const raw: string = process.env.EXPO_PUBLIC_API_URL || defaultBaseUrl();

export const API_URL: string = raw.replace(/\/+$/, '');

export const REQUEST_TIMEOUT_MS = 15000;

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
