/**
 * Removing a whole tenant — every row a business owns, then its people, then the
 * business itself.
 *
 * WHY THIS LIVES IN `src/` AND NOT ONLY IN `scripts/`. It was written for the seed and
 * cleanup tooling, and that is still its main caller. Account deletion needs exactly the
 * same knowledge: when the only member of a business closes their account, the business
 * has nobody left to serve, so its products, stock, movements, purchase orders, audit
 * trail and assistant history must go with it — and the list of collections that means
 * must be THE SAME list the tooling uses. A second copy in the service would eventually
 * delete less than the tooling does, or more, and only a data-integrity test would ever
 * notice.
 *
 * THE ONE DEFINITION OF "THE TENANT'S ROWS" IS THE LIST BELOW. Every filter is
 * `{ businessId: { $in: ids } }`, so a wrong id matches nothing and no other tenant's
 * data can be reached from here. Collections are removed child-before-parent, and the
 * assistant's messages are resolved through their conversations because a message
 * carries only `conversationId`.
 *
 * ACCOUNT-SCOPED ROWS ARE RESOLVED BEFORE THE USERS GO. Sessions, password-reset tokens
 * and reset challenges carry only `userId`, so a businessId filter cannot see them and
 * deleting the users first would strand them as rows nothing can ever tie to a tenant
 * again (AI-40, 2026-10-23).
 *
 * NOTHING HERE RUNS ON IMPORT and nothing here decides whether deleting is allowed —
 * the caller does that first, and hands over business ids it has already established.
 */

import mongoose from 'mongoose';

import AIConversation from '../models/aiConversation.model.ts';
import AIMessage from '../models/aiMessage.model.ts';
import AuditLog from '../models/auditLog.model.ts';
import Business from '../models/business.model.ts';
import Category from '../models/category.model.ts';
import Inventory from '../models/inventory.model.ts';
import InventoryTransaction from '../models/inventoryTransaction.model.ts';
import Location from '../models/location.model.ts';
import PasswordResetChallenge from '../models/passwordResetChallenge.model.ts';
import PasswordResetToken from '../models/passwordResetToken.model.ts';
import Product from '../models/product.model.ts';
import PurchaseOrder from '../models/purchaseOrder.model.ts';
import Session from '../models/session.model.ts';
import Supplier from '../models/supplier.model.ts';
import User from '../models/user.model.ts';

/** A document id, as the models accept it. */
type IdLike = string | mongoose.Types.ObjectId;

/**
 * Every collection whose rows carry `businessId`, with the name used in the counts.
 *
 * The history of this list is the reason it is a constant and not an inline loop:
 * `suppliers` and `purchase_orders` were missing from an earlier version, harmless only
 * because the seeder that used it never wrote those two collections, and `audit_logs`
 * was missing until AI-40 found a tenant teardown reporting a clean result while leaving
 * its governance trail behind.
 */
/**
 * The two Mongoose calls this module needs from a model. Stated as a narrow structural
 * type rather than `any`, so a model that cannot be queried this way is a compile error.
 */
type TenantModel = {
  deleteMany(filter: object): Promise<{ deletedCount?: number }>;
  countDocuments(filter: object): Promise<number>;
};

export const TENANT_DATA_COLLECTIONS: Array<[string, TenantModel]> = [
  ['inventory', Inventory],
  ['inventory_transactions', InventoryTransaction],
  ['purchase_orders', PurchaseOrder],
  ['products', Product],
  ['categories', Category],
  ['locations', Location],
  ['suppliers', Supplier],
  ['audit_logs', AuditLog],
];

function toIds(businessIds: Array<IdLike>): mongoose.Types.ObjectId[] {
  return businessIds.map((id) => new mongoose.Types.ObjectId(String(id)));
}

/**
 * Delete every DATA document belonging to the given tenants, and NOTHING else.
 *
 * The account rows (`users`, `businesses`) are deliberately not touched: `removeTenant`
 * does that, and a caller that only wants the tenant's data reset (the demo and role
 * seeders) must not lose the accounts.
 */
export async function clearTenantData(
  businessIds: Array<IdLike>
): Promise<{ removed: number; counts: Record<string, number> }> {
  const filter = { businessId: { $in: toIds(businessIds) } };
  const counts: Record<string, number> = {};
  let removed = 0;

  // A CONVERSATION carries `businessId`; a MESSAGE carries only `conversationId`.
  // Resolve the conversations first, then delete their messages, then the
  // conversations — child before parent, like the list below.
  const conversationIds = await AIConversation.find(filter).distinct('_id');
  const messages = await AIMessage.deleteMany({ conversationId: { $in: conversationIds } });
  counts.ai_messages = messages.deletedCount ?? 0;
  removed += counts.ai_messages;
  const conversations = await AIConversation.deleteMany(filter);
  counts.ai_conversations = conversations.deletedCount ?? 0;
  removed += counts.ai_conversations;

  for (const [name, model] of TENANT_DATA_COLLECTIONS) {
    const res = await model.deleteMany(filter);
    counts[name] = res.deletedCount ?? 0;
    removed += counts[name];
  }
  return { removed, counts };
}

/**
 * Delete a WHOLE tenant: its data, then its users, then the business row itself.
 *
 * Returns per-collection counts so a caller can prove the tenant is gone rather than
 * assume it.
 */
export async function removeTenant(
  businessIds: Array<IdLike>
): Promise<{ removed: number; counts: Record<string, number> }> {
  const ids = toIds(businessIds);
  const filter = { businessId: { $in: ids } };

  const { removed: dataRemoved, counts } = await clearTenantData(businessIds);
  let removed = dataRemoved;

  // Resolve the account-scoped rows while the users still exist, then remove the rows
  // with their owner.
  const userIds = await User.find(filter).distinct('_id');
  const userFilter = { userId: { $in: userIds } };
  for (const [name, model] of [
    ['sessions', Session],
    ['password_reset_tokens', PasswordResetToken],
    ['password_reset_challenges', PasswordResetChallenge],
  ] as Array<[string, TenantModel]>) {
    const res = await model.deleteMany(userFilter);
    counts[name] = res.deletedCount ?? 0;
    removed += counts[name];
  }

  const users = await User.deleteMany(filter);
  counts.users = users.deletedCount ?? 0;
  removed += counts.users;

  const businesses = await Business.deleteMany({ _id: { $in: ids } });
  counts.businesses = businesses.deletedCount ?? 0;
  removed += counts.businesses;
  return { removed, counts };
}

/**
 * Count anything still carrying the given tenant ids — the verification half of a
 * removal, over the SAME collection list the removal uses, so a collection that is
 * deleted is necessarily also verified. Includes the account rows.
 */
export async function countTenantLeftovers(businessIds: Array<IdLike>): Promise<number> {
  const ids = toIds(businessIds);
  const filter = { businessId: { $in: ids } };
  let total = 0;
  for (const [, model] of TENANT_DATA_COLLECTIONS) {
    total += await model.countDocuments(filter);
  }
  const conversationIds = await AIConversation.find(filter).distinct('_id');
  total += conversationIds.length;
  total += await AIMessage.countDocuments({ conversationId: { $in: conversationIds } });
  total += await User.countDocuments(filter);
  return total;
}

export default {
  TENANT_DATA_COLLECTIONS,
  clearTenantData,
  removeTenant,
  countTenantLeftovers,
};
