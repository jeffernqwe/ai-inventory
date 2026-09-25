import type { NativeIntent } from 'expo-router';

/**
 * `app/+native-intent.ts` — Phase 32I-Z. Expo Router's ONE link-processing hook.
 *
 * WHY THIS FILE EXISTS
 *
 * The Google OAuth callback `com.inventoryai.app:/oauthredirect` is a CONTROL-FLOW
 * URL, not a navigation destination. Expo AuthSession and Expo Router both subscribe
 * to React Native's `Linking` `'url'` event, so from Phase 32I-N until this phase the
 * callback was delivered to BOTH: AuthSession completed the whole sign-in behind the
 * scenes while Router independently tried to treat the same URL as a route, found no
 * `/oauthredirect` screen, and pushed its built-in "Unmatched Route" view.
 *
 * Phase 32I-Y measured the consequence on the OPPO F11 Pro: the flow reached
 * `POST /api/auth/firebase/exchange` (403, an Inventory AI application-layer answer)
 * and the app process survived — but the user saw "Unmatched Route", and Router's
 * navigation UNMOUNTED the login screen, discarding the app's own result. Pressing
 * Back revealed a clean login screen with no error, so the server's real answer was
 * unreachable through the UI.
 *
 * WHAT THIS HOOK CHANGES
 *
 * Router resolves `app/+native-intent.*` at the top level of the route directory
 * (`getLinkingConfig.js`) and calls `redirectSystemPath` for every incoming URL on
 * both the initial-URL path (`initial: true`) and the runtime `'url'` listener
 * (`initial: false`).
 *
 * The runtime gate is what makes this fix exact rather than clever —
 * `expo-router/build/link/linking.js`:
 *
 *     if (href && nativeLinking?.redirectSystemPath) {
 *         href = await nativeLinking.redirectSystemPath({ path: href, initial: false });
 *     }
 *     if (href) {
 *         listener(href);            // ← reached ONLY when href is truthy
 *     }
 *
 * Returning a falsy value therefore keeps Router's own listener from being invoked
 * at all: no route is resolved, no "Unmatched Route" is pushed, and the app stays on
 * the screen it was on. This is the library's documented contract too —
 * `NativeIntent.redirectSystemPath` states that "when a falsy value is returned (for
 * example, `null`), no redirection occurs and the app stays on the current path".
 *
 * WHY THIS DOES NOT INTERFERE WITH AUTHENTICATION
 *
 * This hook gates ROUTER's subscription only. `WebBrowser.openAuthSessionAsync`
 * registers its OWN `Linking.addEventListener('url', redirectHandler)` and resolves
 * its promise from it (`expo-web-browser/build/WebBrowser.js`), which is reached
 * through `AuthRequest.js` — it never consults Router. So the callback is still
 * delivered to AuthSession exactly as before; the only behaviour removed is the
 * spurious navigation on top of it. The sign-in itself is untouched.
 *
 * WHY THE MATCH IS THIS NARROW (Phase 32I-Z §6)
 *
 * Only the final path segment `oauthredirect` is intercepted, and only when it sits
 * at a segment boundary (after `:` or `/`, or at the start). Nothing else is
 * rewritten and no URL is redirected anywhere: the password-reset deep link
 * `inventoryai://reset-password`, the second configured scheme, and every ordinary
 * route flow through unchanged. There is deliberately no "ignore all deep links"
 * behaviour — that would silently break reset-password and every future link.
 *
 * COLD-START BEHAVIOUR (`initial: true`)
 *
 * Returning `null` also makes `getInitialURL()` resolve `null` when the app is cold
 * started BY the callback, so the app boots at its normal root instead of landing on
 * an unmatched route. A cold-started AuthSession cannot be resumed anyway: the PKCE
 * `code_verifier` lives in the terminated process's memory, so there is no flow to
 * preserve and the honest result is the ordinary entry screen. This ordering was
 * measured in Phase 32I-Y: the observed run was NOT a cold start (same PID either
 * side), and this branch exists for the terminated case alone.
 */

/** The OAuth callback's final path segment. Pinned by `googleRedirectUri()`. */
const OAUTH_CALLBACK_SEGMENT = 'oauthredirect';

/**
 * The URL with its query string and fragment discarded.
 *
 * The callback arrives carrying `state`, `code`, `iss`, `scope` and `authuser`; only
 * the path decides whether this is our callback, so nothing after `?` or `#` is
 * inspected — and nothing about it is retained, logged or compared.
 */
function pathnameOf(path: string): string {
  const stop = path.search(/[?#]/);
  return stop === -1 ? path : path.slice(0, stop);
}

/**
 * True when the URL targets the OAuth redirect path and nothing else.
 *
 * Accepts every shape the callback can take — `<scheme>:/oauthredirect` (the form
 * actually observed on device in Phase 32I-Y), `<scheme>://oauthredirect`, a bare
 * `/oauthredirect`, and a trailing-slash variant — while rejecting
 * `inventoryai://reset-password` and any path that merely CONTAINS the segment
 * (e.g. `/oauthredirect/foo`). The comparison is exact-case: the value is one we
 * register ourselves, so being strict costs nothing and keeps the match specific.
 */
function isOAuthCallback(pathname: string): boolean {
  const withoutTrailingSlash = pathname.replace(/\/+$/, '');
  return new RegExp(`(?:^|[/:])${OAUTH_CALLBACK_SEGMENT}$`).test(withoutTrailingSlash);
}

/**
 * Router's link-processing hook. Returns `null` to make Router ignore the URL, or
 * the URL unchanged to let Router route it exactly as it would have without this
 * file.
 *
 * Deliberately total: it performs only string work and cannot throw, because the
 * library warns that a throw here can crash the app. A non-string `path` (which the
 * API does not produce) is treated as uninterpretable and ignored rather than routed,
 * since the safe failure mode for a control-flow URL is "stay put", never "navigate
 * somewhere unexpected".
 */
export const redirectSystemPath: NonNullable<NativeIntent['redirectSystemPath']> = ({ path }) => {
  if (typeof path !== 'string') return null;
  return isOAuthCallback(pathnameOf(path)) ? null : path;
};
