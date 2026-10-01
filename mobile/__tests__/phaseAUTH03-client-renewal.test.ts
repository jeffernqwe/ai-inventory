/**
 * AUTH-03 — the transport half of session renewal (`lib/client.ts`).
 *
 * These cases drive `apiFetch` directly against a stubbed `fetch`, with the
 * provider's hooks registered manually, so every branch of the renewal/recovery
 * behavior is exercised without React:
 *
 *   * classification is by APPLICATION CODE, not HTTP status;
 *   * a recoverable `SESSION_EXPIRED` is recovered once and retried EXACTLY once;
 *   * a second expiry on the retry is thrown, never recovered again (no loop);
 *   * a failed recovery does NOT report session loss;
 *   * a terminal refusal DOES report session loss and never attempts recovery;
 *   * a 429 carries `retryAfter` and is never session loss;
 *   * proactive renewal runs before the request and its token is used.
 */

import {
  ApiError,
  apiFetch,
  isRecoverableAuthError,
  setSessionLostHandler,
  setSessionRecoveryHandler,
  setSessionRenewalHandler,
} from '../lib/client';

type FakeResponse = {
  status: number;
  ok: boolean;
  json: () => Promise<unknown>;
  headers: { get: (name: string) => string | null };
};

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): FakeResponse {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  };
}

const fetchMock = jest.fn();

beforeEach(() => {
  setSessionLostHandler(null);
  setSessionRecoveryHandler(null);
  setSessionRenewalHandler(null);
  fetchMock.mockReset();
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
});

const authHeaderOf = (callIndex: number): string | undefined =>
  (fetchMock.mock.calls[callIndex]?.[1] as { headers?: Record<string, string> } | undefined)?.headers
    ?.Authorization;

describe('AUTH-03 — classification is by application code', () => {
  it('treats only SESSION_EXPIRED as recoverable', () => {
    expect(isRecoverableAuthError(new ApiError(401, 'SESSION_EXPIRED', 'x'))).toBe(true);
    expect(isRecoverableAuthError(new ApiError(401, 'SESSION_REVOKED', 'x'))).toBe(false);
    expect(isRecoverableAuthError(new ApiError(401, 'AUTH_REQUIRED', 'x'))).toBe(false);
    expect(isRecoverableAuthError(new ApiError(500, 'SESSION_EXPIRED', 'x'))).toBe(true);
  });
});

describe('AUTH-03 — recovery and exactly-one retry', () => {
  it('recovers a SESSION_EXPIRED, retries once, and uses the recovered token', async () => {
    const recovery = jest.fn(async () => 'new-token');
    setSessionRecoveryHandler(recovery);
    const lost = jest.fn();
    setSessionLostHandler(lost);

    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { code: 'SESSION_EXPIRED', error: 'expired' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await expect(apiFetch('/api/products', { token: 'old-token' })).resolves.toEqual({ ok: true });

    expect(recovery).toHaveBeenCalledTimes(1);
    expect(lost).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authHeaderOf(0)).toBe('Bearer old-token');
    expect(authHeaderOf(1)).toBe('Bearer new-token');
  });

  it('does NOT recover twice: a second SESSION_EXPIRED on the retry is thrown', async () => {
    const recovery = jest.fn(async () => 'new-token');
    setSessionRecoveryHandler(recovery);

    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { code: 'SESSION_EXPIRED' }))
      .mockResolvedValueOnce(jsonResponse(401, { code: 'SESSION_EXPIRED' }));

    await expect(apiFetch('/api/products', { token: 'old' })).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
    });
    expect(recovery).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never reports a recoverable expiry as session loss, even when recovery fails', async () => {
    setSessionRecoveryHandler(async () => null);
    const lost = jest.fn();
    setSessionLostHandler(lost);
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { code: 'SESSION_EXPIRED' }));

    await expect(apiFetch('/api/x', { token: 't' })).rejects.toBeInstanceOf(ApiError);
    expect(lost).not.toHaveBeenCalled();
  });
});

describe('AUTH-03 — terminal and transient failures', () => {
  it('reports a terminal 401 and never attempts recovery', async () => {
    const recovery = jest.fn();
    setSessionRecoveryHandler(recovery);
    const lost = jest.fn();
    setSessionLostHandler(lost);
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { code: 'SESSION_REVOKED' }));

    await expect(apiFetch('/api/x', { token: 't' })).rejects.toBeInstanceOf(ApiError);
    expect(recovery).not.toHaveBeenCalled();
    expect(lost).toHaveBeenCalledTimes(1);
  });

  it('a 429 carries retryAfter and is NOT session loss', async () => {
    const lost = jest.fn();
    setSessionLostHandler(lost);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(429, { code: 'SESSION_RENEW_RATE_LIMITED' }, { 'retry-after': '60' }),
    );

    await expect(
      apiFetch('/api/auth/renew', { token: 't', method: 'POST' }),
    ).rejects.toMatchObject({ code: 'SESSION_RENEW_RATE_LIMITED', retryAfter: 60 });
    expect(lost).not.toHaveBeenCalled();
  });

  it('without any handler a 401 still reports session loss (unchanged default)', async () => {
    const lost = jest.fn();
    setSessionLostHandler(lost);
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { code: 'SESSION_REVOKED' }));
    await expect(apiFetch('/api/x', { token: 't' })).rejects.toBeInstanceOf(ApiError);
    expect(lost).toHaveBeenCalledTimes(1);
  });
});

describe('AUTH-03 — proactive renewal before a request', () => {
  it('asks the provider first and uses the token it returns', async () => {
    const renewal = jest.fn(async () => 'fresh-token');
    setSessionRenewalHandler(renewal);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await apiFetch('/api/x', { token: 'old-token' });

    expect(renewal).toHaveBeenCalledWith('old-token');
    expect(authHeaderOf(0)).toBe('Bearer fresh-token');
  });

  it('uses the original token when the provider declines (returns null)', async () => {
    setSessionRenewalHandler(async () => null);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await apiFetch('/api/x', { token: 'unchanged' });

    expect(authHeaderOf(0)).toBe('Bearer unchanged');
  });

  it('does not renew a request that carries no token', async () => {
    const renewal = jest.fn(async () => 'fresh');
    setSessionRenewalHandler(renewal);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await apiFetch('/api/public');

    expect(renewal).not.toHaveBeenCalled();
  });

  it('does not proactively renew a temporary session (the N-4 opt-out)', async () => {
    const renewal = jest.fn(async () => 'fresh');
    setSessionRenewalHandler(renewal);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await apiFetch('/api/private', { token: 'temp', temporarySession: true });

    expect(renewal).not.toHaveBeenCalled();
  });
});
