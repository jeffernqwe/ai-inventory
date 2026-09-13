import type { HydratedDocument, Model, QueryFilter } from 'mongoose';

import Category from '../models/category.model.ts';
import Location from '../models/location.model.ts';
import Supplier from '../models/supplier.model.ts';
import { recordAudit } from './audit.service.js';
import { notFound } from '../utils/errors.ts';
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
} from '../constants/audit.ts';

/**
 * The document members this factory reads or writes, and nothing more. All three
 * reference models (Category, Location, Supplier) satisfy it. The supplier-only
 * contact fields are deliberately absent: they are reached through `fields`,
 * never named here, so adding one to a model needs no change to this type.
 */
type ReferenceDocShape = {
  businessId: unknown;
  name: string;
  description?: string | null;
  status?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

/** The reference lifecycle: ACTIVE <-> ARCHIVED, terminal at ARCHIVED. */
type ReferenceStatus = 'ACTIVE' | 'ARCHIVED';

/** The three audit action names a reference resource supplies. */
type ReferenceActions = {
  create: string;
  update: string;
  archive: string;
};

/**
 * A parsed write body. The index signature is the honest shape: the validator
 * returns `name`/`description` plus whatever extra fields the resource declares,
 * and the `fields` loop reads them by name.
 */
type ReferenceWritePayload = {
  name?: string;
  description?: string;
} & Record<string, unknown>;

/** The parsed list query the controller forwards, plus the resolved paging. */
type ReferenceListFilters = {
  q?: string;
  status?: string;
  skip: number;
  limit: number;
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Factory for simple business-scoped "reference" resources (Category/Location).
 * All queries are scoped by the server-derived businessId — a client id alone
 * can never cross into another business. Write operations create audit logs.
 *
 * `Doc` is the model's document shape, inferred from the `Model` argument, so
 * each of the three instantiations keeps its own model's typing without the
 * factory naming any of them.
 */
export function createReferenceService<Doc extends ReferenceDocShape>({
  Model,
  entityType,
  actions,
  fields = [],
}: {
  Model: Model<Doc>;
  entityType: string;
  actions: ReferenceActions;
  fields?: readonly string[];
}) {
  function toPublic(doc: HydratedDocument<Doc>) {
    const out: Record<string, unknown> = {
      id: String(doc._id),
      businessId: String(doc.businessId),
      name: doc.name,
      description: doc.description ?? undefined,
      status: doc.status,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
    // `doc` is only ever indexed by a name from `fields`, which no schema type
    // declares. The view is the SAME object, so every read below is the read the
    // untyped code performed.
    const view = doc as unknown as Record<string, unknown>;
    for (const field of fields) {
      if (view[field] != null) out[field] = view[field];
    }
    return out;
  }

  return {
    toPublic,

    async create(businessId: string, userId: string, payload: ReferenceWritePayload) {
      const data: Record<string, unknown> = { businessId, name: payload.name, description: payload.description };
      for (const field of fields) {
        if (payload[field] != null) data[field] = payload[field];
      }
      // `data` carries the resource's own extra fields by name, which no schema
      // type declares, so its static type is a record. It IS the object the
      // untyped code passed, and the schema casts and validates it identically.
      const doc = await Model.create(data as Partial<Doc>);
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

    async get(businessId: string, id: string) {
      const doc = await Model.findOne({ _id: id, businessId });
      if (!doc) notFound();
      return doc;
    },

    async list(businessId: string, { q, status, skip, limit }: ReferenceListFilters) {
      const filter: QueryFilter<Doc> = { businessId };
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

    async update(businessId: string, id: string, userId: string, payload: ReferenceWritePayload) {
      const doc = await Model.findOne({ _id: id, businessId });
      if (!doc) notFound();

      const updatedFields: string[] = [];
      if (payload.name !== undefined && payload.name !== doc.name) {
        doc.name = payload.name;
        updatedFields.push('name');
      }
      if (payload.description !== undefined && payload.description !== doc.description) {
        doc.description = payload.description;
        updatedFields.push('description');
      }
      // Same reason as `toPublic`: the loop's field names come from `fields` and
      // are declared by no schema type. `view` IS `doc`, so `view[field]` and
      // `view[field] = …` still run the schema getters and setters.
      const view = doc as unknown as Record<string, unknown>;
      for (const field of fields) {
        if (payload[field] !== undefined && payload[field] !== view[field]) {
          view[field] = payload[field];
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
    async setStatus(businessId: string, id: string, userId: string, status: ReferenceStatus) {
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
