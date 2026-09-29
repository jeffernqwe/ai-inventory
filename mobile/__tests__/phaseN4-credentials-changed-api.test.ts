/**
 * N-4 — the `credentialsChanged` API wrapper, and the ONE request allowed to opt out of
 * the client's session-loss report.
 *
 * TWO CLAIMS, and the second is the reason this file exists.
 *
 * THE REQUEST IS ONE FIELD. The server derives both sides of the operation — the account
 * from the session and the identity from the verified ID token — so the body may carry
 * `idToken` and nothing else. The key COUNT is asserted, not just the value, so a client
 * that started describing the change (a `userId`, a `businessId`, a `role`, an email, a
 * session id) would fail here rather than relying on the server to keep ignoring it.
 *
 * THE 401 IS EXPECTED, SO IT MUST NOT BE READ AS SESSION LOSS. The recovery handoff holds
 * a TEMPORARY session — minted by the public exchange, never applied, never persisted —
 * and calls this endpoint with it. Two of the answers are ordinary: `401
 * SESSION_INVALIDATED` means the revocation already happened (success-equivalent), and any
 * 401 can happen if the sessions died elsewhere. The app's session-loss rule fires on a
 * tokened 401/403 and, in `lib/auth.tsx`, CLEARS the session and ENDS the durable Firebase
 * session — which would destroy the sign-in the recovery is still completing. So this one
 * request opts out (`temporarySession: true`), and both directions are asserted here: an
 * ordinary tokened request still reports, and this one does not.
 *
 * `lib/config` is mocked because `lib/api.ts` reads its URL and timeout from it.
 */

import { credentialsChanged, firebaseLink } from '../lib/api';
import { ApiError, setSessionLostHandler } from '../lib/client';

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

const ID_TOKEN = 'fake.fresh.id.token';
const TEMPORARY_TOKEN = 'temporary.session.jwt';

/** Installs a `fetch` that answers one status and body. */
function respondWith(status: number, json: unknown) {
  const fetchMock = jest.fn(async (_url: string, _init: FetchInit) => ({
    status,
    json: async () => json,
  }));
  global.fetch = fetchMock as unknown as typeof global.fetch;
  return fetchMock;
}

describe('N-4 — credentialsChanged', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    setSessionLostHandler(null);
  });

  it('POSTs ONLY the ID token, with the TEMPORARY session as the bearer credential', async () => {
    const fetchMock = respondWith(200, { changedAt: '2026-09-29T00:00:00.000Z' });

    await credentialsChanged({ idToken: ID_TOKEN }, TEMPORARY_TOKEN);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:4000/api/auth/credentials-changed');
    expect(init.method).toBe('POST');
    // The token that authenticates the bridge is the one the exchange just minted for the
    // recovery — not the app's session, which does not exist yet at this point.
    expect(init.headers.Authorization).toBe(`Bearer ${TEMPORARY_TOKEN}`);
    expect(Object.keys(JSON.parse(init.body) as object)).toEqual(['idToken']);
    expect(JSON.parse(init.body)).toEqual({ idToken: ID_TOKEN });
  });

  it('★ a 401 on this request does NOT report session loss', async () => {
    const handler = jest.fn();
    setSessionLostHandler(handler);
    respondWith(401, { code: 'SESSION_INVALIDATED' });

    const thrown = await credentialsChanged({ idToken: ID_TOKEN }, TEMPORARY_TOKEN).catch(
      (err: unknown) => err
    );

    // The failure still reaches the caller — the opt-out suppresses a NOTIFICATION, not
    // the error — which is what lets the handoff treat this exact code as success.
    expect(thrown).toBeInstanceOf(ApiError);
    expect((thrown as ApiError).status).toBe(401);
    expect((thrown as ApiError).code).toBe('SESSION_INVALIDATED');
    // ★ And the Firebase session is left alone, because nothing told the app it was gone.
    expect(handler).not.toHaveBeenCalled();
  });

  it('★ a 403 on this request does NOT report session loss either', async () => {
    const handler = jest.fn();
    setSessionLostHandler(handler);
    respondWith(403, { code: 'ACCOUNT_DISABLED' });

    await expect(credentialsChanged({ idToken: ID_TOKEN }, TEMPORARY_TOKEN)).rejects.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });

  it('★ an ORDINARY tokened request still reports — the opt-out is not a global weakening', async () => {
    const handler = jest.fn();
    setSessionLostHandler(handler);
    // The very same status through a route that carries the app's real session. If the
    // suppression had been implemented in the handler or on the whole client, this case
    // would pass silently and the rule would be dead everywhere.
    respondWith(401, { code: 'SESSION_REVOKED' });

    await expect(firebaseLink(TEMPORARY_TOKEN, { idToken: ID_TOKEN })).rejects.toThrow();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('a 400 is not session loss for either shape, because it never was', async () => {
    const handler = jest.fn();
    setSessionLostHandler(handler);
    respondWith(400, { code: 'FIREBASE_TOKEN_INVALID' });

    await expect(credentialsChanged({ idToken: ID_TOKEN }, TEMPORARY_TOKEN)).rejects.toThrow();
    await expect(firebaseLink(TEMPORARY_TOKEN, { idToken: ID_TOKEN })).rejects.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });
});
