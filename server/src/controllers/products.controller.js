import { parsePagination, pageResult } from '../utils/pagination.js';
import { isObjectId, optionalObjectId, requiredString, validateProduct, CODE_MAX } from '../utils/validate.js';
import { throwValidation, invalidId } from '../utils/errors.js';
import { productService } from '../services/product.service.js';

function paramId(req) {
  if (!isObjectId(req.params.id)) invalidId();
  return req.params.id;
}

function parseFlag(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'boolean') return value;
  const s = String(value).toLowerCase();
  return !(s === 'false' || s === '0' || s === '');
}

function parseQueryList(req) {
  const { page, limit, skip } = parsePagination(req.query);
  const problems = [];

  let q;
  if (req.query.q !== undefined) {
    const trimmed = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!trimmed) problems.push({ field: 'q', message: 'q must not be empty' });
    else q = trimmed;
  }

  let status;
  if (req.query.status !== undefined) {
    if (req.query.status === 'ACTIVE' || req.query.status === 'ARCHIVED') status = req.query.status;
    else problems.push({ field: 'status', message: 'status must be ACTIVE or ARCHIVED' });
  }

  const categoryId = optionalObjectId(req.query.categoryId, 'categoryId');
  problems.push(...categoryId.problems);
  const locationId = optionalObjectId(req.query.locationId, 'locationId');
  problems.push(...locationId.problems);

  const lowStock = parseFlag(req.query.lowStock);
  const outOfStock = parseFlag(req.query.outOfStock);

  return {
    q,
    status,
    categoryId: categoryId.value,
    locationId: locationId.value,
    lowStock,
    outOfStock,
    page,
    limit,
    skip,
    problems,
  };
}

const productsController = {
  async list(req, res) {
    const parsed = parseQueryList(req);
    if (parsed.problems.length) throwValidation(parsed.problems);
    const { items, total } = await productService.list(req.user.businessId, parsed);
    res.json(pageResult(items.map(productService.toProductDTO), total, parsed.page, parsed.limit));
  },

  /**
   * Products that need restocking: ACTIVE (by default) products whose summed
   * availability is at or below their minimum stock, worst first, each tagged
   * OUT_OF_STOCK or LOW_STOCK. Read-only, same role surface as the product list.
   */
  async reorder(req, res) {
    const parsed = parseQueryList(req);
    if (parsed.problems.length) throwValidation(parsed.problems);
    const { items, total } = await productService.listReorder(req.user.businessId, {
      q: parsed.q,
      status: parsed.status ?? 'ACTIVE',
      categoryId: parsed.categoryId,
      skip: parsed.skip,
      limit: parsed.limit,
    });
    res.json(pageResult(items.map(productService.reorderItemPublic), total, parsed.page, parsed.limit));
  },

  async get(req, res) {
    const doc = await productService.get(req.user.businessId, paramId(req));
    res.json(productService.toProductDTO(doc));
  },

  /**
   * Look up one product by an exact barcode, scoped to the authenticated
   * business. Barcodes are unique within a business (partial unique index), so
   * this returns at most one product; ARCHIVED products are returned with their
   * status. 404 when the barcode is unknown here.
   */
  async byBarcode(req, res) {
    const b = requiredString(req.query.barcode, 'barcode', CODE_MAX);
    if (b.problems.length) throwValidation(b.problems);
    const doc = await productService.getByBarcode(req.user.businessId, b.value);
    res.json(productService.toProductDTO(doc));
  },

  async create(req, res) {
    const v = validateProduct(req.body ?? {});
    if (v.problems.length) throwValidation(v.problems);
    const doc = await productService.create(req.user.businessId, req.user.id, {
      name: v.name,
      sku: v.sku,
      barcode: v.barcode,
      description: v.description,
      categoryId: v.categoryId,
      costPrice: v.costPrice,
      sellingPrice: v.sellingPrice,
      unit: v.unit,
      minimumStock: v.minimumStock,
      imageUrl: v.imageUrl,
    });
    res.status(201).json(productService.toProductDTO(doc));
  },

  async update(req, res) {
    const id = paramId(req);
    const v = validateProduct(req.body ?? {}, { partial: true });
    if (v.problems.length) throwValidation(v.problems);
    const doc = await productService.update(req.user.businessId, id, req.user.id, {
      name: v.name,
      sku: v.sku,
      barcode: v.barcode,
      description: v.description,
      categoryId: v.categoryId,
      costPrice: v.costPrice,
      sellingPrice: v.sellingPrice,
      unit: v.unit,
      minimumStock: v.minimumStock,
      imageUrl: v.imageUrl,
    });
    res.json(productService.toProductDTO(doc));
  },

  async archive(req, res) {
    const doc = await productService.setStatus(req.user.businessId, paramId(req), req.user.id, 'ARCHIVED');
    res.json(productService.toProductDTO(doc));
  },

  async restore(req, res) {
    const doc = await productService.setStatus(req.user.businessId, paramId(req), req.user.id, 'ACTIVE');
    res.json(productService.toProductDTO(doc));
  },
};

export default productsController;
