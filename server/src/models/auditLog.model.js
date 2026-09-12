import mongoose from 'mongoose';

const { Schema } = mongoose;

const auditLogSchema = new Schema(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: [true, 'businessId is required'],
      index: true,
    },
    // May be null for system-initiated events (no authenticated user).
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    action: {
      type: String,
      required: [true, 'action is required'],
      trim: true,
    },
    entityType: {
      type: String,
      required: [true, 'entityType is required'],
      trim: true,
    },
    // Flexible: an entity _id (as string) or a business-defined identifier.
    entityId: {
      type: String,
      trim: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  { collection: 'audit_logs', timestamps: true }
);

auditLogSchema.index({ businessId: 1, createdAt: 1 });
// Phase 20C (H-1): the audit trail paginates with `sort({ createdAt: -1, _id: -1 })`
// (audit.service.js). The `{ businessId: 1, createdAt: 1 }` index above can serve a
// bare `createdAt` sort by reverse scan, but the deterministic `_id` tiebreaker is a
// second sort key the index does not carry — which forced a blocking in-memory SORT.
// Declaring the full key shape lets the same plan be index-ordered end to end.
auditLogSchema.index({ businessId: 1, createdAt: -1, _id: -1 });
auditLogSchema.index({ businessId: 1, entityType: 1, entityId: 1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;
