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
 * Single request path for the whole app. Adds JSON headers and a Bearer token
 * when given, applies a timeout, and normalizes every non-2xx response into an
 * ApiError using the backend's { error, code, fields } shape. Screens never
 * call fetch directly.
 *
 * The response body is a genuinely dynamic boundary, so the parsed JSON is
 * returned as `unknown` unless the caller names the shape it expects (`T`).
 */
export async function apiFetch<T = unknown>(path: string, { method = 'GET', token, body, params, temporarySession = false }: ApiFetchOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

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
  if (token && !temporarySession && (res.status === 401 || res.status === 403)) sessionLostHandler?.(error);
  throw error;
}

export default apiFetch;
