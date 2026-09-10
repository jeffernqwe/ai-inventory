import { apiFetch } from './client';

/**
 * Typed endpoint wrappers over the backend REST API. Each function returns the
 * parsed JSON payload the server sends (pagination envelopes, DTOs, or
 * { token, user } etc.). Screens call these — they never call fetch directly.
 * All protected calls take the session `token` from auth state.
 */

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/** POST /api/auth/register -> { user, business } (201, no token issued). */
export function register({ businessName, name, email, password }) {
  return apiFetch('/api/auth/register', {
    method: 'POST',
    body: { businessName, name, email, password },
  });
}

/** POST /api/auth/login -> { token, tokenType, expiresIn, user }. */
export function login({ email, password }) {
  return apiFetch('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

/** GET /api/auth/me -> { user }. Restores the session on app boot. */
export function me(token) {
  return apiFetch('/api/auth/me', { token });
}

/** POST /api/auth/change-password -> { message }. body: { currentPassword, newPassword }. 400 INVALID_CURRENT_PASSWORD / VALIDATION_ERROR; revokes every prior JWT (401 SESSION_INVALIDATED). */
export function changePassword(token, { currentPassword, newPassword }) {
  return apiFetch('/api/auth/change-password', {
    token,
    method: 'POST',
    body: { currentPassword, newPassword },
  });
}

/** PATCH /api/auth/me -> { user }. Updates ONLY the caller's name. 400 VALIDATION_ERROR for any other field. */
export function updateMe(token, { name }) {
  return apiFetch('/api/auth/me', { token, method: 'PATCH', body: { name } });
}

// ---------------------------------------------------------------------------
// Users (Phase 14A backend / 14B mobile)
// ---------------------------------------------------------------------------
// OWNER/ADMIN only (users.manage). Create/assign never includes OWNER; the
// server enforces no-self-change, OWNER immutability, and ADMIN<->ADMIN rules.

export const usersApi = {
  /** Paginated { items, page, limit, total, totalPages }. params: { q (name/email), status (ACTIVE|DISABLED), page, limit }. */
  list: (token, params) => apiFetch('/api/users', { token, params }),
  /** One business user (public shape: id, name, email, role, status, createdAt). */
  get: (token, id) => apiFetch(`/api/users/${id}`, { token }),
  /** Create ADMIN/MANAGER/STAFF. body: { name, email, password, role }. 409 EMAIL_IN_USE; 400 field problems. */
  create: (token, payload) => apiFetch('/api/users', { token, method: 'POST', body: payload }),
  /** Change role and/or status — body has >=1 of { role, status }. */
  update: (token, id, payload) => apiFetch(`/api/users/${id}`, { token, method: 'PATCH', body: payload }),
};

// ---------------------------------------------------------------------------
// Reference resources: categories & locations (shared CRUD + archive shape)
// ---------------------------------------------------------------------------

function referenceGroup(path) {
  return {
    list: (token, params) => apiFetch(`${path}`, { token, params }),
    get: (token, id) => apiFetch(`${path}/${id}`, { token }),
    create: (token, { name, description }) =>
      apiFetch(`${path}`, { token, method: 'POST', body: { name, description } }),
    update: (token, id, { name, description }) =>
      apiFetch(`${path}/${id}`, { token, method: 'PATCH', body: { name, description } }),
    archive: (token, id) => apiFetch(`${path}/${id}/archive`, { token, method: 'POST' }),
    restore: (token, id) => apiFetch(`${path}/${id}/restore`, { token, method: 'POST' }),
  };
}

export const categoriesApi = referenceGroup('/api/categories');
export const locationsApi = referenceGroup('/api/locations');

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export const productsApi = {
  /** Paginated { items, page, limit, total, totalPages }. */
  list: (token, params) => apiFetch('/api/products', { token, params }),
  /** Products needing restock (available ≤ minimum, worst first, each flagged OUT_OF_STOCK/LOW_STOCK). */
  reorder: (token, params) => apiFetch('/api/products/reorder', { token, params }),
  get: (token, id) => apiFetch(`/api/products/${id}`, { token }),
  /** Look up one product by its exact barcode (business-scoped). 404 when unknown. */
  barcode: (token, barcode) => apiFetch('/api/products/barcode', { token, params: { barcode } }),
  create: (token, payload) => apiFetch('/api/products', { token, method: 'POST', body: payload }),
  update: (token, id, payload) => apiFetch(`/api/products/${id}`, { token, method: 'PATCH', body: payload }),
  archive: (token, id) => apiFetch(`/api/products/${id}/archive`, { token, method: 'POST' }),
  restore: (token, id) => apiFetch(`/api/products/${id}/restore`, { token, method: 'POST' }),
  /**
   * Issue an internal EAN-13 barcode for a product that has none (Phase 12D).
   * Returns the updated product DTO. PRODUCTS_MANAGE; 409 if the product already
   * has a barcode or is archived. Never overwrites an existing code.
   */
  generateBarcode: (token, id) => apiFetch(`/api/products/${id}/generate-barcode`, { token, method: 'POST' }),
};

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export const inventoryApi = {
  /** Inventory rows (paginated), each with authoritative quantity/available/status. */
  list: (token, params) => apiFetch('/api/inventory', { token, params }),
  get: (token, id) => apiFetch(`/api/inventory/${id}`, { token }),
  stockIn: (token, { productId, locationId, quantity, reason, reference }) =>
    apiFetch('/api/inventory/stock-in', {
      token,
      method: 'POST',
      body: { productId, locationId, quantity, reason, reference },
    }),
  stockOut: (token, { productId, locationId, quantity, reason, reference }) =>
    apiFetch('/api/inventory/stock-out', {
      token,
      method: 'POST',
      body: { productId, locationId, quantity, reason, reference },
    }),
  /** quantity here is the absolute target (may be 0). MANAGER+ only. */
  adjust: (token, { productId, locationId, quantity, reason, reference }) =>
    apiFetch('/api/inventory/adjust', {
      token,
      method: 'POST',
      body: { productId, locationId, quantity, reason, reference },
    }),
  /** Transaction history, newest first (filters: productId, locationId, type, from, to). */
  history: (token, params) => apiFetch('/api/inventory/history', { token, params }),
};

// ---------------------------------------------------------------------------
// Purchase orders (Phase 13A–13C)
// ---------------------------------------------------------------------------
// Read + receive only on mobile (Phase 13D). Create/edit/issue/cancel stay
// backend-only — no manage wrappers are exposed until a manage UI exists.

export const purchaseOrdersApi = {
  /** Paginated PO headers { items, total, ... }. params: { status, q (number), page, limit }. */
  list: (token, params) => apiFetch('/api/purchase-orders', { token, params }),
  /** Full detail: header + items + receipts + pendingClaims. */
  get: (token, id) => apiFetch(`/api/purchase-orders/${id}`, { token }),
  /**
   * Claim-first receive (Phase 13C) against an OPEN order. body:
   * { lines: [{ productId, quantity }], reference? }. 200 -> { allReceived,
   * applied, po } (the fresh detail). 409 RECEIVE_CONFLICT carries `applied`
   * with the lines that landed — see ApiError.applied.
   */
  receive: (token, id, { lines, reference }) =>
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
  list: (token, params) => apiFetch('/api/audit', { token, params }),
};

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export const dashboardApi = {
  summary: (token) => apiFetch('/api/dashboard', { token }),
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
  conversations: (token, params) => apiFetch('/api/ai/conversations', { token, params }),
  /** Start a (possibly empty) conversation with an optional title. */
  createConversation: (token, { title } = {}) =>
    apiFetch('/api/ai/conversations', { token, method: 'POST', body: { title } }),
  /** Messages in one conversation, oldest first (paginated). */
  messages: (token, id, params) => apiFetch(`/api/ai/conversations/${id}/messages`, { token, params }),
  /**
   * Run one user message through the assistant. Omit conversationId to start a
   * new conversation (title is derived from the first message). Returns
   * { conversation, userMessage, assistantMessage }.
   */
  chat: (token, { conversationId, message }) =>
    apiFetch('/api/ai/chat', { token, method: 'POST', body: { conversationId, message } }),
};

export default {
  register,
  login,
  me,
  categoriesApi,
  locationsApi,
  productsApi,
  inventoryApi,
  purchaseOrdersApi,
  usersApi,
  auditApi,
  dashboardApi,
  aiApi,
};
