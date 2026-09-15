/**
 * Read-only AI tools (V1). See SYSTEM_SPECIFICATION.md §22–§24.
 *
 * Every tool:
 *   1. receives the authenticated session context { businessId, userId, role },
 *   2. enforces the same role permission its REST counterpart uses,
 *   3. queries only the user's own business (businessId always from ctx),
 *   4. validates arguments against a strict JSON Schema (no businessId, no
 *      MongoDB operators/keys, no unrestricted filters, no collection names),
 *   5. caps every result list,
 *   6. returns structured data — it never writes and never executes arbitrary
 *      MongoDB queries. Unauthorized/unknown/invalid calls are soft results the
 *      assistant can explain, not crashes.
 *
 * Result payloads deliberately reuse the existing read services (products,
 * inventory, transactions, dashboard) so the numbers match the app exactly.
 *
 * Typing note: the JSON Schemas below are runtime DATA — they are handed to the
 * model verbatim — so they stay plain objects described by schema shapes, never
 * replaced by interfaces that could not be sent. Argument typing is a boundary
 * annotation only: the model's arguments arrive as `unknown`, and the runtime
 * checks in `validateToolArgs` (unchanged) are what admit them. Each tool's
 * argument interface documents what survives that check; it never performs it.
 */

import { dashboardService } from '../dashboard.service.ts';
import { inventoryService } from '../inventory.service.ts';
import { productService } from '../product.service.ts';
import { transactionsService, TRANSACTION_TYPES } from '../transactions.service.ts';
import { hasPermission, PERMISSIONS } from '../../constants/roles.ts';

/** The authenticated session context a tool runs under — always server-derived. */
interface ToolContext {
  businessId: string;
  userId: string;
  role: string;
}

/**
 * Arguments as the model produced them: an unvalidated bag of JSON values.
 * Nothing may read a field before `validateToolArgs` has checked it.
 */
type ToolArguments = Record<string, unknown>;

/** The JSON Schema keywords these tool schemas use, and that validation reads. */
interface PropertySchema {
  type?: string;
  enum?: unknown[];
  pattern?: string;
  format?: string;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  description?: string;
}

/**
 * A tool's `parameters`. The index signature is what keeps a schema assignable
 * to the provider layer's `Record<string, unknown>`, because the model — not
 * TypeScript — is what consumes it.
 */
interface ToolSchema extends Record<string, unknown> {
  type?: string;
  additionalProperties?: boolean;
  required?: string[];
  properties?: Record<string, PropertySchema>;
  description?: string;
}

/** A product row this module formats: a hydrated document or an aggregate row. */
type ProductDTOSource = Parameters<typeof productService.toProductDTO>[0];

/** The same row plus the summed availability the stock lists attach to it. */
type StockCardSource = ProductDTOSource & { available?: number | null };

/** One inventory row, exactly as `listRows` returns it. */
type InventoryRow = Awaited<ReturnType<typeof inventoryService.listRows>>['items'][number];

/**
 * Per-tool argument shapes: what each tool's schema admits, and therefore what
 * `validateToolArgs` has already enforced by the time its executor runs. Each
 * extends `ToolArguments` so it stays assignable to the single executor
 * signature the tool table declares.
 */
interface SearchProductsArgs extends ToolArguments {
  q?: string;
  status?: string;
  categoryId?: string;
  limit?: number;
}

interface GetProductArgs extends ToolArguments {
  id?: string;
  sku?: string;
  barcode?: string;
}

interface GetInventoryArgs extends ToolArguments {
  productId?: string;
  locationId?: string;
  q?: string;
  status?: string;
  lowStock?: boolean;
  outOfStock?: boolean;
  limit?: number;
}

interface LimitArgs extends ToolArguments {
  limit?: number;
}

interface ReorderArgs extends ToolArguments {
  q?: string;
  categoryId?: string;
  limit?: number;
}

interface HistoryArgs extends ToolArguments {
  productId?: string;
  locationId?: string;
  type?: string;
  from?: string;
  to?: string;
  limit?: number;
}

interface ProductsByLocationArgs extends ToolArguments {
  locationId: string;
  limit?: number;
}

/**
 * One entry of the tool table. `executor` is declared with method syntax so the
 * per-tool argument interfaces above stay assignable to it, while the call site
 * still hands it the validated argument bag `validateToolArgs` produced.
 */
interface Tool {
  name: string;
  description: string;
  permission: string;
  defaultLimit?: number;
  parameters?: ToolSchema;
  executor(ctx: ToolContext, args: ToolArguments): Promise<unknown>;
}

const objectId = { type: 'string', pattern: '^[0-9a-fA-F]{24}$' };
const statusEnum = { type: 'string', enum: ['ACTIVE', 'ARCHIVED'] };
const limitParam = (def: number, max: number) => ({ type: 'integer', minimum: 1, maximum: max, description: `Maximum rows (default ${def}, up to ${max}).` });

function productCore(doc: ProductDTOSource) {
  const dto = productService.toProductDTO(doc);
  return {
    id: dto.id,
    name: dto.name,
    sku: dto.sku,
    barcode: dto.barcode,
    unit: dto.unit,
    status: dto.status,
    minimumStock: dto.minimumStock,
    category: dto.category,
    sellingPrice: dto.sellingPrice,
  };
}

function stockCard(doc: StockCardSource) {
  return { ...productCore(doc), availableQuantity: Number.isFinite(doc.available) ? doc.available : null };
}

function rowResult(r: InventoryRow) {
  return {
    id: r.id,
    product: r.product,
    location: r.location,
    quantity: r.quantity,
    reservedQuantity: r.reservedQuantity,
    availableQuantity: r.availableQuantity,
    isLowStock: r.isLowStock,
    isOutOfStock: r.isOutOfStock,
  };
}

const tools: Tool[] = [
  {
    name: 'searchProducts',
    description:
      'Search the product catalog by name, SKU, or barcode (partial match, case-insensitive). Use this first when the user names a product and you need its id. Returns catalog fields only — use getProduct or getInventory for stock levels.',
    permission: PERMISSIONS.PRODUCTS_VIEW,
    defaultLimit: 15,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        q: { type: 'string', maxLength: 100, description: 'Search text (product name, SKU, or barcode).' },
        status: statusEnum,
        categoryId: objectId,
        limit: limitParam(15, 25),
      },
    },
    async executor(ctx: ToolContext, args: SearchProductsArgs) {
      const { items, total } = await productService.list(ctx.businessId, {
        q: args.q,
        status: args.status,
        categoryId: args.categoryId,
        skip: 0,
        limit: Math.min(args.limit ?? 15, 25),
      });
      return { count: total, items: items.map(productCore) };
    },
  },

  {
    name: 'getProduct',
    description:
      'Get one product (by id, SKU, or barcode) with its current stock per location. Returns found:false when the product does not exist in this business.',
    permission: PERMISSIONS.PRODUCTS_VIEW,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: objectId,
        sku: { type: 'string', maxLength: 100, description: 'Exact SKU.' },
        barcode: { type: 'string', maxLength: 100, description: 'Exact barcode.' },
      },
      description: 'Provide exactly one of id, sku, or barcode.',
    },
    async executor(ctx: ToolContext, args: GetProductArgs) {
      if (!args.id && !args.sku && !args.barcode) {
        return { found: false, error: 'Provide one of id, sku, or barcode.' };
      }
      const doc = await productService.getByIdentifier(ctx.businessId, {
        id: args.id,
        sku: args.sku,
        barcode: args.barcode,
      });
      if (!doc) return { found: false };
      const rows = await inventoryService.listRows(ctx.businessId, {
        productId: String(doc._id),
        skip: 0,
        limit: 20,
      });
      return {
        found: true,
        product: { ...productCore(doc), stock: rows.items.map(rowResult), stockRows: rows.total },
      };
    },
  },

  {
    name: 'getInventory',
    description:
      'Inventory rows (a product at a location) with on-hand quantity, reserved quantity, and available quantity. Filter by product, location, product search text, product status, low stock, or out of stock.',
    permission: PERMISSIONS.INVENTORY_VIEW,
    defaultLimit: 15,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        productId: objectId,
        locationId: objectId,
        q: { type: 'string', maxLength: 100, description: 'Search product name/SKU/barcode.' },
        status: statusEnum,
        lowStock: { type: 'boolean', description: 'Only rows where available is at or below the product minimum.' },
        outOfStock: { type: 'boolean', description: 'Only rows where available is zero or negative.' },
        limit: limitParam(15, 25),
      },
    },
    async executor(ctx: ToolContext, args: GetInventoryArgs) {
      const { items, total } = await inventoryService.listRows(ctx.businessId, {
        productId: args.productId,
        locationId: args.locationId,
        q: args.q,
        status: args.status,
        lowStock: args.lowStock,
        outOfStock: args.outOfStock,
        skip: 0,
        limit: Math.min(args.limit ?? 15, 25),
      });
      return { count: total, items: items.map(rowResult) };
    },
  },

  {
    name: 'getLowStockProducts',
    description:
      'Products whose available quantity is at or below their configured minimum stock (availability summed across all locations), including products with nothing available. Returns the current page of matching products. For a restock list that flags each item as out-of-stock or low-stock, prefer getReorderNeededProducts.',
    permission: PERMISSIONS.INVENTORY_VIEW,
    defaultLimit: 20,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { limit: limitParam(20, 50) },
    },
    async executor(ctx: ToolContext, args: LimitArgs) {
      const { items, total } = await productService.list(ctx.businessId, {
        lowStock: true,
        skip: 0,
        limit: Math.min(args.limit ?? 20, 50),
      });
      return { count: total, items: items.map(stockCard) };
    },
  },

  {
    name: 'getOutOfStockProducts',
    description:
      'Products with no available stock (available quantity zero or below, summed across all locations). Returns the current page of matching products. Use for "what products are out of stock". For a restock list that also includes low-stock items, prefer getReorderNeededProducts.',
    permission: PERMISSIONS.INVENTORY_VIEW,
    defaultLimit: 20,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { limit: limitParam(20, 50) },
    },
    async executor(ctx: ToolContext, args: LimitArgs) {
      const { items, total } = await productService.list(ctx.businessId, {
        outOfStock: true,
        skip: 0,
        limit: Math.min(args.limit ?? 20, 50),
      });
      return { count: total, items: items.map(stockCard) };
    },
  },

  {
    name: 'getReorderNeededProducts',
    description:
      'Products that need restocking: ACTIVE products whose available quantity (summed across all locations) is at or below their configured minimum stock. Each result is flagged stockStatus OUT_OF_STOCK when nothing is available, otherwise LOW_STOCK, and out-of-stock items are listed first. Use for "what products need restocking", "which products are low in stock or out of stock", "what should I reorder", or "what is running low".',
    permission: PERMISSIONS.INVENTORY_VIEW,
    defaultLimit: 20,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        q: { type: 'string', maxLength: 100, description: 'Search product name/SKU/barcode.' },
        categoryId: objectId,
        limit: limitParam(20, 50),
      },
    },
    async executor(ctx: ToolContext, args: ReorderArgs) {
      const { items, total } = await productService.listReorder(ctx.businessId, {
        q: args.q,
        categoryId: args.categoryId,
        skip: 0,
        limit: Math.min(args.limit ?? 20, 50),
      });
      return { count: total, items: items.map(productService.reorderItemPublic) };
    },
  },

  {
    name: 'getInventorySummary',
    description:
      'Business-wide inventory-health counts: active products, healthy in-stock products (available above their minimum stock), total on-hand quantity, low-stock and out-of-stock product counts, and the most recent stock movements — one entry per logical event, so a transfer between locations appears once with its source and destination rather than as two rows. Use for "how is my inventory doing".',
    permission: PERMISSIONS.DASHBOARD_VIEW,
    parameters: { type: 'object', additionalProperties: false, properties: {} },
    async executor(ctx: ToolContext) {
      return dashboardService.summary(ctx.businessId);
    },
  },

  {
    name: 'getInventoryHistory',
    description:
      'Recent stock movements (newest first). Optionally filter by product, location, movement type, and a createdAt range. Returns the current page of transactions.',
    permission: PERMISSIONS.INVENTORY_HISTORY_VIEW,
    defaultLimit: 15,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        productId: objectId,
        locationId: objectId,
        type: { type: 'string', enum: [...TRANSACTION_TYPES], description: 'Movement type.' },
        from: { type: 'string', format: 'date-time', maxLength: 40, description: 'ISO date; include movements created at or after this.' },
        to: { type: 'string', format: 'date-time', maxLength: 40, description: 'ISO date; include movements created at or before this.' },
        limit: limitParam(15, 50),
      },
    },
    async executor(ctx: ToolContext, args: HistoryArgs) {
      const { items, total } = await transactionsService.list(ctx.businessId, {
        productId: args.productId,
        locationId: args.locationId,
        type: args.type,
        from: args.from,
        to: args.to,
        skip: 0,
        limit: Math.min(args.limit ?? 15, 50),
      });
      return { count: total, items };
    },
  },

  {
    name: 'getProductsByLocation',
    description:
      'Products currently stocked at a specific location, with the available quantity at that location. Pass the location id you want to inspect.',
    permission: PERMISSIONS.INVENTORY_VIEW,
    defaultLimit: 20,
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['locationId'],
      properties: { locationId: objectId, limit: limitParam(20, 50) },
    },
    async executor(ctx: ToolContext, args: ProductsByLocationArgs) {
      const { items, total } = await productService.list(ctx.businessId, {
        locationId: args.locationId,
        skip: 0,
        limit: Math.min(args.limit ?? 20, 50),
      });
      return { count: total, locationId: args.locationId, items: items.map(stockCard) };
    },
  },
];

export const AI_TOOLS = Object.freeze(tools);

export const aiToolsById = new Map(tools.map((t) => [t.name, t] as const));

/** The tool catalog exposed to the AI model (name/description/JSON Schema). */
export const AI_TOOL_DEFS = Object.freeze(
  tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }))
);

function typeMatches(value: unknown, spec: PropertySchema) {
  switch (spec.type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    default:
      return false;
  }
}

/**
 * Strict argument validation against the tool's JSON Schema. Any unknown key,
 * wrong type, out-of-range value, or malformed identifier produces a problem —
 * this is what makes an AI-supplied businessId, Mongo operator, or arbitrary
 * filter impossible to smuggle into the executors.
 *
 * `rawArgs` is `unknown` on purpose: it is model output, so the undefined/null
 * and non-object guards below are the contract, not a formality. The assertions
 * further down only tell the compiler what `typeMatches` has already proven at
 * runtime — they never stand in for it.
 */
export function validateToolArgs(tool: Tool, rawArgs: unknown) {
  if (rawArgs === undefined || rawArgs === null) rawArgs = {};
  if (typeof rawArgs !== 'object' || Array.isArray(rawArgs)) {
    return { problems: ['arguments must be an object'], cleaned: {} };
  }

  const schema = tool.parameters ?? {};
  const props = schema.properties ?? {};
  const problems: string[] = [];
  const cleaned: ToolArguments = {};

  for (const key of schema.required ?? []) {
    // The assertion is only about `null`: narrowing `unknown` through
    // `typeof … === 'object'` admits it again, though the guard above has
    // already replaced a null with `{}`. The check itself is unchanged.
    if (!(key in (rawArgs as ToolArguments))) problems.push(`missing required argument "${key}"`);
  }

  for (const [key, value] of Object.entries(rawArgs as ToolArguments)) {
    const spec = props[key];
    if (!spec) {
      problems.push(`unknown argument "${key}" is not allowed`);
      continue;
    }
    if (value === null) {
      problems.push(`argument "${key}" must not be null`);
      continue;
    }
    if (!typeMatches(value, spec)) {
      problems.push(`argument "${key}" must be a ${spec.type}`);
      continue;
    }
    if (spec.type === 'string') {
      if (spec.enum && !spec.enum.includes(value)) {
        problems.push(`argument "${key}" must be one of: ${spec.enum.join(', ')}`);
        continue;
      }
      if (spec.pattern && !new RegExp(spec.pattern).test(value as string)) {
        problems.push(`argument "${key}" has an invalid value`);
        continue;
      }
      if (typeof spec.maxLength === 'number' && (value as string).length > spec.maxLength) {
        problems.push(`argument "${key}" is too long (max ${spec.maxLength} characters)`);
        continue;
      }
      if (spec.format === 'date-time' && Number.isNaN(Date.parse(value as string))) {
        problems.push(`argument "${key}" must be an ISO date-time`);
        continue;
      }
    }
    if ((spec.type === 'integer' || spec.type === 'number')) {
      if (typeof spec.minimum === 'number' && (value as number) < spec.minimum) {
        problems.push(`argument "${key}" must be at least ${spec.minimum}`);
        continue;
      }
      if (typeof spec.maximum === 'number' && (value as number) > spec.maximum) {
        problems.push(`argument "${key}" must be at most ${spec.maximum}`);
        continue;
      }
    }
    cleaned[key] = value;
  }
  return { problems, cleaned };
}

/**
 * Run one tool call for the authenticated context. Never throws for model-
 * driven problems — invalid/unauthorized/unknown calls become structured
 * results the assistant can see and explain.
 *
 * A permission check is repeated here, at execution time, because the tool table
 * is the last gate before a query runs: the model cannot reach an executor by
 * presenting a role, and `businessId` is only ever the one from `ctx`.
 */
export async function executeTool(name: string, rawArgs: unknown, ctx: ToolContext) {
  const tool = aiToolsById.get(name);
  if (!tool) {
    return { ok: false, code: 'TOOL_NOT_FOUND', error: `The tool "${name}" is not available.` };
  }
  if (!hasPermission(ctx.role, tool.permission)) {
    return {
      ok: false,
      code: 'TOOL_FORBIDDEN',
      error: `You do not have permission to use the "${tool.name}" tool. Only a higher role can access that data.`,
    };
  }
  const { problems, cleaned } = validateToolArgs(tool, rawArgs);
  if (problems.length) {
    return { ok: false, code: 'TOOL_INVALID_ARGUMENTS', error: `Invalid arguments for "${tool.name}": ${problems.join('; ')}` };
  }
  try {
    const value = await tool.executor(ctx, cleaned);
    return { ok: true, result: value };
  } catch (err) {
    // `err` is `unknown`: a thrown value has no shape TypeScript may assume, and
    // the assertion is the erasable way to read the message this log has always
    // read. Nothing is attached to the error that leaves.
    console.error('[ai] tool execution failed', name, (err as { message?: unknown })?.message ?? err);
    return { ok: false, code: 'TOOL_ERROR', error: 'The tool failed to run. Please try again.' };
  }
}

export default { AI_TOOLS, AI_TOOL_DEFS, executeTool, validateToolArgs };
