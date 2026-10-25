// Signing a measurement probe into a DEPLOYED server the way the app does.
//
// WHY THIS IS NEEDED AT ALL. `perf:turns` used to mint its own session — a `jti`, a signed access
// token and the server-side session row it names — which is the right instrument against a LOCAL
// server, because it shares that server's database and `JWT_SECRET`. Neither is available for the
// deployed one: the production secret is not on a laptop (correctly), so a locally minted token is
// refused there. What IS available is what the phone uses: the public Firebase web API key and the
// test account's password. So the probe signs in through Firebase's own REST endpoint and exchanges
// the ID token at `POST /api/auth/firebase/exchange`, which is the production authentication path
// exercised end to end rather than simulated.
//
// WHAT IS NEVER DONE HERE: no secret is printed, no token is echoed (not on success, not in an
// error message), and no credential is written to a file. The password comes from the environment;
// the API key is public by definition — it ships inside every build — but it is still passed in,
// never logged.
//
// NOTHING RUNS ON IMPORT: two functions, no top-level call, no network at module load.

/** Firebase's password sign-in endpoint. The key goes in the query string, as documented. */
const SIGN_IN_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword';

/**
 * Sign in with email and password, and return the ID token.
 *
 * The error message names the provider's own code (`INVALID_LOGIN_CREDENTIALS`,
 * `EMAIL_NOT_FOUND`, `TOO_MANY_ATTEMPTS_TRY_LATER`, …) because that is what tells an operator
 * whether the password is wrong or the identity does not exist. It never includes the response
 * body wholesale, in case a future field holds something that should not reach a log.
 */
export async function signInWithPassword({ apiKey, email, password, fetchImpl = fetch }) {
  if (!apiKey) throw new Error('the Firebase web API key is required to sign in over HTTP');
  if (!email || !password) throw new Error('both an email and a password are required');

  const res = await fetchImpl(`${SIGN_IN_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });

  let body;
  try {
    body = await res.json();
  } catch {
    // A non-JSON error page is still a failure; `body` stays undefined and is reported as one.
  }

  if (!res.ok || typeof body?.idToken !== 'string') {
    const code = body?.error?.message;
    throw new Error(
      `Firebase sign-in failed${code ? `: ${code}` : ''} (HTTP ${res.status})` +
        `${code === 'EMAIL_NOT_FOUND' ? ' — the seeded identity does not exist in this Firebase project' : ''}`,
    );
  }

  return {
    idToken: body.idToken,
    localId: typeof body.localId === 'string' ? body.localId : null,
    expiresInSeconds: Number(body.expiresIn) || 0,
  };
}

/**
 * Exchange a verified Firebase ID token for an Inventory AI access token.
 *
 * This is the application's own route, unmodified: the exchange resolves the user by `firebaseUid`
 * only and issues the ordinary session the phone would get. The response is the same shape
 * `POST /api/auth/login` returns, so `token` is what `Authorization: Bearer …` needs.
 */
export async function exchangeForAccessToken({ baseUrl, idToken, deviceLabel, fetchImpl = fetch }) {
  const res = await fetchImpl(`${String(baseUrl).replace(/\/+$/, '')}/api/auth/firebase/exchange`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken, deviceLabel }),
  });

  let body;
  try {
    body = await res.json();
  } catch {
    // As above: no JSON body means the exchange was refused, not that it succeeded.
  }

  if (!res.ok || typeof body?.token !== 'string') {
    const code = body?.error?.code ?? body?.code ?? `HTTP ${res.status}`;
    const message = body?.error?.message ?? body?.message ?? 'no message';
    throw new Error(`the Firebase exchange was refused: ${code} — ${message}`);
  }

  return { token: body.token, expiresIn: body.expiresIn ?? null, user: body.user ?? null };
}

export default { signInWithPassword, exchangeForAccessToken };
