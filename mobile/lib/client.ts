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
export async function apiFetch<T = unknown>(path: string, { method = 'GET', token, body, params }: ApiFetchOptions = {}): Promise<T> {
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
  if (token && (res.status === 401 || res.status === 403)) sessionLostHandler?.(error);
  throw error;
}

export default apiFetch;
