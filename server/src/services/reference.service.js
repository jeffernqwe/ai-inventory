import Category from '../models/category.model.js';
import Location from '../models/location.model.js';
import { recordAudit } from './audit.service.js';
import { notFound } from '../utils/errors.js';
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
} from '../constants/audit.js';

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
}) {
  function toPublic(doc) {
    return {
      id: String(doc._id),
      businessId: String(doc.businessId),
      name: doc.name,
      description: doc.description ?? undefined,
      status: doc.status,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  return {
    toPublic,

    async create(businessId, userId, { name, description }) {
      const doc = await Model.create({ businessId, name, description });
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
      if (status === 'ACTIVE' || status === 'ARCHIVED') filter.status = status;
      if (q) {
        filter.$or = [
          { name: { $regex: escapeRegExp(q), $options: 'i' } },
          { description: { $regex: escapeRegExp(q), $options: 'i' } },
        ];
      }
      const total = await Model.countDocuments(filter);
      const docs = await Model.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit);
      return { items: docs.map(toPublic), total };
    },

    async update(businessId, id, userId, { name, description }) {
      const doc = await Model.findOne({ _id: id, businessId });
      if (!doc) notFound();

      const updatedFields = [];
      if (name !== undefined && name !== doc.name) {
        doc.name = name;
        updatedFields.push('name');
      }
      if (description !== undefined && description !== doc.description) {
        doc.description = description;
        updatedFields.push('description');
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

export default { createReferenceService, categoryService, locationService };
