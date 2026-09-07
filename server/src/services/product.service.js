import mongoose from 'mongoose';

import Product from '../models/product.model.js';
import Category from '../models/category.model.js';
import ApiError from '../utils/ApiError.js';
import { recordAudit } from './audit.service.js';
import { notFound } from '../utils/errors.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../constants/audit.js';

const { ObjectId } = mongoose.Types;
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function duplicateError(payload) {
  const { sku, barcode } = payload;
  if (sku && barcode) {
    return new ApiError(
      409,
      'A product with this SKU or barcode already exists',
      'PRODUCT_SKU_OR_BARCODE_EXISTS'
    );
  }
  if (sku) return new ApiError(409, 'A product with this SKU already exists', 'PRODUCT_SKU_EXISTS');
  if (barcode) return new ApiError(409, 'A product with this barcode already exists', 'PRODUCT_BARCODE_EXISTS');
  return new ApiError(409, 'A product with these details already exists', 'PRODUCT_CONFLICT');
}

/** Map a Mongo duplicate-key error to a 409 with the offending field. */
function mapDuplicateKey(err) {
  const pattern = err?.keyPattern || err?.keyValue || {};
  if ('sku' in pattern) {
    return new ApiError(409, 'A product with this SKU already exists', 'PRODUCT_SKU_EXISTS');
  }
  if ('barcode' in pattern) {
    return new ApiError(409, 'A product with this barcode already exists', 'PRODUCT_BARCODE_EXISTS');
  }
  return err;
}

function isDuplicateKey(err) {
  return err?.code === 11000;
}

function toProductDTO(doc) {
  const cat = doc.categoryId;
  let category = null;
  if (cat) {
    const isPopulated = typeof cat === 'object' && cat._id;
    category = isPopulated
      ? { id: String(cat._id), name: cat.name, status: cat.status }
      : { id: String(cat) };
  }
  return {
    id: String(doc._id),
    businessId: String(doc.businessId),
    name: doc.name,
    sku: doc.sku ?? null,
    barcode: doc.barcode ?? null,
    description: doc.description ?? null,
    category,
    costPrice: doc.costPrice ?? 0,
    sellingPrice: doc.sellingPrice ?? 0,
    unit: doc.unit ?? null,
    minimumStock: doc.minimumStock ?? 0,
    imageUrl: doc.imageUrl ?? null,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/**
 * Product business service. Every read/write is scoped by the server-derived
 * businessId. SKU/barcode uniqueness is enforced within the business (partial
 * unique index + friendly 409 mapping).
 */
export const productService = {
  toProductDTO,

  async assertCategoryOfBusiness(businessId, categoryId) {
    if (!categoryId) return null;
    const category = await Category.findOne({ _id: categoryId, businessId });
    if (!category) {
      throw new ApiError(404, 'Category not found', 'CATEGORY_NOT_FOUND');
    }
    return category;
  },

  async create(businessId, userId, payload) {
    await this.assertCategoryOfBusiness(businessId, payload.categoryId);

    const data = {
      businessId,
      name: payload.name,
      sku: payload.sku,
      barcode: payload.barcode,
      description: payload.description,
      categoryId: payload.categoryId,
      costPrice: payload.costPrice ?? 0,
      sellingPrice: payload.sellingPrice ?? 0,
      unit: payload.unit,
      minimumStock: payload.minimumStock ?? 0,
      imageUrl: payload.imageUrl,
      status: 'ACTIVE',
    };

    const [skuDup, barcodeDup] = await Promise.all([
      data.sku ? Product.exists({ businessId, sku: data.sku }) : null,
      data.barcode ? Product.exists({ businessId, barcode: data.barcode }) : null,
    ]);
    if (skuDup || barcodeDup) throw duplicateError(data);

    let doc;
    try {
      doc = await Product.create(data);
    } catch (err) {
      if (isDuplicateKey(err)) throw mapDuplicateKey(err);
      throw err;
    }

    await recordAudit({
      businessId,
      userId,
      action: AUDIT_ACTIONS.PRODUCT_CREATED,
      entityType: AUDIT_ENTITY_TYPES.PRODUCT,
      entityId: doc._id,
      metadata: { name: doc.name, sku: doc.sku, categoryId: doc.categoryId ? String(doc.categoryId) : null },
    });
    return doc;
  },

  async get(businessId, id) {
    const doc = await Product.findOne({ _id: id, businessId }).populate('categoryId', 'name status');
    if (!doc) notFound('Product not found');
    return doc;
  },

  async update(businessId, id, userId, payload) {
    const doc = await Product.findOne({ _id: id, businessId }).populate('categoryId', 'name status');
    if (!doc) notFound('Product not found');

    if (payload.categoryId !== undefined && String(payload.categoryId ?? '') !== String(doc.categoryId?._id ?? doc.categoryId ?? '')) {
      await this.assertCategoryOfBusiness(businessId, payload.categoryId);
    }

    const updatedFields = [];
    const apply = (field, value) => {
      if (value === undefined) return;
      if (value !== doc[field]) {
        doc[field] = value;
        updatedFields.push(field);
      }
    };

    apply('name', payload.name);
    apply('sku', payload.sku);
    apply('barcode', payload.barcode);
    apply('description', payload.description);
    apply('costPrice', payload.costPrice);
    apply('sellingPrice', payload.sellingPrice);
    apply('unit', payload.unit);
    apply('minimumStock', payload.minimumStock);
    apply('imageUrl', payload.imageUrl);
    // categoryId: apply only when explicitly provided
    if (payload.categoryId !== undefined && String(payload.categoryId) !== String(doc.categoryId?._id ?? doc.categoryId ?? '')) {
      doc.categoryId = payload.categoryId || null;
      updatedFields.push('categoryId');
    }

    // Uniqueness pre-check (excluding this document) for friendlier errors.
    if (updatedFields.includes('sku') && doc.sku) {
      const dup = await Product.exists({ businessId, sku: doc.sku, _id: { $ne: doc._id } });
      if (dup) throw new ApiError(409, 'A product with this SKU already exists', 'PRODUCT_SKU_EXISTS');
    }
    if (updatedFields.includes('barcode') && doc.barcode) {
      const dup = await Product.exists({ businessId, barcode: doc.barcode, _id: { $ne: doc._id } });
      if (dup) throw new ApiError(409, 'A product with this barcode already exists', 'PRODUCT_BARCODE_EXISTS');
    }

    if (updatedFields.length > 0) {
      try {
        await doc.save();
      } catch (err) {
        if (isDuplicateKey(err)) throw mapDuplicateKey(err);
        throw err;
      }
      await recordAudit({
        businessId,
        userId,
        action: AUDIT_ACTIONS.PRODUCT_UPDATED,
        entityType: AUDIT_ENTITY_TYPES.PRODUCT,
        entityId: doc._id,
        metadata: { updated: updatedFields },
      });
    }
    return doc;
  },

  async setStatus(businessId, id, userId, status) {
    const doc = await Product.findOne({ _id: id, businessId });
    if (!doc) notFound('Product not found');
    if (doc.status === status) return doc;

    doc.status = status;
    await doc.save();
    await recordAudit({
      businessId,
      userId,
      action: status === 'ARCHIVED' ? AUDIT_ACTIONS.PRODUCT_ARCHIVED : AUDIT_ACTIONS.PRODUCT_UPDATED,
      entityType: AUDIT_ENTITY_TYPES.PRODUCT,
      entityId: doc._id,
      metadata: { status },
    });
    return doc;
  },

  /** Plain catalog list + search (name/sku/barcode) + category/status filters. */
  async listSimple(businessId, { q, status, categoryId, skip, limit }) {
    const filter = { businessId };
    if (status === 'ACTIVE' || status === 'ARCHIVED') filter.status = status;
    if (categoryId) filter.categoryId = new ObjectId(categoryId);
    if (q) {
      const re = { $regex: escapeRegExp(q), $options: 'i' };
      filter.$or = [{ name: re }, { sku: re }, { barcode: re }];
    }
    const total = await Product.countDocuments(filter);
    const docs = await Product.find(filter)
      .populate('categoryId', 'name status')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    return { items: docs, total };
  },

  /**
   * Product list that also evaluates stock status. When a locationId is given,
   * only products stocked at that location are returned and availability is
   * computed there; otherwise availability is summed across the business.
   * lowStock  -> available <= minimumStock
   * outOfStock -> available <= 0
   * (SYSTEM_SPECIFICATION.md §19 — availability, never total quantity.)
   */
  async listWithStock(businessId, { q, status, categoryId, locationId, lowStock, outOfStock, skip, limit }) {
    const bizOid = new ObjectId(businessId);
    const match = { businessId: bizOid };
    if (status === 'ACTIVE' || status === 'ARCHIVED') match.status = status;
    if (categoryId) match.categoryId = new ObjectId(categoryId);
    if (q) {
      const re = { $regex: escapeRegExp(q), $options: 'i' };
      match.$or = [{ name: re }, { sku: re }, { barcode: re }];
    }

    const locCond = locationId ? [{ $eq: ['$locationId', new ObjectId(locationId)] }] : [];

    const pipeline = [
      { $match: match },
      {
        $lookup: {
          from: 'inventory',
          let: { pid: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$businessId', bizOid] },
                    { $eq: ['$productId', '$$pid'] },
                    ...locCond,
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                quantity: { $sum: '$quantity' },
                reserved: { $sum: '$reservedQuantity' },
              },
            },
          ],
          as: 'inv',
        },
      },
      {
        $addFields: {
          invRow: { $arrayElemAt: ['$inv', 0] },
        },
      },
      {
        $addFields: {
          available: {
            $subtract: [
              { $ifNull: ['$invRow.quantity', 0] },
              { $ifNull: ['$invRow.reserved', 0] },
            ],
          },
        },
      },
    ];

    // Only products actually stocked at the chosen location.
    if (locationId) {
      pipeline.push({ $match: { $expr: { $gt: [{ $size: '$inv' }, 0] } } });
    }
    if (outOfStock) {
      pipeline.push({ $match: { $expr: { $lte: ['$available', 0] } } });
    }
    if (lowStock) {
      pipeline.push({ $match: { $expr: { $lte: ['$available', '$minimumStock'] } } });
    }

    pipeline.push({
      $lookup: {
        from: 'categories',
        let: { cat: '$categoryId' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$businessId', bizOid] }, { $eq: ['$_id', '$$cat'] }] } } },
        ],
        as: 'category',
      },
    });
    pipeline.push({ $addFields: { category: { $arrayElemAt: ['$category', 0] } } });
    pipeline.push({
      $facet: {
        metadata: [{ $count: 'total' }],
        data: [{ $sort: { createdAt: -1 } }, { $skip: skip }, { $limit: limit }],
      },
    });

    const [result] = await Product.aggregate(pipeline);
    const items = result?.data ?? [];
    const total = result?.metadata?.[0]?.total ?? 0;

    // Normalise into the populated shape the DTO expects: categoryId becomes
    // the category document when found, null when the reference is missing.
    for (const doc of items) {
      if (doc.category && doc.category._id) doc.categoryId = doc.category;
      else doc.categoryId = null;
    }
    return { items, total };
  },

  /** Chooses the right listing strategy depending on whether stock filters are used. */
  async list(businessId, query) {
    const { q, status, categoryId, locationId, lowStock, outOfStock, skip, limit } = query;
    const needsStock = Boolean(locationId || lowStock || outOfStock);
    if (needsStock) {
      return this.listWithStock(businessId, { q, status, categoryId, locationId, lowStock, outOfStock, skip, limit });
    }
    return this.listSimple(businessId, { q, status, categoryId, skip, limit });
  },
};

export default productService;
