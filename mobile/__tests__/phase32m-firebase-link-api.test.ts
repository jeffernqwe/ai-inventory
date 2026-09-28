/**
 * Phase 32M — the `firebaseLink` API wrapper's contract.
 *
 * THE BODY IS THE SECURITY-RELEVANT PART. `POST /api/auth/firebase/link` derives
 * both sides of the linkage server-side — the account from the caller's session and
 * the identity from the verified ID token — so the request is allowed to carry one
 * field and nothing else. Asserting `toEqual({ idToken })` alone would pass a body
 * that also carried a `userId`, a `businessId`, a `role` or an email, so the key
 * COUNT is asserted too: a client that started describing the linkage would fail
 * here rather than silently relying on the server to keep ignoring it.
 *
 * The second claim is Phase 32H's 400-not-401 decision, verified from the client's
 * side of it. The server answers a rejected provider credential as 400 precisely so
 * it cannot be read as a dead session, and `lib/client.ts` reports session loss only
 * for a tokened 401/403. Both directions are asserted — the 400 does NOT fire the
 * handler, and a 401 DOES — so the negative case is proved to be about the status
 * rather than about a handler that is never wired at all.
 *
 * `lib/config` is mocked because `lib/api.ts` reads its URL and timeout from it.
 */

import { firebaseLink } from '../lib/api';
import { setSessionLostHandler } from '../lib/client';

jest.mock('../lib/config', () => ({
  API_URL: 'http://localhost:4000',
  REQUEST_TIMEOUT_MS: 15000,
}));

/** The two arguments `apiFetch` passes to `fetch`, so the mock's calls are typed. */
interface FetchInit {
  method: string;
  headers: Record<string, string>;
  body: string;
}

const ID_TOKEN = 'fake.id.token';
const APP_TOKEN = 'session.jwt';

/** Installs a `fetch` that answers one status and body. */
function respondWith(status: number, json: unknown) {
  const fetchMock = jest.fn(async (_url: string, _init: FetchInit) => ({
    status,
    json: async () => json,
  }));
  global.fetch = fetchMock as unknown as typeof global.fetch;
  return fetchMock;
}

describe('firebaseLink', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    setSessionLostHandler(null);
  });

  it('POSTs ONLY the ID token to the link endpoint, with the session token as the bearer credential', async () => {
    const fetchMock = respondWith(200, { linked: true, user: { id: 'u1' } });

    await firebaseLink(APP_TOKEN, { idToken: ID_TOKEN });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:4000/api/auth/firebase/link');
    expect(init.method).toBe('POST');
    // The caller's own session is what proves ownership of the account being linked.
    expect(init.headers.Authorization).toBe(`Bearer ${APP_TOKEN}`);
    expect(JSON.parse(init.body)).toEqual({ idToken: ID_TOKEN });
    // Exactly one key: no id, uid, tenant, role or email is ever sent, because the
    // server derives all of them and a body naming them would be inert anyway.
    expect(Object.keys(JSON.parse(init.body))).toEqual(['idToken']);
  });

  it('surfaces the conflict code and status as an ApiError', async () => {
    respondWith(409, {
      code: 'FIREBASE_IDENTITY_CONFLICT',
      error: 'This sign-in cannot be connected to this account. Please contact an administrator.',
    });

    await expect(firebaseLink(APP_TOKEN, { idToken: ID_TOKEN })).rejects.toMatchObject({
      status: 409,
      code: 'FIREBASE_IDENTITY_CONFLICT',
    });
  });

  it('does NOT report session loss for a rejected provider credential answered as 400', async () => {
    // The server moved this code off 401 for exactly this reason: the caller is still
    // signed in to Inventory AI, and only the Firebase credential was bad.
    respondWith(400, { code: 'FIREBASE_TOKEN_INVALID', error: 'This sign-in could not be verified.' });
    const onSessionLost = jest.fn();
    setSessionLostHandler(onSessionLost);

    await expect(firebaseLink(APP_TOKEN, { idToken: ID_TOKEN })).rejects.toMatchObject({
      status: 400,
      code: 'FIREBASE_TOKEN_INVALID',
    });

    expect(onSessionLost).not.toHaveBeenCalled();
  });

  it('still reports session loss for a genuinely dead application token', async () => {
    // The other direction, so the case above is proved to be about the STATUS rather
    // than about a handler that nothing ever reaches.
    respondWith(401, { code: 'SESSION_REVOKED', error: 'Session revoked' });
    const onSessionLost = jest.fn();
    setSessionLostHandler(onSessionLost);

    await expect(firebaseLink(APP_TOKEN, { idToken: ID_TOKEN })).rejects.toMatchObject({
      status: 401,
    });

    expect(onSessionLost).toHaveBeenCalledTimes(1);
  });
});
