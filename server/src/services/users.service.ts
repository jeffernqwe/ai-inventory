import type mongoose from 'mongoose';

import bcrypt from 'bcryptjs';

import User from '../models/user.model.ts';
import ApiError from '../utils/ApiError.ts';
import { recordAudit } from './audit.service.ts';
import { notFound } from '../utils/errors.ts';
import { toPublicUser } from './auth.service.js';
import { ROLES, NON_OWNER_ROLES } from '../constants/roles.ts';
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
} from '../constants/audit.ts';

const BCRYPT_ROUNDS = 10;
const ACTIVE_STATUS = 'ACTIVE';
const EMAIL_IN_USE_MESSAGE = 'An account with this email already exists';

/**
 * Local to this module, following `inventory.service.ts`, `product.service.ts`
 * and `audit.service.ts`: every caller passes the string `req.user` carries and
 * the model casts whichever arrives. Declared here rather than in a shared
 * module so this service stays free of a dependency it does not otherwise need.
 */
type IdLike = string | mongoose.Types.ObjectId;

/**
 * The authenticated actor a write is performed by (`req.user`). `role` is read
 * for the cross-role rules below and is the database-loaded role for this
 * request — never a token claim or a client-supplied value.
 */
type Actor = {
  id: IdLike;
  businessId: IdLike;
  role: string;
};

/**
 * The validated create payload (`validateUserCreate`). The service is reached
 * only after that validator has reported no problems, so `name`/`email`/
 * `password` are the strings it checked and `role` is one of the assignable
 * roles; the catalogue re-check in `create` is the existing defence in depth,
 * not a duplicate of validation.
 */
type UserCreatePayload = {
  name: string;
  email: string;
  password: string;
  role: string;
};

/** The validated update payload (`validateUserUpdate`) — role and/or status. */
type UserUpdatePayload = {
  role?: string;
  status?: string;
};

/** The validated list filters (`validateUserList`) plus pagination. */
type UserListFilters = {
  q?: string;
  status?: string;
  skip: number;
  limit: number;
};

/**
 * The filter `list` builds. Derived from the model itself rather than declared
 * as a structural shape, following `audit.service.ts`: `QueryFilter<Doc>` maps
 * each field to that field's own condition type, so the filter is checked
 * against the real schema at the `.countDocuments()`/`.find()` calls instead of
 * drifting from it. The model exports only the model, so its document type is
 * taken from it here and `user.model.ts` is left untouched.
 */
type UserFilter = mongoose.QueryFilter<mongoose.HydratedDocFromModel<typeof User>>;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function isDuplicateKey(err: unknown) {
  return (err as { code?: unknown } | null | undefined)?.code === 11000;
}

/**
 * Business-scoped user management (Phase 14A). Every query is scoped by the
 * server-derived businessId — a client id alone can never cross into another
 * business. The cross-role rules below are the authoritative enforcement:
 * no OWNER can ever be created or modified through this API, no user may
 * change their own role/status, and an ADMIN may neither touch nor assign
 * the ADMIN role.
 */
export const usersService = {
  async list(businessId: IdLike, { q, status, skip, limit }: UserListFilters) {
    const filter: UserFilter = { businessId };
    if (status) filter.status = status;
    if (q) {
      filter.$or = [
        { name: { $regex: escapeRegExp(q), $options: 'i' } },
        { email: { $regex: escapeRegExp(q), $options: 'i' } },
      ];
    }
    const total = await User.countDocuments(filter);
    const docs = await User.find(filter)
      // Oldest first — this list is ASCENDING, so the `_id` tiebreaker ascends
      // too, keeping the direction and making paged ties stable.
      .sort({ createdAt: 1, _id: 1 })
      .skip(skip)
      .limit(limit);
    return { items: docs.map(toPublicUser), total };
  },

  async get(businessId: IdLike, id: IdLike) {
    const user = await User.findOne({ _id: id, businessId });
    if (!user) notFound();
    return toPublicUser(user);
  },

  /**
   * Create a non-OWNER user in the actor's business. The created user's
   * businessId always comes from the authenticated actor, never the body.
   */
  async create(actor: Actor, payload: UserCreatePayload) {
    // `NON_OWNER_ROLES` is inferred as a tuple of its literal members, so calling
    // `includes` on it directly would demand a value already known to be one of
    // them — which is the very thing this check is testing. The assertion is a
    // widened, type-level view of the same frozen array, the same widening
    // `ASSIGNABLE_ROLES` performs in `utils/validate.ts`: read-only, same values,
    // same order, nothing added or removed, and no runtime effect. It is written
    // inline rather than as a module-level alias so this migration adds no
    // statement the original file did not have.
    if (!(NON_OWNER_ROLES as readonly string[]).includes(payload.role)) {
      // Defense in depth — the controller already rejects this with field errors.
      throw new ApiError(400, 'role must be one of ADMIN, MANAGER, STAFF', 'VALIDATION_ERROR');
    }
    // An ADMIN may not grow its own class — only OWNER may assign ADMIN.
    if (actor.role === ROLES.ADMIN && payload.role === ROLES.ADMIN) {
      throw new ApiError(403, 'Admins cannot create or assign other admins', 'ADMIN_RESTRICTED');
    }

    const emailInUse = await User.exists({ email: payload.email });
    if (emailInUse) {
      throw new ApiError(409, EMAIL_IN_USE_MESSAGE, 'EMAIL_IN_USE');
    }

    const passwordHash = await bcrypt.hash(payload.password, BCRYPT_ROUNDS);
    let user;
    try {
      user = await User.create({
        businessId: actor.businessId,
        name: payload.name,
        email: payload.email,
        passwordHash,
        role: payload.role,
        status: ACTIVE_STATUS,
      });
    } catch (err) {
      // Duplicate-email race on the global unique index.
      if (isDuplicateKey(err)) {
        throw new ApiError(409, EMAIL_IN_USE_MESSAGE, 'EMAIL_IN_USE');
      }
      throw err;
    }

    await recordAudit({
      businessId: actor.businessId,
      userId: actor.id,
      action: AUDIT_ACTIONS.USER_CREATED,
      entityType: AUDIT_ENTITY_TYPES.USER,
      entityId: user._id,
      metadata: { name: user.name, email: user.email, role: user.role },
    });
    return toPublicUser(user);
  },

  /**
   * Change a business user's role and/or status. The rules run in a fixed
   * order: tenant scoping (404 first), then self, then OWNER, then ADMIN
   * restrictions — so a cross-business id never leaks a more specific reason.
   */
  async update(actor: Actor, id: IdLike, payload: UserUpdatePayload) {
    const target = await User.findOne({ _id: id, businessId: actor.businessId });
    if (!target) notFound();

    if (String(target._id) === String(actor.id)) {
      throw new ApiError(403, 'You cannot change your own role or status', 'CANNOT_MODIFY_SELF');
    }
    if (target.role === ROLES.OWNER) {
      throw new ApiError(403, 'The business owner cannot be modified', 'OWNER_IMMUTABLE');
    }
    if (actor.role === ROLES.ADMIN && (target.role === ROLES.ADMIN || payload.role === ROLES.ADMIN)) {
      throw new ApiError(403, 'Admins cannot modify or assign admins', 'ADMIN_RESTRICTED');
    }

    const updated: string[] = [];
    if (payload.role !== undefined && payload.role !== target.role) {
      target.role = payload.role;
      updated.push('role');
    }
    if (payload.status !== undefined && payload.status !== target.status) {
      target.status = payload.status;
      updated.push('status');
    }
    if (updated.length === 0) return toPublicUser(target);

    await target.save();
    await recordAudit({
      businessId: actor.businessId,
      userId: actor.id,
      action: AUDIT_ACTIONS.USER_UPDATED,
      entityType: AUDIT_ENTITY_TYPES.USER,
      entityId: target._id,
      metadata: {
        updated,
        ...(updated.includes('role') ? { role: target.role } : {}),
        ...(updated.includes('status') ? { status: target.status } : {}),
      },
    });
    return toPublicUser(target);
  },
};

export default usersService;
