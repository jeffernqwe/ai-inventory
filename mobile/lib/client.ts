import { API_URL, REQUEST_TIMEOUT_MS } from './config';

/** One field-level validation problem from the server's `fields` array. */
export interface ApiFieldError {
  field: string;
  message: string;
}

/**
 * A partial result the server kept durable while a multi-part request was
 * rejected (e.g. a partial PO receive, 409 RECEIVE_CONFLICT):
 * `[{ productId, quantity, ... }]`.
 */
export interface AppliedResult {
  productId?: string;
  quantity?: number;
}

/**
 * Error type raised by the API client for every failed request. Fields mirror
 * the backend error envelope so screens can react to codes and field-level
 * validation problems without scattering fetch logic.
 */
export class ApiError extends Error {
  /** HTTP status; 0 => the request never reached the server. */
  status: number;
  code: string | null;
  fields: ApiFieldError[];
  applied?: AppliedResult[];
  /**
   * Whole seconds the server asked this client to wait, parsed from a
   * `Retry-After` response header; `null` when the response carried none.
   *
   * The rate limiters in this project emit it on every 429 (draft-7 headers), so
   * a caller that wants to describe a wait — rather than print a fixed sentence —
   * can read the server's own number instead of inventing one. It is advisory
   * only: nothing in this client enforces it, and it is never persisted.
   */
  retryAfter: number | null;

  constructor(
    status: number,
    code?: string | null,
    message?: string,
    fields: ApiFieldError[] = [],
    applied?: AppliedResult[],
  ) {
    super(message || 'Request failed');
    this.name = 'ApiError';
    this.status = status;
    this.code = code || null;
    this.fields = fields;
    this.applied = Array.isArray(applied) ? applied : undefined;
    this.retryAfter = null;
  }

  get isNetwork(): boolean {
    return this.status === 0;
  }
  get isValidation(): boolean {
    return this.status === 400 && this.fields.length > 0;
  }
}

/**
 * Phase 26A: notified whenever a request that CARRIED a token was refused on
 * authentication grounds (401, or 403 for a disabled account). The listener
 * decides what that means — this module holds no policy — and `lib/auth.tsx`
 * registers one so a dead session is handled in a single place instead of every
 * screen re-deriving it. A screen that never thinks about sessions (a form
 * mid-submit, a background fetch) therefore still returns the app to login
 * rather than showing an authentication error it cannot resolve.
 *
 * A request with no token is never reported: a 401 from /api/auth/login is bad
 * credentials, not a dead session.
 */
export type SessionLostHandler = (error: ApiError) => void;

let sessionLostHandler: SessionLostHandler | null = null;

export function setSessionLostHandler(handler: SessionLostHandler | null | undefined): void {
  sessionLostHandler = typeof handler === 'function' ? handler : null;
}

/** Query-string parameters; `undefined`/`null`/`''` entries are dropped. */
export type QueryParams = Record<string, unknown>;

export interface ApiFetchOptions {
  method?: string;
  token?: string | null;
  body?: unknown;
  params?: QueryParams | null;
  /**
   * Wall-clock budget for THIS request, in ms (AI-1). Defaults to
   * `REQUEST_TIMEOUT_MS`, so every existing caller keeps the global 15 s budget
   * and only a caller that states otherwise is affected.
   *
   * It exists because one route is legitimately slow: the assistant's server side
   * is bounded by its own turn deadline, not by 15 s, so a single global budget
   * could only ever be wrong for one of the two. The assistant passes its own,
   * larger budget; nothing else changes.
   */
  timeoutMs?: number;
  /**
   * N-4 — the `token` on this request is a DELIBERATELY TEMPORARY session that is
   * never applied to the app, so a 401/403 answer must NOT be reported as session
   * loss. See the note at the report site below for why that distinction has to
   * exist rather than being left to the caller.
   *
   * It says nothing about authorization, and the server treats the request
   * identically either way: the response is still normalized into an `ApiError` and
   * still thrown. The only thing it changes is whether a client-side NOTIFICATION
   * fires.
   */
  temporarySession?: boolean;
}

function toQuery(params?: QueryParams | null): string {
  if (!params) return '';
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

/** The error envelope the backend returns for every non-2xx response. */
interface ApiErrorEnvelope {
  code?: string;
  error?: string;
  fields?: ApiFieldError[];
  applied?: AppliedResult[];
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * `fetch` reports an abort as a rejection whose `name` is 'AbortError'. The
 * check is structural rather than `instanceof Error` because the abort value is
 * a DOMException in some runtimes — this mirrors the original `err?.name`
 * comparison exactly, including for non-object rejections.
 */
function isAbortError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError';
}

/**
 * Parses a `Retry-After` header into whole seconds, or `null` when there is
 * nothing usable to parse.
 *
 * Both RFC 9110 forms are accepted — delta-seconds (what every limiter in this
 * project emits) and an HTTP-date — so the reader cannot be the reason a wait is
 * unstated. The digit check is written as a loop rather than a regex so the
 * server's decimal form is accepted exactly and nothing else is.
 */
function parseRetryAfter(raw: string | null): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let allDigits = true;
  for (const ch of trimmed) {
    if (ch < '0' || ch > '9') {
      allDigits = false;
      break;
    }
  }
  if (allDigits) {
    const seconds = Number.parseInt(trimmed, 10);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
  }
  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return null;
  const seconds = Math.ceil((at - Date.now()) / 1000);
  return seconds > 0 ? seconds : 0;
}

/**
 * Reads the wait the server stated, without assuming the response really is a
 * `Response`.
 *
 * Two suites in this repository stub `fetch` with the minimal object their own
 * subject needs, and some of those stubs carry no header bag at all. An ERROR path
 * must never fail because of that: the `ApiError` is the outcome this function is
 * building, and it has to be built either way. A response with nothing readable
 * simply states no wait, which is the same answer an absent header gives.
 */
function readRetryAfter(res: Response): number | null {
  const headers = res.headers as Headers | undefined;
  if (!headers || typeof headers.get !== 'function') return null;
  return parseRetryAfter(headers.get('retry-after'));
}

/**
 * AUTH-03 — the ONE response code that means "the Inventory JWT expired, but the
 * session it named is still live". Recoverable: the client can renew the same
 * session (or, if renewal is impossible, re-exchange), so this must NEVER be
 * routed to the session-loss path — treating an expiry as a dead session is the
 * behavior AUTH-03 replaces.
 */
export const SESSION_EXPIRED_CODE = 'SESSION_EXPIRED';

/**
 * True when a refused authenticated request can be recovered by renewal.
 *
 * Classification is by APPLICATION ERROR CODE, never by HTTP status: a 401 alone
 * says nothing about whether the session is recoverable, and the whole point of
 * AUTH-03 is that `SESSION_EXPIRED` (recoverable) and `SESSION_REVOKED`
 * (terminal) are both 401s and must be told apart.
 */
export function isRecoverableAuthError(error: ApiError): boolean {
  return error.code === SESSION_EXPIRED_CODE;
}

/**
 * AUTH-03 — the provider's RECOVERY hook.
 *
 * Called when an authenticated request was refused with a recoverable expiry. It
 * returns a fresh token to retry with, or `null` when recovery could not complete
 * now (transient). Single-flight and the auth epoch live in `lib/auth.tsx`, which
 * registers this; the transport only decides WHEN to ask and how many times to
 * retry (exactly once).
 */
export type SessionRecoveryHandler = (error: ApiError) => Promise<string | null>;

let sessionRecoveryHandler: SessionRecoveryHandler | null = null;

export function setSessionRecoveryHandler(
  handler: SessionRecoveryHandler | null | undefined,
): void {
  sessionRecoveryHandler = typeof handler === 'function' ? handler : null;
}

/**
 * AUTH-03 — the provider's PROACTIVE-RENEWAL hook.
 *
 * Given the token a request is about to carry, it returns either the same token or
 * a freshly renewed one. The provider decides, from its own token/session horizon
 * (10 minutes), whether a renewal is due — so proactive renewal happens beneath
 * every screen instead of each caller remembering to do it. A failure is
 * swallowed here: the request proceeds with the token it had, and its own response
 * decides what happens next. Without a registered handler (every test that does
 * not install one) the hook is a no-op.
 */
export type SessionRenewalHandler = (token: string) => Promise<string | null>;

let sessionRenewalHandler: SessionRenewalHandler | null = null;

export function setSessionRenewalHandler(
  handler: SessionRenewalHandler | null | undefined,
): void {
  sessionRenewalHandler = typeof handler === 'function' ? handler : null;
}

/**
 * Single request path for the whole app. Adds JSON headers and a Bearer token
 * when given, applies a timeout, and normalizes every non-2xx response into an
 * ApiError using the backend's { error, code, fields } shape. Screens never
 * call fetch directly.
 *
 * The response body is a genuinely dynamic boundary, so the parsed JSON is
 * returned as `unknown` unless the caller names the shape it expects (`T`).
 *
 * AUTH-03 adds proactive renewal (before the request) and recovery-on-expiry
 * (after it), both delegated to `lib/auth.tsx` through the hooks above. The retry
 * count is exactly one: the retried attempt is marked `isRetry`, so it neither
 * renews proactively again nor attempts a second recovery.
 */
export async function apiFetch<T = unknown>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  return apiFetchAttempt<T>(path, options, false);
}

async function apiFetchAttempt<T = unknown>(
  path: string,
  { method = 'GET', token, body, params, temporarySession = false, timeoutMs }: ApiFetchOptions,
  isRetry: boolean,
): Promise<T> {
  let effectiveToken = token ?? null;

  // AUTH-03 — proactive renewal, immediately before the request leaves. The
  // provider decides whether the token is near expiry; a failure is non-fatal.
  if (!isRetry && effectiveToken && !temporarySession && sessionRenewalHandler) {
    try {
      const refreshed = await sessionRenewalHandler(effectiveToken);
      if (refreshed) effectiveToken = refreshed;
    } catch {
      // Renewal is best-effort here; the request proceeds on the existing token
      // and its own response decides what happens next.
    }
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (effectiveToken) headers.Authorization = `Bearer ${effectiveToken}`;

  // AI-1 — the caller's own budget when it stated one, otherwise the global
  // default. Resolved here, once, so every request in the app still shares one
  // timeout unless it deliberately opts out.
  const budgetMs = timeoutMs ?? REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budgetMs);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}${toQuery(params)}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (isAbortError(err)) {
      throw new ApiError(0, 'NETWORK_TIMEOUT', 'The request timed out. Check your connection and try again.');
    }
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.');
  }
  clearTimeout(timer);

  const data = await readJson(res);
  if (res.status >= 200 && res.status < 300) return data as T;
  const envelope = (data ?? {}) as ApiErrorEnvelope;
  const error = new ApiError(
    res.status,
    envelope.code,
    envelope.error || `Request failed (${res.status})`,
    envelope.fields || [],
    envelope.applied,
  );
  // The server's own cooldown, when it stated one. Read for EVERY failed
  // response rather than only 429s: the header is only ever emitted alongside a
  // refusal, and gating on the status here would encode a policy this transport
  // is not entitled to hold.
  error.retryAfter = readRetryAfter(res);

  // AUTH-03 — recoverable expiry: one controlled recovery, then EXACTLY ONE retry.
  // `isRetry` guarantees the retried attempt cannot re-enter this branch, so no
  // loop is possible. A null answer means recovery could not complete now (a
  // transient Firebase/network/rate-limit failure, per the locked classification)
  // — the original error is then thrown and, because it is recoverable, the
  // session is deliberately NOT reported as lost.
  if (
    !isRetry &&
    effectiveToken &&
    !temporarySession &&
    isRecoverableAuthError(error) &&
    sessionRecoveryHandler
  ) {
    let refreshed: string | null = null;
    try {
      refreshed = await sessionRecoveryHandler(error);
    } catch {
      refreshed = null;
    }
    if (refreshed) {
      return apiFetchAttempt<T>(
        path,
        // `timeoutMs` is carried across the retry: a recovered request must get
        // the same budget its caller asked for, not silently revert to 15 s.
        { method, token: refreshed, body, params, temporarySession, timeoutMs },
        true,
      );
    }
  }

  // N-4 — WHY ONE REQUEST CAN OPT OUT OF THIS REPORT.
  //
  // The password-recovery handoff deliberately holds a TEMPORARY session (minted by the
  // public exchange, never applied to the app) and calls the credential-change bridge
  // with it. Two of that call's answers are expected and ordinary: `401
  // SESSION_INVALIDATED` is the success-equivalent answer when the revocation this call
  // is repeating already happened, and any 401 from the bridge can happen if the
  // sessions were ended elsewhere first. Reporting either through this handler would
  // fire `lib/auth.tsx`'s session-loss path, which CLEARS the session AND ENDS THE
  // DURABLE FIREBASE SESSION — destroying the very sign-in the recovery is completing,
  // so the final exchange that must follow would then have no Firebase user at all.
  //
  // The flag therefore suppresses the notification for that one request and nothing
  // else. It cannot weaken the rule for any ordinary request (it defaults to false and
  // is set in exactly one place), it changes no authorization decision, and the caller
  // still receives the thrown `ApiError` and handles the status itself.
  //
  // AUTH-03 adds a SECOND, code-based exclusion: a recoverable expiry is never
  // session loss, whether recovery succeeded (handled above) or not. This is what
  // keeps an expired-but-live session from being cleared, which is the entire
  // point of the phase.
  if (
    effectiveToken &&
    !temporarySession &&
    !isRecoverableAuthError(error) &&
    (res.status === 401 || res.status === 403)
  ) {
    sessionLostHandler?.(error);
  }
  throw error;
}

export default apiFetch;
