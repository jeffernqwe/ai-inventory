import Category from '../models/category.model.ts';
import Location from '../models/location.model.ts';
import Supplier from '../models/supplier.model.ts';
import { recordAudit } from './audit.service.js';
import { notFound } from '../utils/errors.ts';
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
} from '../constants/audit.ts';

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Factory for simple business-scoped "reference" resources (Category/Location).
 * All queries are scoped by the server-derived businessId — a client id alone
 * can never cross into another business. Write operations create audit logs.
 */
export function createReferenceService({
  Model,
  entityType,
  actions,
  fields = [],
}) {
  function toPublic(doc) {
    const out = {
      id: String(doc._id),
      businessId: String(doc.businessId),
      name: doc.name,
      description: doc.description ?? undefined,
      status: doc.status,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
    for (const field of fields) {
      if (doc[field] != null) out[field] = doc[field];
    }
    return out;
  }

  return {
    toPublic,

    async create(businessId, userId, payload) {
      const data = { businessId, name: payload.name, description: payload.description };
      for (const field of fields) {
        if (payload[field] != null) data[field] = payload[field];
      }
      const doc = await Model.create(data);
      await recordAudit({
        businessId,
        userId,
        action: actions.create,
        entityType,
        entityId: doc._id,
        metadata: { name: doc.name },
      });
      return doc;
    },

    async get(businessId, id) {
      const doc = await Model.findOne({ _id: id, businessId });
      if (!doc) notFound();
      return doc;
    },

    async list(businessId, { q, status, skip, limit }) {
      const filter = { businessId };
      // Phase 20D: the controller validates `status` against the ACTIVE/ARCHIVED
      // enum, so an unrecognized value can no longer reach here. The guard is
      // unconditional because the old inline enum comparison silently DROPPED the
      // filter, answering with every row while appearing to be filtered.
      if (status) filter.status = status;
      if (q) {
        filter.$or = [
          { name: { $regex: escapeRegExp(q), $options: 'i' } },
          { description: { $regex: escapeRegExp(q), $options: 'i' } },
        ];
      }
      const total = await Model.countDocuments(filter);
      const docs = await Model.find(filter)
        // `_id` breaks createdAt ties in the same direction as the primary sort
        // so paging cannot repeat or skip a row.
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit);
      return { items: docs.map(toPublic), total };
    },

    async update(businessId, id, userId, payload) {
      const doc = await Model.findOne({ _id: id, businessId });
      if (!doc) notFound();

      const updatedFields = [];
      if (payload.name !== undefined && payload.name !== doc.name) {
        doc.name = payload.name;
        updatedFields.push('name');
      }
      if (payload.description !== undefined && payload.description !== doc.description) {
        doc.description = payload.description;
        updatedFields.push('description');
      }
      for (const field of fields) {
        if (payload[field] !== undefined && payload[field] !== doc[field]) {
          doc[field] = payload[field];
          updatedFields.push(field);
        }
      }
      if (updatedFields.length > 0) {
        await doc.save();
        await recordAudit({
          businessId,
          userId,
          action: actions.update,
          entityType,
          entityId: doc._id,
          metadata: { updated: updatedFields },
        });
      }
      return doc;
    },

    /** Set status ACTIVE or ARCHIVED. ARCHIVED -> actions.archive; else update. */
    async setStatus(businessId, id, userId, status) {
      const doc = await Model.findOne({ _id: id, businessId });
      if (!doc) notFound();
      if (doc.status === status) return doc;

      doc.status = status;
      await doc.save();
      await recordAudit({
        businessId,
        userId,
        action: status === 'ARCHIVED' ? actions.archive : actions.update,
        entityType,
        entityId: doc._id,
        metadata: { status },
      });
      return doc;
    },
  };
}

export const categoryService = createReferenceService({
  Model: Category,
  entityType: AUDIT_ENTITY_TYPES.CATEGORY,
  actions: {
    create: AUDIT_ACTIONS.CATEGORY_CREATED,
    update: AUDIT_ACTIONS.CATEGORY_UPDATED,
    archive: AUDIT_ACTIONS.CATEGORY_ARCHIVED,
  },
});

export const locationService = createReferenceService({
  Model: Location,
  entityType: AUDIT_ENTITY_TYPES.LOCATION,
  actions: {
    create: AUDIT_ACTIONS.LOCATION_CREATED,
    update: AUDIT_ACTIONS.LOCATION_UPDATED,
    archive: AUDIT_ACTIONS.LOCATION_ARCHIVED,
  },
});

export const supplierService = createReferenceService({
  Model: Supplier,
  entityType: AUDIT_ENTITY_TYPES.SUPPLIER,
  fields: ['contactName', 'phone', 'email'],
  actions: {
    create: AUDIT_ACTIONS.SUPPLIER_CREATED,
    update: AUDIT_ACTIONS.SUPPLIER_UPDATED,
    archive: AUDIT_ACTIONS.SUPPLIER_ARCHIVED,
  },
});

export default {
  createReferenceService,
  categoryService,
  locationService,
  supplierService,
};
