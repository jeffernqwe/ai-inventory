import Business from './business.model.js';
import User from './user.model.js';
import Session from './session.model.js';
import Location from './location.model.js';
import Category from './category.model.js';
import Supplier from './supplier.model.js';
import PurchaseOrder from './purchaseOrder.model.js';
import Product from './product.model.js';
import Inventory from './inventory.model.js';
import InventoryTransaction from './inventoryTransaction.model.js';
import AuditLog from './auditLog.model.js';
import AIConversation from './aiConversation.model.js';
import AIMessage from './aiMessage.model.js';

export {
  Business,
  User,
  Session,
  Location,
  Category,
  Supplier,
  PurchaseOrder,
  Product,
  Inventory,
  InventoryTransaction,
  AuditLog,
  AIConversation,
  AIMessage,
};

/** Every registered model, for tooling/tests that iterate the schema set. */
export const models = [
  Business,
  User,
  Session,
  Location,
  Category,
  Supplier,
  PurchaseOrder,
  Product,
  Inventory,
  InventoryTransaction,
  AuditLog,
  AIConversation,
  AIMessage,
];

export default models;
