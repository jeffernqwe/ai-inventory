import AuditLog from '../models/auditLog.model.js';

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

export default { recordAudit };
