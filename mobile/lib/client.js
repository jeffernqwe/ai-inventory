import { API_URL, REQUEST_TIMEOUT_MS } from './config';

/**
 * Error type raised by the API client for every failed request. Fields mirror
 * the backend error envelope so screens can react to codes and field-level
 * validation problems without scattering fetch logic.
 */
export class ApiError extends Error {
  constructor(status, code, message, fields = [], applied) {
    super(message || 'Request failed');
    this.name = 'ApiError';
    this.status = status; // 0 => the request never reached the server
    this.code = code || null;
    this.fields = fields;
    // Optional list of partial results the server kept durable while a
    // multi-part request was rejected (e.g. a partial PO receive, 409
    // RECEIVE_CONFLICT): [{ productId, quantity, ... }].
    this.applied = Array.isArray(applied) ? applied : undefined;
  }

  get isNetwork() {
    return this.status === 0;
  }
  get isValidation() {
    return this.status === 400 && this.fields.length > 0;
  }
}

/**
 * Phase 26A: notified whenever a request that CARRIED a token was refused on
 * authentication grounds (401, or 403 for a disabled account). The listener
 * decides what that means — this module holds no policy — and `lib/auth.jsx`
 * registers one so a dead session is handled in a single place instead of every
 * screen re-deriving it. A screen that never thinks about sessions (a form
 * mid-submit, a background fetch) therefore still returns the app to login
 * rather than showing an authentication error it cannot resolve.
 *
 * A request with no token is never reported: a 401 from /api/auth/login is bad
 * credentials, not a dead session.
 */
let sessionLostHandler = null;

export function setSessionLostHandler(handler) {
  sessionLostHandler = typeof handler === 'function' ? handler : null;
}

function toQuery(params) {
  if (!params) return '';
  const parts = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Single request path for the whole app. Adds JSON headers and a Bearer token
 * when given, applies a timeout, and normalizes every non-2xx response into an
 * ApiError using the backend's { error, code, fields } shape. Screens never
 * call fetch directly.
 */
export async function apiFetch(path, { method = 'GET', token, body, params } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(`${API_URL}${path}${toQuery(params)}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err?.name === 'AbortError') {
      throw new ApiError(0, 'NETWORK_TIMEOUT', 'The request timed out. Check your connection and try again.');
    }
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.');
  }
  clearTimeout(timer);

  const data = await readJson(res);
  if (res.status >= 200 && res.status < 300) return data;
  const error = new ApiError(res.status, data?.code, data?.error || `Request failed (${res.status})`, data?.fields || [], data?.applied);
  if (token && (res.status === 401 || res.status === 403)) sessionLostHandler?.(error);
  throw error;
}

export default apiFetch;
