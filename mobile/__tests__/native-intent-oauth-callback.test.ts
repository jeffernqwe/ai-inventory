/**
 * Phase 32I-Z — `app/+native-intent.ts`, Router's OAuth callback interception.
 *
 * Phase 32I-Y proved on the OPPO F11 Pro that Expo AuthSession completes the whole
 * Google sign-in (callback → PKCE exchange → Firebase → `/api/auth/firebase/exchange`
 * 403) while Expo Router independently consumes the SAME URL and pushes its built-in
 * "Unmatched Route" — unmounting the login screen and discarding the app's own result.
 *
 * The fix is a `redirectSystemPath` hook that returns `null` for the callback only.
 * The library's runtime gate (`expo-router/build/link/linking.js`) calls its listener
 * `if (href)`, so a falsy return keeps Router from navigating at all while
 * `WebBrowser.openAuthSessionAsync` — which registers its own `Linking` listener and
 * never consults Router — continues to resolve the OAuth flow untouched.
 *
 * These tests pin the HOOK'S DECISION SURFACE: which URLs are ignored, and that
 * everything else is returned verbatim. Two properties are load-bearing and are
 * asserted directly rather than by description:
 *
 *   1. The callback is NEVER rewritten into a route. Returning a string would restore
 *      exactly the navigation this phase removes, so `null` is the only acceptable
 *      answer for every callback shape — including the initial-URL path.
 *   2. The match is NARROW. `inventoryai://reset-password` (the Phase 27 password-recovery
 *      deep link) and any ordinary route must pass through byte-identically, and a path
 *      that merely CONTAINS the segment must not be swallowed — an "ignore all deep
 *      links" hook would pass a careless reading of (1) while breaking (2).
 *
 * The query strings below are obviously fake placeholders: no real authorization code,
 * `state` or `iss` value is needed to decide this, and none is used.
 */

import { redirectSystemPath } from '../app/+native-intent';

/** Lookalike query string — the shape of the callback, none of its real values. */
const CALLBACK_QUERY = '?state=FAKE_STATE&iss=https://accounts.google.com&code=FAKE_CODE&scope=openid';

/** The redirect registered by `googleRedirectUri()` and observed on device. */
const NATIVE_CALLBACK = 'com.inventoryai.app:/oauthredirect';

function run(path: string, initial = false): string | null {
  return redirectSystemPath({ path, initial }) as string | null;
}

describe('the OAuth callback is ignored, never routed', () => {
  it('★ ignores the exact native callback that Google actually delivered', () => {
    // The single most important case: this is the value in the Phase 32I-Y
    // ActivityTaskManager START intent, verbatim apart from its query string.
    expect(run(NATIVE_CALLBACK)).toBeNull();
  });

  it('★ ignores it with the real callback query string attached', () => {
    expect(run(`${NATIVE_CALLBACK}${CALLBACK_QUERY}`)).toBeNull();
  });

  it('ignores it on the initial-URL path as well (cold start by the callback)', () => {
    expect(run(`${NATIVE_CALLBACK}${CALLBACK_QUERY}`, true)).toBeNull();
    expect(run(NATIVE_CALLBACK, true)).toBeNull();
  });

  it('ignores every other callback shape Router could hand it', () => {
    for (const path of [
      NATIVE_CALLBACK,
      `${NATIVE_CALLBACK}/`,
      `${NATIVE_CALLBACK}#fragment`,
      'com.inventoryai.app://oauthredirect',
      'com.inventoryai.app://oauthredirect?code=FAKE_CODE',
      'inventoryai://oauthredirect',
      'inventoryai://oauthredirect?code=FAKE_CODE',
      '/oauthredirect',
      'oauthredirect',
    ]) {
      expect(run(path)).toBeNull();
    }
  });

  it('★ never rewrites the callback into an application route', () => {
    // A string return would re-create the Phase 32I-Y defect: Router would resolve a
    // path and, for a target with no screen, push "Unmatched Route" over the login
    // screen. `null` is the whole fix.
    for (const path of [NATIVE_CALLBACK, `${NATIVE_CALLBACK}${CALLBACK_QUERY}`, 'inventoryai://oauthredirect']) {
      expect(typeof run(path)).not.toBe('string');
    }
  });

  it('does not swallow a path that merely CONTAINS the segment', () => {
    // Guards the specificity of the match: only a trailing, boundary-aligned
    // `oauthredirect` segment is the callback.
    expect(run('/oauthredirect/foo')).toBe('/oauthredirect/foo');
    expect(run('com.inventoryai.app:/oauthredirect/foo')).toBe('com.inventoryai.app:/oauthredirect/foo');
  });
});

describe('every other deep link is returned unchanged', () => {
  it('★ leaves the password-reset deep link byte-identical', () => {
    // Phase 27's `inventoryai://reset-password`, which shares the app's first scheme
    // with nothing OAuth-related. It must survive this hook untouched.
    expect(run('inventoryai://reset-password')).toBe('inventoryai://reset-password');
    expect(run('inventoryai://reset-password?token=FAKE_TOKEN')).toBe(
      'inventoryai://reset-password?token=FAKE_TOKEN'
    );
    expect(run('exp+inventory-ai://reset-password?token=FAKE_TOKEN')).toBe(
      'exp+inventory-ai://reset-password?token=FAKE_TOKEN'
    );
  });

  it('leaves ordinary route and scheme paths untouched', () => {
    for (const path of [
      '/',
      '/login',
      '/register',
      '/forgot-password',
      '/dashboard',
      '/products/abc',
      'inventoryai://profile',
      'com.inventoryai.app:/login',
      'exp+inventory-ai://expo-development-client/?url=http%3A%2F%2F192.168.1.4%3A8081',
    ]) {
      expect(run(path)).toBe(path);
    }
  });

  it('leaves a reset link untouched on the initial-URL path too', () => {
    expect(run('inventoryai://reset-password?token=FAKE_TOKEN', true)).toBe(
      'inventoryai://reset-password?token=FAKE_TOKEN'
    );
  });
});
