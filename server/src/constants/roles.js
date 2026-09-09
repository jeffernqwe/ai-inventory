/**
 * Roles and role permissions, per SYSTEM_SPECIFICATION.md §7.
 *
 * Roles: OWNER, ADMIN, MANAGER, STAFF.
 * These values are stored in the User.role field and are the ONLY source of
 * truth for authorization — role claims from clients/tokens are never trusted.
 */

export const ROLES = Object.freeze({
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  STAFF: 'STAFF',
});

export const ROLE_VALUES = Object.freeze(Object.values(ROLES));

/**
 * Permission catalogue. Coarse, resource-level capabilities used by protected
 * routes (Phases 04+). Explicit here so the spec's capability matrix is
 * encoded in one place.
 */
export const PERMISSIONS = Object.freeze({
  BUSINESS_MANAGE: 'business.manage', // OWNER only
  USERS_MANAGE: 'users.manage', // OWNER only
  ROLES_MANAGE: 'roles.manage', // OWNER only
  LOCATIONS_MANAGE: 'locations.manage',
  CATEGORIES_MANAGE: 'categories.manage',
  PRODUCTS_MANAGE: 'products.manage',
  PRODUCTS_VIEW: 'products.view',
  SUPPLIERS_MANAGE: 'suppliers.manage',
  SUPPLIERS_VIEW: 'suppliers.view',
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

/** Capabilities granted to each role, per SYSTEM_SPECIFICATION.md §7. */
export const ROLE_PERMISSIONS = Object.freeze({
  OWNER: ALL,
  ADMIN: Object.freeze([
    PERMISSIONS.LOCATIONS_MANAGE,
    PERMISSIONS.CATEGORIES_MANAGE,
    PERMISSIONS.PRODUCTS_MANAGE,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.SUPPLIERS_MANAGE,
    PERMISSIONS.SUPPLIERS_VIEW,
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
    PERMISSIONS.SUPPLIERS_MANAGE,
    PERMISSIONS.SUPPLIERS_VIEW,
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
    PERMISSIONS.SUPPLIERS_VIEW,
    PERMISSIONS.PURCHASE_ORDERS_VIEW,
    PERMISSIONS.PURCHASE_ORDERS_RECEIVE,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_STOCK_IN,
    PERMISSIONS.INVENTORY_STOCK_OUT,
    PERMISSIONS.INVENTORY_HISTORY_VIEW,
    PERMISSIONS.AI_USE,
  ]),
});

/** Whether a role holds a given permission. */
export function hasPermission(role, permission) {
  const granted = ROLE_PERMISSIONS[role];
  return Array.isArray(granted) && granted.includes(permission);
}

export default { ROLES, ROLE_VALUES, PERMISSIONS, ROLE_PERMISSIONS, hasPermission };
