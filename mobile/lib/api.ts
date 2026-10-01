import { apiFetch } from './client';
import type { QueryParams } from './client';

/**
 * Typed endpoint wrappers over the backend REST API. Each function returns the
 * parsed JSON payload the server sends (pagination envelopes, DTOs, or
 * { token, user } etc.). Screens call these — they never call fetch directly.
 * All protected calls take the session `token` from auth state.
 */

/**
 * A parsed JSON response body.
 *
 * The API layer is the app's untrusted network boundary. Request shapes are
 * declared below because the app itself constructs them; response shapes are
 * deliberately NOT re-declared here. The server owns every DTO, and a second
 * copy of them in the client is exactly the kind of duplicate that drifts
 * silently — the project already rejects that pattern for the RBAC mirror
 * (lib/permissions.ts), which is pinned by a guard precisely because a mirror
 * that drifts is worse than no mirror. Screens consume responses structurally,
 * as they did before this migration, and the server remains authoritative.
 *
 * Where a response shape genuinely matters to a screen, that screen narrows it
 * at the point of use.
 */
export type ApiResponse = any;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface RegisterPayload {
  businessName: string;
  name: string;
  email: string;
  password: string;
}

/** POST /api/auth/register -> { user, business } (201, no token issued). */
export function register({ businessName, name, email, password }: RegisterPayload): Promise<ApiResponse> {
  return apiFetch('/api/auth/register', {
    method: 'POST',
    body: { businessName, name, email, password },
  });
}

export interface LoginPayload {
  email: string;
  password: string;
  deviceLabel?: string;
}

/**
 * POST /api/auth/login -> { token, tokenType, expiresIn, user }.
 * `deviceLabel` is an optional, cosmetic hint ("Android · Pixel 7") the server
 * stores on the new session so the user can tell their devices apart; it is
 * coerced server-side and can never fail a login.
 */
export function login({ email, password, deviceLabel }: LoginPayload): Promise<ApiResponse> {
  return apiFetch('/api/auth/login', {
    method: 'POST',
    body: { email, password, deviceLabel },
  });
}

/** GET /api/auth/me -> { user }. Restores the session on app boot. */
export function me(token: string): Promise<ApiResponse> {
  return apiFetch('/api/auth/me', { token });
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

/** POST /api/auth/change-password -> { message }. body: { currentPassword, newPassword }. 400 INVALID_CURRENT_PASSWORD / VALIDATION_ERROR; revokes every prior JWT (401 SESSION_INVALIDATED). */
export function changePassword(token: string, { currentPassword, newPassword }: ChangePasswordPayload): Promise<ApiResponse> {
  return apiFetch('/api/auth/change-password', {
    token,
    method: 'POST',
    body: { currentPassword, newPassword },
  });
}

/** PATCH /api/auth/me -> { user }. Updates ONLY the caller's name. 400 VALIDATION_ERROR for any other field. */
export function updateMe(token: string, { name }: { name: string }): Promise<ApiResponse> {
  return apiFetch('/api/auth/me', { token, method: 'PATCH', body: { name } });
}

export interface LogoutOptions {
  all?: boolean;
}

/**
 * POST /api/auth/logout -> { message } (Phase 26A). Ends the session this token
 * belongs to — the server identifies it from the token itself, so no session,
 * user or business is ever named by the client. Pass `{ all: true }` to sign out
 * everywhere: every session the user has open, this one included, in one call
 * (`-> { message, sessionsRevoked }`).
 *
 * Idempotent: ending an already-ended session still answers 200.
 */
export function logout(token: string, { all = false }: LogoutOptions = {}): Promise<ApiResponse> {
  return apiFetch('/api/auth/logout', {
    token,
    method: 'POST',
    body: all ? { all: true } : {},
  });
}

/**
 * GET /api/auth/sessions -> { sessions } (Phase 26A). Only the caller's own open
 * sessions, newest first. Each is
 * `{ id, current, deviceLabel, createdAt, lastUsedAt, expiresAt }` — a session id
 * the client can act on and nothing more: no token and no jti is ever sent.
 */
export function sessions(token: string): Promise<ApiResponse> {
  return apiFetch('/api/auth/sessions', { token });
}

/**
 * DELETE /api/auth/sessions/:id -> { message, id } (Phase 26A). Ends one of the
 * caller's own sessions. 404 for an unknown id and for another user's session
 * alike, so the response never reveals that someone else's session exists.
 */
export function revokeSession(token: string, id: string): Promise<ApiResponse> {
  return apiFetch(`/api/auth/sessions/${id}`, { token, method: 'DELETE' });
}

/**
 * POST /api/auth/forgot-password -> { message } (202). PUBLIC — the caller is
 * signed out by definition, so no session token is sent (and a tokenless call
 * can never trip the session-lost handler).
 *
 * The endpoint answers one identical 202 whether or not the address exists, so
 * nothing here is worth reading: callers must render their success state from a
 * fixed string rather than from this payload.
 */
export function forgotPassword(email: string): Promise<ApiResponse> {
  return apiFetch('/api/auth/forgot-password', { method: 'POST', body: { email } });
}

export interface ResetPasswordPayload {
  token: string;
  newPassword: string;
  confirmPassword: string;
}

/**
 * POST /api/auth/reset-password -> { message } (200). PUBLIC — no session token.
 *
 * The opaque reset token travels in the BODY, never in a URL, so it cannot reach
 * an access log or a Referer header; `token` here is that reset token, not a JWT.
 * `confirmPassword` is checked server-side before the token is spent, so the
 * field name must match the server's exactly or a mismatch could cost the user
 * their link. 400 INVALID_RESET_TOKEN for an unknown, expired or used token;
 * 400 VALIDATION_ERROR with `fields` when the password breaks the policy.
 */
export function resetPassword({ token, newPassword, confirmPassword }: ResetPasswordPayload): Promise<ApiResponse> {
  return apiFetch('/api/auth/reset-password', {
    method: 'POST',
    body: { token, newPassword, confirmPassword },
  });
}

// ---------------------------------------------------------------------------
// Firebase authentication (Phase 32C backend / 32E mobile)
// ---------------------------------------------------------------------------
// BOTH WRAPPERS ARE TOKENLESS, and that is structural rather than incidental.
// `lib/client.ts` reports session loss only for a request that CARRIED a token
// (`if (token && (res.status === 401 || res.status === 403))`), so a 401 or 403
// from either route here cannot reach the session-lost handler and clear a
// session that these routes never had. The caller is proving an identity with a
// Firebase credential precisely BECAUSE they hold no Inventory AI JWT yet, so
// passing one would make the endpoint able to mint only sessions that already
// exist.
//
// The response of `firebaseExchange` is byte-for-byte the shape `login` returns
// (token/tokenType/expiresIn/user), which is what lets `lib/auth.tsx` store it
// exactly as it stores a password-login token. The Firebase ID token is consumed
// server-side and is never a field of anything returned.

export interface FirebaseExchangePayload {
  /** A Firebase ID token from `lib/firebase-auth`. Consumed once, never stored. */
  idToken: string;
  /** Cosmetic device hint, exactly as `login` takes it. */
  deviceLabel?: string;
}

/**
 * POST /api/auth/firebase/exchange -> { token, tokenType, expiresIn, user } (200).
 * PUBLIC — no session token is sent.
 *
 * 403 `REGISTRATION_REQUIRED` when the verified identity has no Inventory AI
 * account yet; 403 `ACCOUNT_DISABLED` / `BUSINESS_NOT_ACTIVE`; 401
 * `FIREBASE_TOKEN_INVALID` for a token the server would not accept; 503
 * `FIREBASE_NOT_CONFIGURED` when the server has no service account.
 */
export function firebaseExchange({ idToken, deviceLabel }: FirebaseExchangePayload): Promise<ApiResponse> {
  return apiFetch('/api/auth/firebase/exchange', {
    method: 'POST',
    body: { idToken, deviceLabel },
  });
}

export interface FirebaseRegisterPayload {
  idToken: string;
  businessName: string;
  name?: string;
}

/**
 * POST /api/auth/firebase/register -> { user, business } (201, no token).
 * PUBLIC — no session token is sent.
 *
 * Issues no token, exactly like `register`: the caller exchanges next. 409
 * `EMAIL_IN_USE` when the verified identity's email already belongs to an
 * Inventory AI account — the server refuses to link the two rather than merging
 * them, so this is a real dead end and not a transient one.
 */
export function firebaseRegister({ idToken, businessName, name }: FirebaseRegisterPayload): Promise<ApiResponse> {
  return apiFetch('/api/auth/firebase/register', {
    method: 'POST',
    body: { idToken, businessName, name },
  });
}

export interface FirebaseLinkPayload {
  /** A Firebase ID token from `lib/firebase-auth`. Consumed once, never stored. */
  idToken: string;
}

/**
 * POST /api/auth/firebase/link -> { linked, user } (200, Phase 32H).
 * AUTHENTICATED — the caller's own session token is required.
 *
 * Records that the CALLER'S OWN account carries the identity the verified ID token
 * names. It is the explicit "connect a provider" operation, and the only way a
 * `firebaseUid` is ever attached to an existing account.
 *
 * THE ACCOUNT AND THE IDENTITY ARE BOTH SERVER-DERIVED, so the body below is the
 * WHOLE request: no id, uid, businessId or role is sent, and the server reads none
 * of them anyway. The caller's session is the ownership proof; the token is the
 * identity. Nothing here compares an email address to anything.
 *
 * `linked: false` is a SUCCESS, not a refusal — it is the idempotent answer when the
 * account already carries this identity. Every real refusal throws:
 *
 *   409 `FIREBASE_IDENTITY_CONFLICT` — the identity belongs to another account, or
 *       this account already carries a different one. One deliberately generic
 *       message covers both, so a screen relays it rather than explaining it.
 *   400 `FIREBASE_TOKEN_INVALID` — a bad provider credential. A 400 here is a bad
 *       REQUEST FIELD, not a dead session; the server moved it off 401 for exactly
 *       that reason, and `lib/client.ts` reports session loss only for 401/403, so
 *       this cannot sign the caller out.
 *   403 `BUSINESS_NOT_ACTIVE` / 503 `FIREBASE_NOT_CONFIGURED` — as on the other
 *       Firebase routes.
 */
export function firebaseLink(token: string, { idToken }: FirebaseLinkPayload): Promise<ApiResponse> {
  return apiFetch('/api/auth/firebase/link', {
    token,
    method: 'POST',
    body: { idToken },
  });
}

/**
 * The Firebase-unlink API wrapper was REMOVED in Phase A (F-1), together with the
 * `POST /api/auth/firebase/unlink` route it called.
 *
 * THE CAPABILITY IS GONE, NOT DISABLED: an account may no longer detach its Firebase
 * identity, so there is no endpoint left for a client to reach and nothing for a
 * wrapper to send. What replaced it is `changeFirebasePassword` in `lib/auth.tsx`,
 * which changes the credential Firebase owns rather than removing the identity
 * `firebaseUid` names. The removal is recorded here rather than composed silently
 * into a smaller diff, because a reader looking for the unlink call must be able to
 * find out where it went.
 */
export interface FirebaseCredentialsChangedPayload {
  /**
   * A Firebase ID token from the ACTUAL password sign-in that just happened, so its
   * signed `auth_time` is within the server's 300 s freshness window. A refreshed
   * token (`getIdToken(true)`) moves `iat` and leaves `auth_time` alone, so it is not
   * a substitute and the server refuses it — deliberately.
   */
  idToken: string;
}

/**
 * POST /api/auth/credentials-changed -> { changedAt } (200, N-4).
 *
 * Records that Firebase changed this account's password, so every Inventory AI session
 * minted against the previous one is revoked. It is the server half of the approved
 * recovery sequence and it is AUTHENTICATED: `token` here is the TEMPORARY session the
 * public exchange just minted for the recovery, not the app's session — the bridge
 * revokes every session including that one, and the caller then exchanges once more for
 * the session it actually keeps.
 *
 * `temporarySession: true` is set for exactly that reason: the caller is deliberately
 * holding a token that is not the app's session, so a 401 from this request must not be
 * reported as session loss — that report ends the durable Firebase session, which would
 * destroy the sign-in the recovery still needs. `lib/client.ts` carries the full argument.
 *
 * EXPECTED ANSWERS, and what each means to the caller:
 *
 *   200 — recorded. The revocation happened (or happened already; the operation is
 *         idempotent). Clear the recovery marker and take the final session.
 *   401 `SESSION_INVALIDATED` — the SUCCESS-EQUIVALENT answer: this exact revocation
 *         already happened, which is why the temporary token is no longer valid. Treat it
 *         as the 200 above. Other 401 codes mean the temporary session died for an
 *         unrelated reason; the revocation is still owed, so the marker stays.
 *   409 `FIREBASE_REAUTHENTICATION_REQUIRED` — the Firebase authentication is older than
 *         the 300 s window. The revocation is still owed, so the marker stays and the next
 *         sign-in retries.
 *   409 `FIREBASE_IDENTITY_CONFLICT` — the verified identity is not this account's, or the
 *         account carries none. TERMINAL, and the marker stays: a mismatch must never
 *         consume it.
 *   400 `FIREBASE_TOKEN_INVALID` — Firebase refused the token; a bad request field rather
 *         than a dead session, which is why the server keeps it off 401 here too.
 *   403 `ACCOUNT_DISABLED` / `BUSINESS_NOT_ACTIVE`, 503 `FIREBASE_NOT_CONFIGURED` —
 *         unchanged, and all of them leave the marker in place.
 */
export function credentialsChanged(
  { idToken }: FirebaseCredentialsChangedPayload,
  token: string
): Promise<ApiResponse> {
  return apiFetch('/api/auth/credentials-changed', {
    token,
    method: 'POST',
    temporarySession: true,
    body: { idToken },
  });
}

/**
 * POST /api/auth/renew -> { token, tokenType, expiresIn, tokenExpiresAt,
 * sessionExpiresAt, user } (200, AUTH-03). AUTHENTICATED — the caller's own
 * session token is required.
 *
 * Re-issues an access token for the CALLER'S OWN existing session: the server
 * keeps the same `jti`, reuses the same session row, and NEVER extends its 14-day
 * cap. The body carries only `{ idToken }`; the account is the session and the
 * identity is the verified token's uid, so no id, uid, businessId or role is sent
 * and none is read. The response restates login's shape plus the two absolute
 * instants, whose MINIMUM is the client's true authentication horizon.
 *
 * NOT `temporarySession`: this request carries the app's own session, so its
 * refusals must reach the normal classification. The server answers a rejected
 * Firebase credential as 400 (a bad request field), a uid mismatch as 409
 * `FIREBASE_IDENTITY_CONFLICT`, an unverified identity as 400 `EMAIL_NOT_VERIFIED`,
 * a spent/revoked session as 401 `SESSION_REVOKED`, and a throttled caller as 429
 * `SESSION_RENEW_RATE_LIMITED` — the last of which is TRANSIENT and must preserve
 * the still-valid session rather than be read as session loss.
 */
export function renew(token: string, { idToken }: FirebaseLinkPayload): Promise<ApiResponse> {
  return apiFetch('/api/auth/renew', {
    token,
    method: 'POST',
    body: { idToken },
  });
}

// ---------------------------------------------------------------------------
// Users (Phase 14A backend / 14B mobile)
// ---------------------------------------------------------------------------
// OWNER/ADMIN only (users.manage). Create/assign never includes OWNER; the
// server enforces no-self-change, OWNER immutability, and ADMIN<->ADMIN rules.

/** A user create/update body. The server validates every field. */
export interface UserInput {
  name?: string;
  email?: string;
  password?: string;
  role?: string;
  status?: string;
}

export const usersApi = {
  /** Paginated { items, page, limit, total, totalPages }. params: { q (name/email), status (ACTIVE|DISABLED), page, limit }. */
  list: (token: string, params?: QueryParams): Promise<ApiResponse> => apiFetch('/api/users', { token, params }),
  /** One business user (public shape: id, name, email, role, status, createdAt). */
  get: (token: string, id: string): Promise<ApiResponse> => apiFetch(`/api/users/${id}`, { token }),
  /** Create ADMIN/MANAGER/STAFF. body: { name, email, password, role }. 409 EMAIL_IN_USE; 400 field problems. */
  create: (token: string, payload: UserInput): Promise<ApiResponse> =>
    apiFetch('/api/users', { token, method: 'POST', body: payload }),
  /** Change role and/or status — body has >=1 of { role, status }. */
  update: (token: string, id: string, payload: UserInput): Promise<ApiResponse> =>
    apiFetch(`/api/users/${id}`, { token, method: 'PATCH', body: payload }),
};

// ---------------------------------------------------------------------------
// Reference resources: categories & locations (shared CRUD + archive shape)
// ---------------------------------------------------------------------------

/**
 * A reference create/update body. The index signature carries the optional
 * extra writable columns a reference group declares (e.g. supplier
 * contactName/phone/email); `null` is accepted because callers build these
 * objects from form state, where a cleared field is often null.
 */
export interface ReferencePayload {
  name?: string;
  description?: string;
  [field: string]: string | null | undefined;
}

/**
 * Factory for the shared reference CRUD shape (categories, locations,
 * suppliers). `fields` are optional extra writable columns (e.g. supplier
 * contactName/phone/email) forwarded verbatim on create/update — blank/absent
 * values are dropped, keeping categories/locations (fields: []) unchanged.
 */
function referenceGroup(path: string, { fields = [] }: { fields?: string[] } = {}) {
  // Forward extra writable columns (e.g. supplier contact fields). Blanks are
  // dropped on create so nothing empty is stored; on update an empty string is
  // kept so the server clears a previously-set value (its PATCH applies any
  // field that differs from the stored one).
  const bodyWithExtras = (
    base: ReferencePayload,
    extras: ReferencePayload,
    { keepEmpty = false }: { keepEmpty?: boolean } = {},
  ): ReferencePayload => {
    const out: ReferencePayload = { ...base };
    for (const f of fields) {
      const raw = extras[f];
      if (raw === undefined || raw === null) continue;
      const v = String(raw);
      if (v === '' && !keepEmpty) continue;
      out[f] = v;
    }
    return out;
  };
  return {
    list: (token: string, params?: QueryParams): Promise<ApiResponse> => apiFetch(`${path}`, { token, params }),
    get: (token: string, id: string): Promise<ApiResponse> => apiFetch(`${path}/${id}`, { token }),
    create: (token: string, { name, description, ...extras }: ReferencePayload): Promise<ApiResponse> =>
      apiFetch(`${path}`, { token, method: 'POST', body: bodyWithExtras({ name, description }, extras) }),
    update: (token: string, id: string, { name, description, ...extras }: ReferencePayload): Promise<ApiResponse> =>
      apiFetch(`${path}/${id}`, { token, method: 'PATCH', body: bodyWithExtras({ name, description }, extras, { keepEmpty: true }) }),
    archive: (token: string, id: string): Promise<ApiResponse> => apiFetch(`${path}/${id}/archive`, { token, method: 'POST' }),
    restore: (token: string, id: string): Promise<ApiResponse> => apiFetch(`${path}/${id}/restore`, { token, method: 'POST' }),
  };
}

export const categoriesApi = referenceGroup('/api/categories');
export const locationsApi = referenceGroup('/api/locations');

// ---------------------------------------------------------------------------
// Suppliers (Phase 13A backend / 17 mobile)
// ---------------------------------------------------------------------------
// Writable by OWNER/ADMIN/MANAGER (suppliers.manage); viewable by every role
// (suppliers.view). Contact fields join the shared CRUD via `fields`.

export const suppliersApi = referenceGroup('/api/suppliers', {
  fields: ['contactName', 'phone', 'email'],
});

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

/**
 * A product create/update body assembled by ProductForm. Field names are the
 * server's own DTO names — `costPrice` / `sellingPrice` / `minimumStock`, not
 * `cost` / `price` / `minimumQuantity` — because the body is sent verbatim.
 */
export interface ProductInput {
  name?: string;
  sku?: string;
  barcode?: string;
  categoryId?: string;
  description?: string;
  unit?: string;
  costPrice?: number | null;
  sellingPrice?: number | null;
  minimumStock?: number | null;
  imageUrl?: string;
}

export const productsApi = {
  /** Paginated { items, page, limit, total, totalPages }. */
  list: (token: string, params?: QueryParams): Promise<ApiResponse> => apiFetch('/api/products', { token, params }),
  /** Products needing restock (available ≤ minimum, worst first, each flagged OUT_OF_STOCK/LOW_STOCK). */
  reorder: (token: string, params?: QueryParams): Promise<ApiResponse> => apiFetch('/api/products/reorder', { token, params }),
  get: (token: string, id: string): Promise<ApiResponse> => apiFetch(`/api/products/${id}`, { token }),
  /** Look up one product by its exact barcode (business-scoped). 404 when unknown. */
  barcode: (token: string, barcode: string): Promise<ApiResponse> =>
    apiFetch('/api/products/barcode', { token, params: { barcode } }),
  create: (token: string, payload: ProductInput): Promise<ApiResponse> =>
    apiFetch('/api/products', { token, method: 'POST', body: payload }),
  update: (token: string, id: string, payload: ProductInput): Promise<ApiResponse> =>
    apiFetch(`/api/products/${id}`, { token, method: 'PATCH', body: payload }),
  archive: (token: string, id: string): Promise<ApiResponse> => apiFetch(`/api/products/${id}/archive`, { token, method: 'POST' }),
  restore: (token: string, id: string): Promise<ApiResponse> => apiFetch(`/api/products/${id}/restore`, { token, method: 'POST' }),
  /**
   * Issue an internal EAN-13 barcode for a product that has none (Phase 12D).
   * Returns the updated product DTO. PRODUCTS_MANAGE; 409 if the product already
   * has a barcode or is archived. Never overwrites an existing code.
   */
  generateBarcode: (token: string, id: string): Promise<ApiResponse> =>
    apiFetch(`/api/products/${id}/generate-barcode`, { token, method: 'POST' }),
};

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

/** A stock-in / stock-out / adjust body, assembled by MovementForm. */
export interface MovementInput {
  productId: string;
  locationId: string;
  quantity: number | string;
  reason?: string;
  reference?: string;
}

/** A two-location transfer body (Phase 19), assembled by TransferForm. */
export interface TransferInput {
  productId: string;
  fromLocationId: string;
  toLocationId: string;
  quantity: number | string;
  reason?: string;
  reference?: string;
}

export const inventoryApi = {
  /** Inventory rows (paginated), each with authoritative quantity/available/status. */
  list: (token: string, params?: QueryParams): Promise<ApiResponse> => apiFetch('/api/inventory', { token, params }),
  get: (token: string, id: string): Promise<ApiResponse> => apiFetch(`/api/inventory/${id}`, { token }),
  stockIn: (token: string, { productId, locationId, quantity, reason, reference }: MovementInput): Promise<ApiResponse> =>
    apiFetch('/api/inventory/stock-in', {
      token,
      method: 'POST',
      body: { productId, locationId, quantity, reason, reference },
    }),
  stockOut: (token: string, { productId, locationId, quantity, reason, reference }: MovementInput): Promise<ApiResponse> =>
    apiFetch('/api/inventory/stock-out', {
      token,
      method: 'POST',
      body: { productId, locationId, quantity, reason, reference },
    }),
  /** quantity here is the absolute target (may be 0). MANAGER+ only. */
  adjust: (token: string, { productId, locationId, quantity, reason, reference }: MovementInput): Promise<ApiResponse> =>
    apiFetch('/api/inventory/adjust', {
      token,
      method: 'POST',
      body: { productId, locationId, quantity, reason, reference },
    }),
  /** Transaction history, newest first (filters: productId, locationId, type, from, to). */
  history: (token: string, params?: QueryParams): Promise<ApiResponse> => apiFetch('/api/inventory/history', { token, params }),
  /**
   * Move stock between two locations (Phase 19). MANAGER+ only.
   * 201 -> { reference, transaction, destinationTransaction, previousQuantity,
   * newQuantity, destinationPreviousQuantity, destinationNewQuantity }.
   * 409 TRANSFER_SAME_LOCATION / INSUFFICIENT_STOCK; 404 INVENTORY_NOT_FOUND;
   * 400 field problems (productId, fromLocationId, toLocationId, quantity).
   */
  transfer: (
    token: string,
    { productId, fromLocationId, toLocationId, quantity, reason, reference }: TransferInput,
  ): Promise<ApiResponse> =>
    apiFetch('/api/inventory/transfer', {
      token,
      method: 'POST',
      body: { productId, fromLocationId, toLocationId, quantity, reason, reference },
    }),
};

// ---------------------------------------------------------------------------
// Purchase orders (Phase 13A–13C backend / 13D read+receive / 17 manage)
// ---------------------------------------------------------------------------
// Manage (create/update/issue/cancel) requires purchase-orders.manage
// (OWNER/ADMIN/MANAGER). Read + receive are open to every role.

/** One line of a PO create/edit body. */
export interface PurchaseOrderLineInput {
  productId: string;
  quantityOrdered?: number | string;
  unitCost?: number | string | null;
  [field: string]: unknown;
}

/** A PO create/edit body assembled by PoForm. */
export interface PurchaseOrderInput {
  supplierId?: string | null;
  locationId?: string | null;
  expectedAt?: string | null;
  notes?: string | null;
  items?: PurchaseOrderLineInput[];
  [field: string]: unknown;
}

/** A claim-first receive body (Phase 13C), assembled by the receive screen. */
export interface ReceiveInput {
  lines: { productId: string; quantity: number }[];
  reference?: string;
}

export const purchaseOrdersApi = {
  /** Paginated PO headers { items, total, ... }. params: { status, q (number), page, limit }. */
  list: (token: string, params?: QueryParams): Promise<ApiResponse> => apiFetch('/api/purchase-orders', { token, params }),
  /** Full detail: header + items + receipts + pendingClaims. */
  get: (token: string, id: string): Promise<ApiResponse> => apiFetch(`/api/purchase-orders/${id}`, { token }),
  /**
   * Create a DRAFT. body: { supplierId, locationId, expectedAt?, notes?,
   * items: [{ productId, quantityOrdered, unitCost? }] }. 201 -> detail DTO.
   * 409 SUPPLIER_ARCHIVED / PO_NUMBER_CONFLICT; 400 field problems.
   */
  create: (token: string, payload: PurchaseOrderInput): Promise<ApiResponse> =>
    apiFetch('/api/purchase-orders', { token, method: 'POST', body: payload }),
  /**
   * Edit a DRAFT only (PATCH). Any supplied reference is re-verified; a
   * supplied `items` array replaces the full line set. 409 PO_NOT_DRAFT /
   * PO_STATE_CONFLICT.
   */
  update: (token: string, id: string, payload: PurchaseOrderInput): Promise<ApiResponse> =>
    apiFetch(`/api/purchase-orders/${id}`, { token, method: 'PATCH', body: payload }),
  /** Issue a DRAFT -> OPEN. 409 PO_ALREADY_OPEN / PO_CANCELED / PO_ALREADY_RECEIVED. */
  issue: (token: string, id: string): Promise<ApiResponse> => apiFetch(`/api/purchase-orders/${id}/issue`, { token, method: 'POST' }),
  /** Cancel a DRAFT or OPEN order -> CANCELED. 409 PO_ALREADY_CANCELED / PO_ALREADY_RECEIVED. */
  cancel: (token: string, id: string): Promise<ApiResponse> => apiFetch(`/api/purchase-orders/${id}/cancel`, { token, method: 'POST' }),
  /**
   * Claim-first receive (Phase 13C) against an OPEN order. body:
   * { lines: [{ productId, quantity }], reference? }. 200 -> { allReceived,
   * applied, po } (the fresh detail). 409 RECEIVE_CONFLICT carries `applied`
   * with the lines that landed — see ApiError.applied.
   */
  receive: (token: string, id: string, { lines, reference }: ReceiveInput): Promise<ApiResponse> =>
    apiFetch(`/api/purchase-orders/${id}/receive`, {
      token,
      method: 'POST',
      body: { lines, reference: reference?.trim() || undefined },
    }),
};

// ---------------------------------------------------------------------------
// Audit trail (Phase 16)
// ---------------------------------------------------------------------------
// Read-only record of every recorded action, newest first. OWNER/ADMIN only
// (audit.view). Filters: action, entityType, userId, from, to, q.

export const auditApi = {
  /** Paginated { items, page, limit, total, totalPages }. */
  list: (token: string, params?: QueryParams): Promise<ApiResponse> => apiFetch('/api/audit', { token, params }),
};

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export const dashboardApi = {
  summary: (token: string): Promise<ApiResponse> => apiFetch('/api/dashboard', { token }),
};

// ---------------------------------------------------------------------------
// AI Assistant (Phase 06)
// ---------------------------------------------------------------------------
// Read-only assistant over inventory tools. Conversations and messages are
// scoped server-side to the signed-in user's business. Chat returns a 503
// (AI_NOT_CONFIGURED) when the backend has no provider enabled — the UI maps
// that onto a friendly "ask an administrator" message.

export const aiApi = {
  /** The user's conversations, newest first (paginated). */
  conversations: (token: string, params?: QueryParams): Promise<ApiResponse> => apiFetch('/api/ai/conversations', { token, params }),
  /** Start a (possibly empty) conversation with an optional title. */
  createConversation: (token: string, { title }: { title?: string } = {}): Promise<ApiResponse> =>
    apiFetch('/api/ai/conversations', { token, method: 'POST', body: { title } }),
  /** Messages in one conversation, oldest first (paginated). */
  messages: (token: string, id: string, params?: QueryParams): Promise<ApiResponse> =>
    apiFetch(`/api/ai/conversations/${id}/messages`, { token, params }),
  /**
   * Run one user message through the assistant. Omit conversationId to start a
   * new conversation (title is derived from the first message). Returns
   * { conversation, userMessage, assistantMessage }.
   */
  chat: (token: string, { conversationId, message }: { conversationId?: string | null; message: string }): Promise<ApiResponse> =>
    apiFetch('/api/ai/chat', { token, method: 'POST', body: { conversationId, message } }),
};

export default {
  register,
  login,
  me,
  changePassword,
  forgotPassword,
  resetPassword,
  firebaseExchange,
  renew,
  firebaseRegister,
  firebaseLink,
  updateMe,
  logout,
  sessions,
  revokeSession,
  categoriesApi,
  locationsApi,
  suppliersApi,
  productsApi,
  inventoryApi,
  purchaseOrdersApi,
  usersApi,
  auditApi,
  dashboardApi,
  aiApi,
};
