import bcrypt from 'bcryptjs';

import User from '../models/user.model.ts';
import ApiError from '../utils/ApiError.js';
import { recordAudit } from './audit.service.js';
import { notFound } from '../utils/errors.js';
import { toPublicUser } from './auth.service.js';
import { ROLES, NON_OWNER_ROLES } from '../constants/roles.js';
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
} from '../constants/audit.js';

const BCRYPT_ROUNDS = 10;
const ACTIVE_STATUS = 'ACTIVE';
const EMAIL_IN_USE_MESSAGE = 'An account with this email already exists';

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function isDuplicateKey(err) {
  return err?.code === 11000;
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
  async list(businessId, { q, status, skip, limit }) {
    const filter = { businessId };
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

  async get(businessId, id) {
    const user = await User.findOne({ _id: id, businessId });
    if (!user) notFound();
    return toPublicUser(user);
  },

  /**
   * Create a non-OWNER user in the actor's business. The created user's
   * businessId always comes from the authenticated actor, never the body.
   */
  async create(actor, payload) {
    if (!NON_OWNER_ROLES.includes(payload.role)) {
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
  async update(actor, id, payload) {
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

    const updated = [];
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
