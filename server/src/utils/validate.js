/**
 * Lightweight request validation.
 *
 * Auth + domain validators return an array of { field, message } problems
 * (empty when valid). Field helpers return { value, problems } so callers can
 * normalize input and collect errors in one pass.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL = 254;
const PASSWORD_MIN = 8;
// bcrypt only uses the first 72 bytes of a password — enforce it up front.
const PASSWORD_MAX = 72;

// ---------------------------------------------------------------------------
// Auth (Phase 03)
// ---------------------------------------------------------------------------

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

  if (!email) problems.push({ field: 'email', message: 'email is required' });
  else if (email.length > MAX_EMAIL || !EMAIL_RE.test(email))
    problems.push({ field: 'email', message: 'email must be a valid email address' });

  if (typeof password !== 'string' || password.length === 0) {
    problems.push({ field: 'password', message: 'password is required' });
  } else if (password.length < PASSWORD_MIN) {
    problems.push({ field: 'password', message: `password must be at least ${PASSWORD_MIN} characters` });
  } else if (password.length > PASSWORD_MAX) {
    problems.push({ field: 'password', message: `password must be at most ${PASSWORD_MAX} characters` });
  }

  return problems;
}

export function validateLogin(body) {
  const problems = [];
  const email = normalizeEmail(body?.email);
  const password = body?.password;

  if (!email) problems.push({ field: 'email', message: 'email is required' });
  else if (email.length > MAX_EMAIL || !EMAIL_RE.test(email))
    problems.push({ field: 'email', message: 'email must be a valid email address' });

  if (typeof password !== 'string' || password.length === 0) {
    problems.push({ field: 'password', message: 'password is required' });
  }

  return problems;
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

const PRODUCT_NAME_MAX = 120;
const PRODUCT_DESCRIPTION_MAX = 1000;
const CODE_MAX = 100;
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

export default {
  normalizeEmail,
  validateRegister,
  validateLogin,
  isObjectId,
  optionalObjectId,
  optionalString,
  requiredString,
  requiredNumber,
  optionalNumber,
  validateCategory,
  validateLocation,
  validateProduct,
  validateStockMovement,
};
