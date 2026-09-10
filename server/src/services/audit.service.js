import AuditLog from '../models/auditLog.model.js';

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Records an audit event. Keeps the "who/what/which entity/when" shape of
 * AuditLog. Must never include sensitive values (no credentials, no prices of
 * unrelated data, no internal errors).
 */
export async function recordAudit({ businessId, userId, action, entityType, entityId, metadata }) {
  return AuditLog.create({
    businessId,
    userId: userId || null,
    action,
    entityType,
    entityId: entityId == null ? undefined : String(entityId),
    metadata,
  });
}

/**
 * Public shape of one audit row (Phase 16) — a strict whitelist, never the raw
 * document. `actor` is null for system-initiated events (no authenticated
 * user). metadata passes through as-is because recordAudit's contract already
 * guarantees secret-free content.
 */
export function toPublicAudit(log) {
  const actor = log.userId
    ? { id: String(log.userId._id ?? log.userId), name: log.userId.name ?? null }
    : null;
  return {
    id: String(log._id),
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId ?? null,
    actor,
    metadata: log.metadata ?? null,
    createdAt: log.createdAt,
  };
}

/**
 * Business-scoped audit trail query (Phase 16). businessId always comes from
 * the authenticated session — cross-business rows are never reachable. Filters
 * are validated by the caller (validateAuditList); here they are only
 * translated into a Mongo filter. Newest first.
 */
export async function listAudit(businessId, { action, entityType, userId, from, to, q, skip, limit }) {
  const filter = { businessId };
  if (action) filter.action = action;
  if (entityType) filter.entityType = entityType;
  if (userId) filter.userId = userId;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }
  if (q) {
    filter.$or = [
      { action: { $regex: escapeRegExp(q), $options: 'i' } },
      { entityId: { $regex: escapeRegExp(q), $options: 'i' } },
    ];
  }

  const total = await AuditLog.countDocuments(filter);
  const docs = await AuditLog.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('userId', 'name');

  return { items: docs.map(toPublicAudit), total };
}

export default { recordAudit, listAudit, toPublicAudit };
