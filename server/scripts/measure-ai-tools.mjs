// `npm run perf:measure -- --business=<id>` — time every AI tool against a seeded
// tenant, with ZERO model calls.
//
// WHY THIS IS THE RIGHT INSTRUMENT. The assistant's cost and latency as a business
// grows is dominated by what happens BEFORE the model is asked anything: the tool
// queries that run per turn, and the cap that stops a whole catalogue ever reaching
// the model. Both are measurable without spending a single request against the AI
// provider — which matters, because the deployed free tier allows about 50 requests
// a day IN TOTAL (measured 2026-10-13, roadmap §27BF: a `429 free-models-per-day`),
// so an end-to-end turn is the most expensive possible unit of information here.
//
// It calls the SAME `executeTool` the orchestration loop calls, with the same
// server-derived context shape, so the timing is what a turn's tool round actually
// costs rather than a re-implementation that happens to look similar.
//
// WHAT IT REPORTS: per tool, min / median / p95 / max milliseconds, the payload
// size in characters, and whether the payload crossed the loop's truncation limit
// (`AI_MAX_TOOL_RESULT_CHARS`, default 12000) — a payload that trips that is a
// finding in itself, because the member's answer is built from a cut-off result.
//
// Usage:
//   node scripts/measure-ai-tools.mjs --business=<businessId> [--iterations=7] [--label=1k]
//   (the businessId is printed by `npm run seed:perf`)

import 'dotenv/config';
import mongoose from 'mongoose';

import env from '../src/config/env.ts';
import Business from '../src/models/business.model.ts';
import Location from '../src/models/location.model.ts';
import Product from '../src/models/product.model.ts';
import User from '../src/models/user.model.ts';
import { aiConfig } from '../src/services/ai/aiConfig.ts';
import { AI_TOOLS, executeTool } from '../src/services/ai/tools.ts';

function argValue(flag) {
  const prefix = `${flag}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function fail(message) {
  console.error(`[measure] ${message}`);
  process.exit(1);
}

/** Median of a sorted copy; the p95 index is clamped for tiny sample sizes. */
function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return { min: sorted[0], median: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1] };
}

/**
 * Representative arguments per tool. Two rules: never pass a filter where omitting
 * it is legal (an unfiltered list is the HEAVIEST case and the one whose cost grows
 * with the tenant, which is exactly what is being measured), and derive ids from
 * real rows so the tool does its real work.
 */
function argsFor(toolName, ctx) {
  const { sampleProduct, locationId, lowStockSku } = ctx;
  switch (toolName) {
    case 'searchProducts':
      return {};
    case 'getProduct':
      return { sku: sampleProduct.sku };
    case 'getInventory':
      return {};
    case 'getLowStockProducts':
      return {};
    case 'getOutOfStockProducts':
      return {};
    case 'getReorderNeededProducts':
      return {};
    case 'getInventorySummary':
      return {};
    case 'getInventoryHistory':
      return {};
    case 'getProductsByLocation':
      return { locationId };
    default:
      return lowStockSku ? { sku: lowStockSku } : {};
  }
}

async function main() {
  const businessId = argValue('--business');
  const iterations = Number.parseInt(argValue('--iterations') ?? '7', 10);
  const label = argValue('--label') ?? 'run';

  if (!businessId || !mongoose.Types.ObjectId.isValid(businessId)) {
    fail('--business=<businessId> is required (seed:perf prints it). Nothing was measured.');
  }
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 200) {
    fail('--iterations must be between 1 and 200.');
  }

  await mongoose.connect(env.mongodbUri, { dbName: env.mongodbDbName });

  const business = await Business.findById(businessId).select('name').lean();
  if (!business) fail(`no business ${businessId} in ${env.mongodbDbName}.`);

  const owner = await User.findOne({ businessId, role: 'OWNER' }).select('_id').lean();
  if (!owner) fail(`business ${businessId} has no OWNER user.`);

  // A real row and a real location, so no tool is handed a fabricated id.
  const sampleProduct = await Product.findOne({ businessId }).select('sku').lean();
  const location = await Location.findOne({ businessId }).select('_id').lean();
  if (!sampleProduct || !location) fail('the tenant has no products or locations to measure against.');

  const [productCount, inventoryCount, transactionCount] = await Promise.all([
    Product.countDocuments({ businessId }),
    mongoose.connection.collection('inventory').countDocuments({ businessId: new mongoose.Types.ObjectId(businessId) }),
    mongoose.connection.collection('inventory_transactions').countDocuments({ businessId: new mongoose.Types.ObjectId(businessId) }),
  ]);

  const cfg = aiConfig();
  console.log(`[measure] label      : ${label}`);
  console.log(`[measure] database   : ${env.mongodbDbName}`);
  console.log(`[measure] business   : ${business.name}`);
  console.log(`[measure] size       : ${productCount} products, ${inventoryCount} inventory rows, ${transactionCount} transactions`);
  console.log(`[measure] iterations : ${iterations} per tool   (zero model calls)`);
  console.log(`[measure] truncation : AI_MAX_TOOL_RESULT_CHARS=${cfg.maxToolResultChars}`);
  console.log('');

  const rows = [];
  for (const tool of AI_TOOLS) {
    const args = argsFor(tool.name, { sampleProduct, locationId: String(location._id) });
    const times = [];
    let lastSize = 0;
    let lastOk = null;
    let lastCode = null;

    for (let i = 0; i < iterations; i += 1) {
      const started = process.hrtime.bigint();
      const result = await executeTool(tool.name, args, {
        businessId: String(businessId),
        userId: String(owner._id),
        role: 'OWNER',
      });
      const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
      times.push(elapsedMs);
      lastOk = result.ok;
      lastCode = result.code ?? null;
      lastSize = JSON.stringify(result.ok ? result.result : result).length;
    }

    const s = stats(times);
    rows.push({ tool: tool.name, ...s, size: lastSize, ok: lastOk, code: lastCode });
  }

  const fmt = (n) => n.toFixed(1).padStart(8);
  console.log('[measure] tool                          min     median        p95        max    payload');
  for (const r of [...rows].sort((a, b) => b.p95 - a.p95)) {
    const flag = r.size > cfg.maxToolResultChars ? '  <-- TRUNCATED' : '';
    console.log(
      `[measure] ${r.tool.padEnd(28)}${fmt(r.min)}${fmt(r.median)}${fmt(r.p95)}${fmt(r.max)}  ${String(r.size).padStart(7)}${flag}`,
    );
  }

  const failed = rows.filter((r) => r.ok === false);
  if (failed.length) {
    console.log('');
    console.log(`[measure] tools that did not return ok: ${failed.map((f) => `${f.tool}(${f.code})`).join(', ')}`);
  }
  const truncated = rows.filter((r) => r.size > cfg.maxToolResultChars);
  console.log('');
  console.log(
    truncated.length
      ? `[measure] FINDING: ${truncated.length} tool result(s) exceed ${cfg.maxToolResultChars} chars and would be cut before the model sees them.`
      : `[measure] no tool result exceeds ${cfg.maxToolResultChars} chars — the model receives each payload whole.`,
  );

  await mongoose.disconnect();
}

main().catch(async (err) => {
  await mongoose.disconnect().catch(() => {});
  fail(err && err.message ? err.message : String(err));
});
