/**
 * Client-side mirror of the server's RBAC matrix (server/src/constants/roles.js).
 *
 * The backend remains the security boundary — every protected route re-derives
 * role/businessId from the database and enforces these permissions server-side.
 * This mirror only decides what UI to show (buttons, screens, actions) so the
 * app never presents an action the server would reject.
 */

export const ROLES = Object.freeze({
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  STAFF: 'STAFF',
});

export const PERMISSIONS = Object.freeze({
  BUSINESS_MANAGE: 'business.manage',
  USERS_MANAGE: 'users.manage',
  ROLES_MANAGE: 'roles.manage',
  LOCATIONS_MANAGE: 'locations.manage',
  CATEGORIES_MANAGE: 'categories.manage',
  PRODUCTS_MANAGE: 'products.manage',
  PRODUCTS_VIEW: 'products.view',
  PURCHASE_ORDERS_MANAGE: 'purchase-orders.manage',
  PURCHASE_ORDERS_VIEW: 'purchase-orders.view',
  PURCHASE_ORDERS_RECEIVE: 'purchase-orders.receive',
  INVENTORY_MANAGE: 'inventory.manage',
  INVENTORY_VIEW: 'inventory.view',
  INVENTORY_STOCK_IN: 'inventory.stock-in',
  INVENTORY_STOCK_OUT: 'inventory.stock-out',
  INVENTORY_HISTORY_VIEW: 'inventory.history.view',
  TRANSACTIONS_VIEW: 'transactions.view',
  DASHBOARD_VIEW: 'dashboard.view',
  AI_USE: 'ai.use',
});

const ALL = Object.freeze(Object.values(PERMISSIONS));

/** Keep in lock-step with the server ROLE_PERMISSIONS. */
export const ROLE_PERMISSIONS = Object.freeze({
  OWNER: ALL,
  ADMIN: Object.freeze([
    PERMISSIONS.USERS_MANAGE,
    PERMISSIONS.LOCATIONS_MANAGE,
    PERMISSIONS.CATEGORIES_MANAGE,
    PERMISSIONS.PRODUCTS_MANAGE,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.PURCHASE_ORDERS_MANAGE,
    PERMISSIONS.PURCHASE_ORDERS_VIEW,
    PERMISSIONS.PURCHASE_ORDERS_RECEIVE,
    PERMISSIONS.INVENTORY_MANAGE,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_STOCK_IN,
    PERMISSIONS.INVENTORY_STOCK_OUT,
    PERMISSIONS.INVENTORY_HISTORY_VIEW,
    PERMISSIONS.TRANSACTIONS_VIEW,
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.AI_USE,
  ]),
  MANAGER: Object.freeze([
    PERMISSIONS.PRODUCTS_MANAGE,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.PURCHASE_ORDERS_MANAGE,
    PERMISSIONS.PURCHASE_ORDERS_VIEW,
    PERMISSIONS.PURCHASE_ORDERS_RECEIVE,
    PERMISSIONS.INVENTORY_MANAGE,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_STOCK_IN,
    PERMISSIONS.INVENTORY_STOCK_OUT,
    PERMISSIONS.INVENTORY_HISTORY_VIEW,
    PERMISSIONS.TRANSACTIONS_VIEW,
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.AI_USE,
  ]),
  STAFF: Object.freeze([
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.PURCHASE_ORDERS_VIEW,
    PERMISSIONS.PURCHASE_ORDERS_RECEIVE,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_STOCK_IN,
    PERMISSIONS.INVENTORY_STOCK_OUT,
    PERMISSIONS.INVENTORY_HISTORY_VIEW,
    PERMISSIONS.AI_USE,
  ]),
});

export function can(user, permission) {
  if (!user?.role) return false;
  const granted = ROLE_PERMISSIONS[user.role];
  return Array.isArray(granted) && granted.includes(permission);
}

// Convenience predicates used by screens/navigation.
export const canManageCategories = (u) => can(u, PERMISSIONS.CATEGORIES_MANAGE);
export const canManageLocations = (u) => can(u, PERMISSIONS.LOCATIONS_MANAGE);
export const canManageProducts = (u) => can(u, PERMISSIONS.PRODUCTS_MANAGE);
export const canViewDashboard = (u) => can(u, PERMISSIONS.DASHBOARD_VIEW);
export const canAdjustStock = (u) => can(u, PERMISSIONS.INVENTORY_MANAGE);
export const canStockIn = (u) => can(u, PERMISSIONS.INVENTORY_STOCK_IN);
export const canStockOut = (u) => can(u, PERMISSIONS.INVENTORY_STOCK_OUT);
export const canUseAi = (u) => can(u, PERMISSIONS.AI_USE);
export const canManagePurchaseOrders = (u) => can(u, PERMISSIONS.PURCHASE_ORDERS_MANAGE);
export const canViewPurchaseOrders = (u) => can(u, PERMISSIONS.PURCHASE_ORDERS_VIEW);
export const canReceivePurchaseOrders = (u) => can(u, PERMISSIONS.PURCHASE_ORDERS_RECEIVE);
export const canManageUsers = (u) => can(u, PERMISSIONS.USERS_MANAGE);

/**
 * Roles an actor may assign when creating/editing a user. OWNER may assign
 * any non-OWNER role; ADMIN only MANAGER/STAFF (never ADMIN). Mirrors the
 * server's NON_OWNER_ROLES + ADMIN_RESTRICTED rules — UI-only.
 */
export function assignableRoles(actor) {
  if (actor?.role === ROLES.OWNER) return [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF];
  if (actor?.role === ROLES.ADMIN) return [ROLES.MANAGER, ROLES.STAFF];
  return [];
}

/**
 * Whether `actor` may edit `target`'s role/status. Mirrors the server rule
 * order in users.service.update: no self-change (CANNOT_MODIFY_SELF), OWNER
 * immutable (OWNER_IMMUTABLE), ADMIN cannot touch/assign ADMIN
 * (ADMIN_RESTRICTED). UI hides the Edit affordance; the backend stays
 * authoritative and rejects anyway.
 */
export function canModifyUser(actor, target) {
  if (!canManageUsers(actor)) return false;
  if (!target) return false;
  if (String(actor?.id) === String(target.id)) return false;
  if (target.role === ROLES.OWNER) return false;
  if (actor?.role === ROLES.ADMIN && target.role === ROLES.ADMIN) return false;
  return true;
}

/** Label used in the UI ("Profile" / headers). */
export function roleLabel(role) {
  return (
    {
      OWNER: 'Owner',
      ADMIN: 'Admin',
      MANAGER: 'Manager',
      STAFF: 'Staff',
    }[role] ?? role ?? 'User'
  );
}

/**
 * First screen shown after sign-in. Dashboard needs MANAGER+; STAFF (and any
 * role without it) land on the inventory view instead.
 */
export function defaultHomePath(user) {
  return canViewDashboard(user) ? '/dashboard' : '/inventory';
}

export default { ROLES, PERMISSIONS, ROLE_PERMISSIONS, can, roleLabel, canUseAi };
