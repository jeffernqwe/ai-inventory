// `npm run perf:golden` — capture the FULL payload of every AI tool for a tenant,
// and compare two captures to prove an answer did or did not change.
//
// WHY THIS EXISTS. A query optimisation is only safe if the assistant still gives
// the same answer. A timing harness cannot show that, and neither can a test suite
// written against a fixture: this captures the actual payloads the tools return for
// an actual tenant — every argument combination, including the ones that change
// which pipeline branch runs — and hashes each one.
//
// Capture before a change, capture after, and compare:
//
//   node scripts/capture-ai-golden.mjs --business=<id> --out=before.json
//   ...make the change...
//   node scripts/capture-ai-golden.mjs --business=<id> --out=after.json --compare=before.json
//
// The comparison is on the payload hash, the total and the ok/code, and it EXITS
// NON-ZERO on any difference, so it can gate a change rather than merely inform one
// (exit 1 = compared and differs; exit 2 = refused, the captures are from different
// tenants). Read-only: `executeTool` never writes. The tenant must be static between
// the two captures, since a new movement legitimately changes a page — and the
// capture records its businessId so a re-seed is refused instead of misreported.

import 'dotenv/config';
import fs from 'node:fs';
import crypto from 'node:crypto';
import mongoose from 'mongoose';

import env from '../src/config/env.ts';
import Location from '../src/models/location.model.ts';
import Product from '../src/models/product.model.ts';
import User from '../src/models/user.model.ts';
import { AI_TOOLS, executeTool } from '../src/services/ai/tools.ts';

function argValue(flag) {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : undefined;
}

async function main() {
  const businessId = argValue('--business');
  const out = argValue('--out') ?? '/tmp/ai-golden.json';
  const comparePath = argValue('--compare');
  if (!businessId) throw new Error('--business=<id> is required');

  await mongoose.connect(env.mongodbUri, { dbName: env.mongodbDbName });

  const owner = await User.findOne({ businessId, role: 'OWNER' }).select('_id').lean();
  const sample = await Product.findOne({ businessId }).select('sku name').lean();
  const location = await Location.findOne({ businessId }).select('_id').lean();
  if (!owner || !sample || !location) throw new Error('tenant is missing owner/product/location');

  const locationId = String(location._id);
  const searchTerm = String(sample.name).split(' ')[0];

  // Every argument combination the assistant can realistically send, including the
  // filtered paths that change which pipeline branch runs.
  const cases = [
    ['searchProducts', {}],
    ['searchProducts', { q: searchTerm }],
    ['searchProducts', { status: 'ACTIVE' }],
    ['getProduct', { sku: sample.sku }],
    ['getInventory', {}],
    ['getInventory', { status: 'ACTIVE' }],
    ['getInventory', { locationId }],
    ['getInventory', { q: searchTerm }],
    ['getInventory', { lowStock: true }],
    ['getInventory', { outOfStock: true }],
    ['getLowStockProducts', {}],
    ['getOutOfStockProducts', {}],
    ['getReorderNeededProducts', {}],
    ['getInventorySummary', {}],
    ['getInventoryHistory', {}],
    ['getInventoryHistory', { locationId }],
    ['getProductsByLocation', { locationId }],
  ];

  const ctx = { businessId: String(businessId), userId: String(owner._id), role: 'OWNER' };
  const captured = {};
  for (const [tool, args] of cases) {
    const key = `${tool} ${JSON.stringify(args)}`;
    const result = await executeTool(tool, args, ctx);
    const payload = result.ok ? result.result : { code: result.code };
    captured[key] = {
      ok: result.ok,
      code: result.code ?? null,
      hash: crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16),
      total: payload?.count ?? payload?.total ?? null,
      firstItem: payload?.items?.[0] ?? null,
      payload,
    };
    console.log(
      `[golden] ${key.padEnd(52)} ok=${result.ok} total=${String(captured[key].total).padStart(6)} sha=${captured[key].hash} chars=${JSON.stringify(payload).length}`,
    );
  }

  fs.writeFileSync(out, JSON.stringify({ businessId: String(businessId), cases: captured }, null, 1));
  console.log(`[golden] wrote ${out} (${cases.length} cases, ${AI_TOOLS.length} tools declared)`);

  if (comparePath) {
    const raw = JSON.parse(fs.readFileSync(comparePath, 'utf8'));
    // Tolerate a capture written before this guard existed (a flat case map).
    const before = raw && raw.cases ? raw.cases : raw;
    // A DIFFERENT TENANT IS NOT A REGRESSION. Re-seeding (`npm run seed:perf`) creates a
    // new business with new ids, so every case containing an id or a location legitimately
    // differs — reporting that as "the assistant's answers changed" would be a false alarm
    // and, worse, would train a reader to ignore the one message that matters. Exit 2 to
    // distinguish "cannot compare" from "compared and differs".
    if (raw && raw.businessId && String(raw.businessId) !== String(businessId)) {
      console.log(
        `[golden] CANNOT COMPARE — that capture is from business ${raw.businessId}, this run captured ${businessId}.`,
      );
      console.log('[golden] Re-seeding creates a NEW tenant with new ids, so differences are expected; re-capture the baseline first.');
      await mongoose.disconnect();
      process.exitCode = 2;
      return;
    }
    let differences = 0;
    for (const key of Object.keys(captured)) {
      const a = before[key];
      const b = captured[key];
      if (!a) {
        console.log(`[golden] ADDED    ${key}`);
        continue;
      }
      if (a.hash !== b.hash || a.ok !== b.ok || String(a.total) !== String(b.total)) {
        differences += 1;
        console.log(`[golden] DIFF     ${key}`);
        console.log(`[golden]   before: sha=${a.hash} total=${a.total} ok=${a.ok}`);
        console.log(`[golden]   after : sha=${b.hash} total=${b.total} ok=${b.ok}`);
      }
    }
    for (const key of Object.keys(before)) if (!captured[key]) console.log(`[golden] REMOVED  ${key}`);
    console.log(
      differences === 0
        ? `[golden] IDENTICAL — all ${Object.keys(before).length} cases match byte-for-byte (payload hash + total)`
        : `[golden] ${differences} case(s) DIFFER — the assistant's answers changed`,
    );
    process.exitCode = differences === 0 ? 0 : 1;
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  await mongoose.disconnect().catch(() => {});
  console.error('golden capture failed:', err?.message ?? err);
  process.exit(1);
});
