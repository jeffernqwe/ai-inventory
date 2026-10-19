// The real routes `verify:roles` checks, one per capability that has an endpoint.
//
// EXPECTATIONS ARE NOT IN THIS FILE. Every cell's expected outcome is computed by
// asking the shipped `hasPermission(role, permission)` — the same function the
// authorization middleware uses — so a change to the role matrix moves the
// expectation with it and this table cannot quietly disagree with the code it is
// meant to verify. That is the design rule Phase 24 established, and it is the
// whole reason a hand-written "STAFF: deny" column is deliberately absent.
//
// WHY `/api/ai/chat` IS NOT HERE. It would call the configured AI provider, and
// the deployed free tier allows roughly 50 requests a day in total (roadmap
// §27BF). A permission check must not spend quota, so `ai.use` is exercised
// through its READ route (`GET /api/ai/conversations`), which is gated by the
// same permission and answers from MongoDB.
//
// WHY BY-ID ROUTES USE AN ABSENT ID. A syntactically valid, non-existent
// ObjectId reaches the controller and answers 404 NOT_FOUND — still proof the
// gate admitted the caller, and proof that nothing was created. No route here
// writes to the fixture's data: the POST cells are refused before validation for
// the roles that lack the permission, and for the roles that hold it they are
// cancelled by the missing body / absent id rather than by a real write.
export const ABSENT_ID = '000000000000000000000000';

/** Routes gated by a permission. */
export const MATRIX = Object.freeze([
  // OWNER + ADMIN
  { method: 'GET', path: '/api/users', permission: 'users.manage' },
  { method: 'GET', path: '/api/audit', permission: 'audit.view' },
  { method: 'POST', path: '/api/categories', permission: 'categories.manage' },
  { method: 'POST', path: '/api/locations', permission: 'locations.manage' },

  // OWNER + ADMIN + MANAGER
  { method: 'GET', path: '/api/dashboard', permission: 'dashboard.view' },
  { method: 'POST', path: '/api/inventory/adjust', permission: 'inventory.manage' },
  { method: 'POST', path: '/api/products', permission: 'products.manage' },
  { method: 'POST', path: '/api/suppliers', permission: 'suppliers.manage' },
  { method: 'POST', path: '/api/purchase-orders', permission: 'purchase-orders.manage' },

  // every role
  { method: 'GET', path: '/api/products', permission: 'products.view' },
  { method: 'GET', path: '/api/suppliers', permission: 'suppliers.view' },
  { method: 'GET', path: '/api/purchase-orders', permission: 'purchase-orders.view' },
  { method: 'GET', path: '/api/inventory', permission: 'inventory.view' },
  { method: 'GET', path: '/api/inventory/history', permission: 'inventory.history.view' },
  { method: 'GET', path: '/api/ai/conversations', permission: 'ai.use' },
  { method: 'POST', path: '/api/inventory/stock-in', permission: 'inventory.stock-in' },
  { method: 'POST', path: '/api/inventory/stock-out', permission: 'inventory.stock-out' },
  { method: 'POST', path: `/api/purchase-orders/${ABSENT_ID}/receive`, permission: 'purchase-orders.receive' },
]);

/**
 * Routes held by `requireAuth` alone. They must not discriminate by role, so
 * every one of the four accounts must be able to read them.
 */
export const AUTHENTICATED_ROUTES = Object.freeze([
  { method: 'GET', path: '/api/auth/me' },
  { method: 'GET', path: '/api/categories' },
  { method: 'GET', path: '/api/locations' },
]);

/** The global notFound handler answers with no `code`; every ApiError 404 has one. */
export function isUnknownRoute(res) {
  return res.status === 404 && (res.json === null || res.json?.code === undefined);
}

/**
 * The request was allowed past the authorization gate.
 *
 * A 400/404/409 still proves admission — the gate is the second handler, so it
 * decides before any validation or lookup runs. A code-less 404 does NOT, because
 * it is the global handler answering for a path that does not exist; that is how a
 * mistyped route in this table would otherwise look like a pass.
 */
export function admitted(res) {
  return res.status !== 401 && res.status !== 403 && !isUnknownRoute(res);
}

/**
 * The gate refused the caller with the standard answer.
 *
 * The code is checked as well as the status: a 403 that carries another code
 * (ADMIN_RESTRICTED, CANNOT_MODIFY_SELF, OWNER_IMMUTABLE) is a business rule
 * refusing AFTER the permission gate admitted, and must not be mistaken for the
 * permission refusal a `deny` cell is asserting.
 */
export function forbidden(res) {
  return res.status === 403 && res.json?.code === 'FORBIDDEN';
}

/** Does the observed response agree with what `hasPermission` said should happen? */
export function cellAgrees(expectedAllowed, res) {
  return expectedAllowed ? admitted(res) : forbidden(res);
}

export default { MATRIX, AUTHENTICATED_ROUTES, ABSENT_ID, isUnknownRoute, admitted, forbidden, cellAgrees };
