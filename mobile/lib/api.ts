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
