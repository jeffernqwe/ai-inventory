/**
 * Lightweight request validation.
 *
 * Auth + domain validators return an array of { field, message } problems
 * (empty when valid). Field helpers return { value, problems } so callers can
 * normalize input and collect errors in one pass.
 */

import { NON_OWNER_ROLES } from '../constants/roles.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../constants/audit.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL = 254;
const PASSWORD_MIN = 8;
// bcrypt only uses the first 72 bytes of a password — enforce it up front.
const PASSWORD_MAX = 72;

// ---------------------------------------------------------------------------
// Auth (Phase 03) + user management (Phase 14A)
// ---------------------------------------------------------------------------

function emailProblems(value) {
  const problems = [];
  if (!value) {
    problems.push({ field: 'email', message: 'email is required' });
  } else if (value.length > MAX_EMAIL || !EMAIL_RE.test(value)) {
    problems.push({ field: 'email', message: 'email must be a valid email address' });
  }
  return problems;
}

function passwordProblems(password) {
  const problems = [];
  if (typeof password !== 'string' || password.length === 0) {
    problems.push({ field: 'password', message: 'password is required' });
  } else if (password.length < PASSWORD_MIN) {
    problems.push({ field: 'password', message: `password must be at least ${PASSWORD_MIN} characters` });
  } else if (password.length > PASSWORD_MAX) {
    problems.push({ field: 'password', message: `password must be at most ${PASSWORD_MAX} characters` });
  }
  return problems;
}

export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function validateRegister(body) {
  const problems = [];
  const businessName = typeof body?.businessName === 'string' ? body.businessName.trim() : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const email = normalizeEmail(body?.email);
  const password = body?.password;

  if (!businessName) problems.push({ field: 'businessName', message: 'businessName is required' });
  else if (businessName.length > 100)
    problems.push({ field: 'businessName', message: 'businessName must be at most 100 characters' });

  if (!name) problems.push({ field: 'name', message: 'name is required' });
  else if (name.length > 100) problems.push({ field: 'name', message: 'name must be at most 100 characters' });

  problems.push(...emailProblems(email));
  problems.push(...passwordProblems(password));

  return problems;
}

export function validateLogin(body) {
  const problems = [];
  const email = normalizeEmail(body?.email);
  const password = body?.password;

  problems.push(...emailProblems(email));

  if (typeof password !== 'string' || password.length === 0) {
    problems.push({ field: 'password', message: 'password is required' });
  }

  return problems;
}

// ---------------------------------------------------------------------------
// Account security + profile (Phase 15)
// ---------------------------------------------------------------------------

/**
 * Change-password payload. currentPassword is required and is verified against
 * the stored hash in the service BEFORE anything changes. newPassword reuses
 * the shared password rules (8–72 chars) and is reported under its own field
 * so the client can anchor the error on the right input.
 */
export function validateChangePassword(body) {
  const problems = [];
  if (typeof body?.currentPassword !== 'string' || body.currentPassword.length === 0) {
    problems.push({ field: 'currentPassword', message: 'currentPassword is required' });
  }
  problems.push(
    ...passwordProblems(body?.newPassword).map((p) => ({ ...p, field: 'newPassword' }))
  );
  return problems;
}

const ME_NAME_MAX = 100;
/** The ONLY field the profile-update endpoint accepts (Phase 15). */
const ME_UPDATE_FIELDS = new Set(['name']);

/**
 * Profile-update payload. Strict allowlist: every key outside `name` — email,
 * role, status, businessId, password, passwordHash, anything else — is
 * rejected explicitly, never silently ignored. Identity comes exclusively from
 * the authenticated session, never from the payload.
 */
export function validateMeUpdate(body) {
  const problems = [];
  const bodyObj = body && typeof body === 'object' ? body : {};
  for (const key of Object.keys(bodyObj)) {
    if (!ME_UPDATE_FIELDS.has(key)) {
      problems.push({ field: key, message: `field '${key}' is not allowed` });
    }
  }
  const name = requiredString(bodyObj?.name, 'name', ME_NAME_MAX);
  problems.push(...name.problems);
  return { problems, name: name.value };
}

// ---------------------------------------------------------------------------
// Session lifecycle (Phase 26A)
// ---------------------------------------------------------------------------

const LOGOUT_FIELDS = new Set(['all']);

/**
 * Sign-out payload. The endpoint takes no identity input at all — which session
 * ends comes from the caller's own token, and whose sessions are ended comes
 * from the authenticated user — so the only accepted key is the `all` flag that
 * turns this into "sign out everywhere". A strict allowlist, matching the other
 * self-service payloads: a client that tries to name a `userId`, a `sessionId`
 * or a `businessId` is refused outright rather than silently ignored, so the
 * attempt is visible instead of looking like it worked.
 */
export function validateLogout(body) {
  const problems = [];
  const bodyObj = body && typeof body === 'object' ? body : {};
  for (const key of Object.keys(bodyObj)) {
    if (!LOGOUT_FIELDS.has(key)) {
      problems.push({ field: key, message: `field '${key}' is not allowed` });
    }
  }
  const all = bodyObj.all === undefined ? false : bodyObj.all;
  if (typeof all !== 'boolean') {
    problems.push({ field: 'all', message: 'all must be true or false' });
  }
  return { problems, all: all === true };
}

// ---------------------------------------------------------------------------
// User management (Phase 14A)
// ---------------------------------------------------------------------------

const USER_NAME_MAX = 100;
/** User statuses assignable through the user-management API. */
export const USER_STATUSES = Object.freeze(['ACTIVE', 'DISABLED']);

/**
 * Create-user payload. role is REQUIRED and must be ADMIN/MANAGER/STAFF —
 * OWNER can never be created through the API (registration is the only path
 * that mints an OWNER). businessId is never accepted.
 */
export function validateUserCreate(body) {
  const problems = [];

  const name = requiredString(body?.name, 'name', USER_NAME_MAX);
  problems.push(...name.problems);

  problems.push(...emailProblems(normalizeEmail(body?.email)));
  problems.push(...passwordProblems(body?.password));

  const role = body?.role;
  if (!NON_OWNER_ROLES.includes(role)) {
    problems.push({ field: 'role', message: 'role is required and must be one of ADMIN, MANAGER, STAFF' });
  }

  return {
    problems,
    name: name.value,
    email: normalizeEmail(body?.email),
    password: body?.password,
    role,
  };
}

/**
 * Update-user payload (Phase 14A): role and/or status, at least one present.
 * `role` may only be ADMIN/MANAGER/STAFF; `status` only ACTIVE/DISABLED.
 * Service-side rules (self/OWNER/ADMIN restrictions) run after this pass.
 */
export function validateUserUpdate(body) {
  const problems = [];

  const hasRole = body?.role !== undefined && body?.role !== null && body?.role !== '';
  const hasStatus = body?.status !== undefined && body?.status !== null && body?.status !== '';
  if (!hasRole && !hasStatus) {
    problems.push({ field: 'body', message: 'At least one of role or status is required' });
  }

  const role = hasRole ? body.role : undefined;
  if (hasRole && !NON_OWNER_ROLES.includes(role)) {
    problems.push({ field: 'role', message: 'role must be one of ADMIN, MANAGER, STAFF' });
  }

  const status = hasStatus ? body.status : undefined;
  if (hasStatus && !USER_STATUSES.includes(status)) {
    problems.push({ field: 'status', message: 'status must be one of ACTIVE, DISABLED' });
  }

  return { problems, role, status };
}

// ---------------------------------------------------------------------------
// Shared field helpers (Phase 04)
// ---------------------------------------------------------------------------

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

export function isObjectId(value) {
  return typeof value === 'string' && OBJECT_ID_RE.test(value);
}

/** Optional ObjectId. Blank -> undefined; invalid -> a problem entry. */
export function optionalObjectId(value, field) {
  if (value === undefined || value === null || value === '') {
    return { value: undefined, problems: [] };
  }
  if (!isObjectId(value)) {
    return { value: undefined, problems: [{ field, message: `${field} must be a valid id` }] };
  }
  return { value, problems: [] };
}

/** Trimmed optional string; blank -> undefined; over-length -> a problem. */
export function optionalString(value, field, max) {
  if (value === undefined || value === null) return { value: undefined, problems: [] };
  if (typeof value !== 'string') {
    return { value: undefined, problems: [{ field, message: `${field} must be a string` }] };
  }
  const trimmed = value.trim();
  if (trimmed === '') return { value: undefined, problems: [] };
  if (max != null && trimmed.length > max) {
    return { value: undefined, problems: [{ field, message: `${field} must be at most ${max} characters` }] };
  }
  return { value: trimmed, problems: [] };
}

/** Required trimmed string. */
export function requiredString(value, field, max) {
  if (typeof value !== 'string' || value.trim() === '') {
    return { value: undefined, problems: [{ field, message: `${field} is required` }] };
  }
  return optionalString(value, field, max);
}

/**
 * `q` for a list endpoint (Phase 20D). A `q` that is PRESENT but blank
 * (`?q=`, `?q=%20%20`) is a malformed filter, not an absent one: it is rejected
 * rather than dropped, because quietly answering with the unfiltered collection
 * is exactly the failure this guards. An ABSENT `q` still means "no search" and
 * stays valid — the client omits it rather than sending it empty.
 *
 * The non-string branch (a repeated `?q=a&q=b` arrives as an array) yields the
 * same problem, which is what the product/inventory list parsers did before
 * this was consolidated.
 */
export function optionalSearch(value, field = 'q', max) {
  if (value === undefined || value === null) return { value: undefined, problems: [] };
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (trimmed === '') {
    return { value: undefined, problems: [{ field, message: `${field} must not be empty` }] };
  }
  return optionalString(trimmed, field, max);
}

/**
 * Enum-valued list filter (Phase 20D). An unknown value is a client error, never
 * a filter to quietly ignore. `message` lets an endpoint keep the wording it
 * already used for this field.
 */
export function optionalEnum(value, field, allowed, { message } = {}) {
  if (value === undefined || value === null) return { value: undefined, problems: [] };
  if (allowed.includes(value)) return { value, problems: [] };
  return {
    value: undefined,
    problems: [{ field, message: message ?? `${field} must be one of ${allowed.join(', ')}` }],
  };
}

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function numberProblems(value, field, { min = -Infinity, max = Infinity, integer = false } = {}) {
  const problems = [];
  if (value === null) {
    problems.push({ field, message: `${field} must be a valid number` });
    return problems;
  }
  if (value < min) problems.push({ field, message: `${field} must be at least ${min}` });
  if (value > max) problems.push({ field, message: `${field} must be at most ${max}` });
  if (integer && !Number.isInteger(value)) {
    problems.push({ field, message: `${field} must be a whole number` });
  }
  return problems;
}

/** Required finite number within [min, max]. */
export function requiredNumber(value, field, opts = {}) {
  const n = toNumber(value);
  if (n === null) {
    return { value: undefined, problems: [{ field, message: `${field} is required and must be a number` }] };
  }
  return { value: n, problems: numberProblems(n, field, opts) };
}

/** Optional finite number; absent when blank/undefined. */
export function optionalNumber(value, field, opts = {}) {
  if (value === undefined || value === null || value === '') {
    return { value: undefined, problems: [] };
  }
  const n = toNumber(value);
  if (n === null) {
    return { value: undefined, problems: [{ field, message: `${field} must be a valid number` }] };
  }
  return { value: n, problems: numberProblems(n, field, opts) };
}

// ---------------------------------------------------------------------------
// Domain validators (Phase 04)
// ---------------------------------------------------------------------------

const CATEGORY_NAME_MAX = 100;
const LOCATION_NAME_MAX = 100;
const DESCRIPTION_MAX = 500;

function nameAndDescriptionProblems(body, partial, nameMax, prefix) {
  const problems = [];
  const r = partial ? optionalString(body?.name, 'name', nameMax) : requiredString(body?.name, 'name', nameMax);
  problems.push(...r.problems);
  const d = optionalString(body?.description, 'description', DESCRIPTION_MAX);
  problems.push(...d.problems);
  return { problems, name: r.value, description: d.value, prefix };
}

export function validateCategory(body, { partial = false } = {}) {
  const { problems, name, description } = nameAndDescriptionProblems(body, partial, CATEGORY_NAME_MAX, 'category');
  return { problems, name, description };
}

export function validateLocation(body, { partial = false } = {}) {
  const { problems, name, description } = nameAndDescriptionProblems(body, partial, LOCATION_NAME_MAX, 'location');
  return { problems, name, description };
}

const SUPPLIER_NAME_MAX = 100;
const CONTACT_NAME_MAX = 100;
const PHONE_MAX = 50;

export function validateSupplier(body, { partial = false } = {}) {
  const problems = [];

  const name = partial ? optionalString(body?.name, 'name', SUPPLIER_NAME_MAX)
    : requiredString(body?.name, 'name', SUPPLIER_NAME_MAX);
  problems.push(...name.problems);

  const description = optionalString(body?.description, 'description', DESCRIPTION_MAX);
  problems.push(...description.problems);

  const contactName = optionalString(body?.contactName, 'contactName', CONTACT_NAME_MAX);
  problems.push(...contactName.problems);

  const phone = optionalString(body?.phone, 'phone', PHONE_MAX);
  problems.push(...phone.problems);

  const email = optionalString(body?.email, 'email', MAX_EMAIL);
  problems.push(...email.problems);
  if (email.value !== undefined && !EMAIL_RE.test(email.value)) {
    problems.push({ field: 'email', message: 'email must be a valid email address' });
  }

  return {
    problems,
    name: name.value,
    description: description.value,
    contactName: contactName.value,
    phone: phone.value,
    email: email.value,
  };
}

const PRODUCT_NAME_MAX = 120;
const PRODUCT_DESCRIPTION_MAX = 1000;
/** Shared SKU / barcode length cap (products, and the barcode lookup query). */
export const CODE_MAX = 100;
const UNIT_MAX = 30;
const IMAGE_URL_MAX = 1000;

export function validateProduct(body, { partial = false } = {}) {
  const problems = [];

  const name = partial ? optionalString(body?.name, 'name', PRODUCT_NAME_MAX)
    : requiredString(body?.name, 'name', PRODUCT_NAME_MAX);
  problems.push(...name.problems);

  const sku = optionalString(body?.sku, 'sku', CODE_MAX);
  problems.push(...sku.problems);
  const barcode = optionalString(body?.barcode, 'barcode', CODE_MAX);
  problems.push(...barcode.problems);
  const description = optionalString(body?.description, 'description', PRODUCT_DESCRIPTION_MAX);
  problems.push(...description.problems);
  const categoryId = optionalObjectId(body?.categoryId, 'categoryId');
  problems.push(...categoryId.problems);
  const unit = optionalString(body?.unit, 'unit', UNIT_MAX);
  problems.push(...unit.problems);
  const imageUrl = optionalString(body?.imageUrl, 'imageUrl', IMAGE_URL_MAX);
  problems.push(...imageUrl.problems);

  const costPrice = optionalNumber(body?.costPrice, 'costPrice', { min: 0 });
  problems.push(...costPrice.problems);
  const sellingPrice = optionalNumber(body?.sellingPrice, 'sellingPrice', { min: 0 });
  problems.push(...sellingPrice.problems);
  const minimumStock = optionalNumber(body?.minimumStock, 'minimumStock', { min: 0, integer: true });
  problems.push(...minimumStock.problems);

  return {
    problems,
    name: name.value,
    sku: sku.value,
    barcode: barcode.value,
    description: description.value,
    categoryId: categoryId.value,
    costPrice: costPrice.value,
    sellingPrice: sellingPrice.value,
    unit: unit.value,
    minimumStock: minimumStock.value,
    imageUrl: imageUrl.value,
  };
}

const REASON_MAX = 500;
const REFERENCE_MAX = 200;

/**
 * Stock movement validation. quantity is the movement magnitude for stock
 * in/out (must be > 0) and the target on-hand quantity for adjustment
 * (may be 0). `fieldName` is what the client sent (always "quantity").
 */
export function validateStockMovement(body, { allowZero = false } = {}) {
  const problems = [];

  const productId = optionalObjectId(body?.productId, 'productId');
  problems.push(...productId.problems);
  const locationId = optionalObjectId(body?.locationId, 'locationId');
  problems.push(...locationId.problems);

  const quantity = requiredNumber(body?.quantity, 'quantity', {
    min: allowZero ? 0 : 1,
    integer: true,
  });
  problems.push(...quantity.problems);

  const reason = optionalString(body?.reason, 'reason', REASON_MAX);
  problems.push(...reason.problems);
  const reference = optionalString(body?.reference, 'reference', REFERENCE_MAX);
  problems.push(...reference.problems);

  return {
    problems,
    productId: productId.value,
    locationId: locationId.value,
    quantity: quantity.value,
    reason: reason.value,
    reference: reference.value,
  };
}

/**
 * Validates a stock-transfer body (Phase 19). A transfer is one product moving
 * from a source location to a destination location, so both location fields are
 * required and must differ — a same-location transfer is meaningless and is
 * rejected here rather than silently writing two offsetting ledger rows.
 * Quantity is always a positive integer (no allowZero: a zero transfer is a
 * no-op, never a movement).
 */
export function validateTransfer(body) {
  const problems = [];

  const productId = optionalObjectId(body?.productId, 'productId');
  problems.push(...productId.problems);

  const fromLocationId = optionalObjectId(body?.fromLocationId, 'fromLocationId');
  problems.push(...fromLocationId.problems);
  const toLocationId = optionalObjectId(body?.toLocationId, 'toLocationId');
  problems.push(...toLocationId.problems);

  if (fromLocationId.value && toLocationId.value && fromLocationId.value === toLocationId.value) {
    problems.push({
      field: 'toLocationId',
      message: 'toLocationId must differ from fromLocationId',
    });
  }

  const quantity = requiredNumber(body?.quantity, 'quantity', { min: 1, integer: true });
  problems.push(...quantity.problems);

  const reason = optionalString(body?.reason, 'reason', REASON_MAX);
  problems.push(...reason.problems);
  const reference = optionalString(body?.reference, 'reference', REFERENCE_MAX);
  problems.push(...reference.problems);

  return {
    problems,
    productId: productId.value,
    fromLocationId: fromLocationId.value,
    toLocationId: toLocationId.value,
    quantity: quantity.value,
    reason: reason.value,
    reference: reference.value,
  };
}

// ---------------------------------------------------------------------------
// Purchase orders (Phase 13B)
// ---------------------------------------------------------------------------

const PO_ITEMS_MAX = 200;
const PO_NOTES_MAX = 1000;

function optionalDate(value, field) {
  if (value === undefined || value === null || value === '') {
    return { value: undefined, problems: [] };
  }
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(d.getTime())) {
    return { value: undefined, problems: [{ field, message: `${field} must be a valid date` }] };
  }
  return { value: d, problems: [] };
}

function parsePoLine(line, idx, problems, seenProductIds) {
  const prefix = `items[${idx}]`;
  const obj = line && typeof line === 'object' ? line : {};

  const productId = isObjectId(obj.productId) ? obj.productId : undefined;
  if (!productId) {
    problems.push({ field: `${prefix}.productId`, message: 'productId is required and must be a valid id' });
  } else {
    const key = productId.toLowerCase();
    if (seenProductIds.has(key)) {
      problems.push({ field: `${prefix}.productId`, message: 'duplicate productId in items' });
    }
    seenProductIds.add(key);
  }

  const quantityOrdered = requiredNumber(obj.quantityOrdered, 'quantityOrdered', { min: 1, integer: true });
  for (const p of quantityOrdered.problems) {
    problems.push({ field: `${prefix}.${p.field}`, message: p.message });
  }

  const unitCost = optionalNumber(obj.unitCost, 'unitCost', { min: 0 });
  for (const p of unitCost.problems) {
    problems.push({ field: `${prefix}.${p.field}`, message: p.message });
  }

  return { productId, quantityOrdered: quantityOrdered.value, unitCost: unitCost.value };
}

/**
 * Purchase order payload validation. `partial` (PATCH) treats every reference
 * as optional; when `items` is present on a PATCH it is a full replacement of
 * the line set. Service-side operational checks (references belong to the
 * business and are ACTIVE) happen separately, after this structural pass.
 */
export function validatePurchaseOrder(body, { partial = false } = {}) {
  const problems = [];

  const requiredRef = (field) => {
    if (partial) return optionalObjectId(body?.[field], field);
    if (!body?.[field]) return { value: undefined, problems: [{ field, message: `${field} is required` }] };
    return optionalObjectId(body[field], field);
  };

  const supplierId = requiredRef('supplierId');
  problems.push(...supplierId.problems);
  const locationId = requiredRef('locationId');
  problems.push(...locationId.problems);

  const expectedAt = optionalDate(body?.expectedAt, 'expectedAt');
  problems.push(...expectedAt.problems);
  const notes = optionalString(body?.notes, 'notes', PO_NOTES_MAX);
  problems.push(...notes.problems);

  let items;
  const rawItems = body?.items;
  if (rawItems === undefined) {
    if (!partial) problems.push({ field: 'items', message: 'items is required' });
    items = undefined;
  } else if (!Array.isArray(rawItems)) {
    problems.push({ field: 'items', message: 'items must be an array' });
    items = undefined;
  } else {
    if (rawItems.length === 0) problems.push({ field: 'items', message: 'items must not be empty' });
    if (rawItems.length > PO_ITEMS_MAX) {
      problems.push({ field: 'items', message: `items must have at most ${PO_ITEMS_MAX} entries` });
    }
    const seenProductIds = new Set();
    items = rawItems.map((line, idx) => parsePoLine(line, idx, problems, seenProductIds));
  }

  return {
    problems,
    supplierId: supplierId.value,
    locationId: locationId.value,
    expectedAt: expectedAt.value,
    notes: notes.value,
    items,
  };
}

function parseReceiveLine(line, idx, problems, seenProductIds) {
  const prefix = `lines[${idx}]`;
  const obj = line && typeof line === 'object' ? line : {};

  const productId = isObjectId(obj.productId) ? obj.productId : undefined;
  if (!productId) {
    problems.push({ field: `${prefix}.productId`, message: 'productId is required and must be a valid id' });
  } else {
    const key = productId.toLowerCase();
    if (seenProductIds.has(key)) {
      problems.push({ field: `${prefix}.productId`, message: 'duplicate productId in lines' });
    }
    seenProductIds.add(key);
  }

  const quantity = requiredNumber(obj.quantity, 'quantity', { min: 1, integer: true });
  for (const p of quantity.problems) {
    problems.push({ field: `${prefix}.${p.field}`, message: p.message });
  }

  return { productId, quantity: quantity.value };
}

/**
 * Receiving payload validation (Phase 13C). `lines` is the quantity received
 * NOW per product (partial allowed; the server caps each at the remaining
 * quantity). Only `lines` and `reference` are accepted — the receiving location
 * is always the PO's own, never a client-supplied one. Service-side checks
 * (PO state, line membership, remaining, ACTIVE products) happen after this
 * structural pass, before anything moves.
 */
export function validateReceive(body, { partial = false } = {}) {
  const problems = [];

  const reference = optionalString(body?.reference, 'reference', REFERENCE_MAX);
  problems.push(...reference.problems);

  let lines;
  const rawLines = body?.lines;
  if (rawLines === undefined) {
    if (!partial) problems.push({ field: 'lines', message: 'lines is required' });
    lines = undefined;
  } else if (!Array.isArray(rawLines)) {
    problems.push({ field: 'lines', message: 'lines must be an array' });
    lines = undefined;
  } else {
    if (rawLines.length === 0) problems.push({ field: 'lines', message: 'lines must not be empty' });
    if (rawLines.length > PO_ITEMS_MAX) {
      problems.push({ field: 'lines', message: `lines must have at most ${PO_ITEMS_MAX} entries` });
    }
    const seenProductIds = new Set();
    lines = rawLines.map((line, idx) => parseReceiveLine(line, idx, problems, seenProductIds));
  }

  return { problems, lines, reference: reference.value };
}

// ---------------------------------------------------------------------------
// Audit trail (Phase 16)
// ---------------------------------------------------------------------------

const AUDIT_Q_MAX = 100;
const AUDIT_ACTION_VALUES = new Set(Object.values(AUDIT_ACTIONS));
const AUDIT_ENTITY_TYPE_VALUES = new Set(Object.values(AUDIT_ENTITY_TYPES));

/**
 * GET /api/audit query validation. Every filter value must be known:
 * action/entityType against the constant sets, userId an ObjectId, from/to
 * valid ISO dates with to >= from, q a bounded string. Unknown filter values
 * are rejected with field problems — never silently ignored.
 */
export function validateAuditList(query) {
  const problems = [];
  const q = query ?? {};

  const action = typeof q.action === 'string' && q.action ? q.action : undefined;
  if (action && !AUDIT_ACTION_VALUES.has(action)) {
    problems.push({ field: 'action', message: 'action must be a valid audit action' });
  }

  const entityType = typeof q.entityType === 'string' && q.entityType ? q.entityType : undefined;
  if (entityType && !AUDIT_ENTITY_TYPE_VALUES.has(entityType)) {
    problems.push({ field: 'entityType', message: 'entityType must be a valid entity type' });
  }

  const userId = optionalObjectId(q.userId, 'userId');
  problems.push(...userId.problems);

  const from = optionalDate(q.from, 'from');
  problems.push(...from.problems);
  const to = optionalDate(q.to, 'to');
  problems.push(...to.problems);
  if (from.value && to.value && to.value < from.value) {
    problems.push({ field: 'to', message: 'to must be on or after from' });
  }

  const text = optionalSearch(q.q, 'q', AUDIT_Q_MAX);
  problems.push(...text.problems);

  return {
    problems,
    filters: {
      action,
      entityType,
      userId: userId.value,
      from: from.value,
      to: to.value,
      q: text.value,
    },
  };
}

// ---------------------------------------------------------------------------
// List query filters (Phase 20D)
//
// Every list endpoint that accepts `q`, `status` or `supplierId` uses these, so
// the contract is defined once: a filter that is PRESENT and malformed is a
// field problem (the caller throws 400 VALIDATION_ERROR), never a quietly
// dropped predicate that answers with a wider list than the client asked for.
// ---------------------------------------------------------------------------

/**
 * The ACTIVE/ARCHIVED enum shared by products, inventory rows, categories,
 * locations and suppliers — the archived/restored lifecycle every one of them
 * uses. Exported so each list parser validates against one definition.
 */
export const ACTIVE_ARCHIVED_STATUSES = Object.freeze(['ACTIVE', 'ARCHIVED']);

/**
 * GET /api/users query filters. `status` is validated rather than coerced: an
 * unknown value must not silently widen the list to every user.
 */
export function validateUserList(query) {
  const problems = [];
  const q = query ?? {};

  const search = optionalSearch(q.q, 'q');
  problems.push(...search.problems);

  const status = optionalEnum(q.status, 'status', USER_STATUSES);
  problems.push(...status.problems);

  return { problems, filters: { q: search.value, status: status.value } };
}

/**
 * GET /api/purchase-orders query filters. `statuses` is REQUIRED and supplied by
 * the caller (the model's PURCHASE_ORDER_STATUSES) so this module keeps its
 * existing dependency on `constants/` only and never reaches into `models/`.
 *
 * `supplierId` follows the shared ObjectId convention: blank/absent means "no
 * supplier filter", a MALFORMED id is a problem. It must never be silently
 * removed from the match — doing so returns every purchase order in the
 * business while appearing to be filtered to one supplier.
 */
export function validatePurchaseOrderList(query, statuses) {
  const problems = [];
  const q = query ?? {};

  const search = optionalSearch(q.q, 'q');
  problems.push(...search.problems);

  const status = optionalEnum(q.status, 'status', statuses);
  problems.push(...status.problems);

  const supplierId = optionalObjectId(q.supplierId, 'supplierId');
  problems.push(...supplierId.problems);

  return {
    problems,
    filters: { q: search.value, status: status.value, supplierId: supplierId.value },
  };
}

/**
 * GET /api/categories | /api/locations | /api/suppliers query filters. All three
 * are served by the reference controller factory, so they share one contract.
 * The status wording matches the product endpoints, which validate the same
 * ACTIVE/ARCHIVED enum.
 */
export function validateReferenceList(query) {
  const problems = [];
  const q = query ?? {};

  const search = optionalSearch(q.q, 'q');
  problems.push(...search.problems);

  const status = optionalEnum(q.status, 'status', ACTIVE_ARCHIVED_STATUSES, {
    message: 'status must be ACTIVE or ARCHIVED',
  });
  problems.push(...status.problems);

  return { problems, filters: { q: search.value, status: status.value } };
}

export default {
  normalizeEmail,
  validateRegister,
  validateLogin,
  validateChangePassword,
  validateMeUpdate,
  validateLogout,
  validateUserCreate,
  validateUserUpdate,
  USER_STATUSES,
  ACTIVE_ARCHIVED_STATUSES,
  isObjectId,
  optionalObjectId,
  optionalString,
  requiredString,
  optionalSearch,
  optionalEnum,
  requiredNumber,
  optionalNumber,
  validateCategory,
  validateLocation,
  validateSupplier,
  validateProduct,
  validateStockMovement,
  validateTransfer,
  validatePurchaseOrder,
  validateReceive,
  validateAuditList,
  validateUserList,
  validatePurchaseOrderList,
  validateReferenceList,
  CODE_MAX,
};
