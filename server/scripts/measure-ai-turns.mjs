// `npm run perf:turns -- --business=<id>` — measure REAL assistant turns over HTTP,
// against a seeded tenant, and check each answer against known ground truth.
//
// WHY THIS EXISTS. `perf:measure` times the tools in isolation, with zero model
// calls, which is the right instrument for a query cost but says nothing about what
// a member actually experiences: the provider's own latency, how many tool
// iterations a question causes, whether the answer is grounded in the tenant's real
// numbers, and whether a large catalogue pushes a turn past `AI_TURN_DEADLINE_MS`.
// This probe asks the assistant the questions a member asks, over the real route,
// and prints the wall clock, the tools the turn used, the model, and the answer.
//
// GROUND TRUTH. Each question carries the facts its answer must contain, and the
// probe REPORTS the missing ones instead of judging the prose. Two of them are the
// seeded tenant's fixed figures (the seed is deterministic: 10 000 products, 1 492
// low, 620 out — see `seed:perf`); the product-specific one is read out of the
// database at run time, so it stays correct if the seed changes. Numbers are
// compared after stripping thousands separators, because a model writes 1,492 as
// often as 1492.
//
// AUTH. It does NOT create a password for the seed user (no credential belongs in a
// script). It mints a session exactly the way a successful login does — a `jti`, a
// signed access token, and the server-side session row the token names — using the
// application's own functions, so `requireAuth` is exercised for real and the probe
// holds a token the server would have issued itself.
//
// COST. Every turn spends provider quota (the deployed free tier allows roughly 50
// requests a day IN TOTAL, roadmap §27BF), and a turn with tool iterations spends
// more than one request. Keep the question list short.

import 'dotenv/config';
import fs from 'node:fs';
import mongoose from 'mongoose';

import env from '../src/config/env.ts';
import Business from '../src/models/business.model.ts';
import Inventory from '../src/models/inventory.model.ts';
import Product from '../src/models/product.model.ts';
import User from '../src/models/user.model.ts';
import { signAccessToken } from '../src/config/jwt.ts';
import { createSessionForToken, newSessionId } from '../src/services/session.service.ts';

function argValue(flag) {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : undefined;
}

/** Names the answer must contain once the product-specific fact is known. */
const PRODUCT_SKU = 'SEEDSKU-0';

function normalize(value) {
  return String(value).replace(/[,\s\u00a0]/g, '');
}

async function main() {
  const businessId = argValue('--business');
  const base = argValue('--base') ?? 'http://localhost:4000';
  const out = argValue('--out') ?? 'C:/Users/jeffe/AppData/Local/Temp/ai-turns.json';
  if (!businessId) throw new Error('--business=<id> is required');

  await mongoose.connect(env.mongodbUri, { dbName: env.mongodbDbName });
  const business = await Business.findById(businessId).select('name status').lean();
  const owner = await User.findOne({ businessId, role: 'OWNER' }).select('_id name').lean();
  if (!business || !owner) throw new Error('seed tenant is missing');
  if (business.status !== 'ACTIVE') throw new Error(`business status is ${business.status}`);

  // The product facts, read from the database rather than assumed.
  const product = await Product.findOne({ businessId, sku: PRODUCT_SKU }).select('_id name').lean();
  if (!product) throw new Error(`no product ${PRODUCT_SKU} in the seed tenant`);
  const rows = await Inventory.find({ businessId, productId: product._id }).select('quantity').lean();
  const onHand = rows.reduce((sum, row) => sum + (row.quantity ?? 0), 0);

  const questions = [
    {
      message: 'How is my inventory doing? Give me the headline numbers.',
      expects: ['10000', '1492', '620'],
      why: 'dashboard summary: active products / low stock / out of stock',
    },
    {
      message: 'Which products need restocking, and how many are there in total?',
      expects: ['1492'],
      why: 'reorder list total',
    },
    {
      message: `What is the current stock of the product with SKU ${PRODUCT_SKU}? Tell me its name and quantity.`,
      expects: [String(product.name)],
      why: `product lookup (on hand across locations: ${onHand})`,
    },
    {
      // THE QUESTION THIS HARNESS WAS MISSING. On 2026-10-13 this exact wording
      // returned `504 AI_TIMEOUT` at 60 341 ms against this tenant (§27BG, Q4) —
      // the one recorded failure that a re-run could not reproduce, because the
      // question was never in the list. It is here so the failure that mattered is
      // the one the harness would notice coming back.
      message:
        'How many products are completely out of stock, and what percentage of the active catalogue is that?',
      expects: ['620', '10000'],
      why: 'the out-of-stock count and the percentage base it is quoted against (§27BG Q4)',
    },
  ];

  // Mint a session the way login does, then let go of the database entirely: the
  // probe must measure the SERVER's turn, not share its connection pool.
  const jti = newSessionId();
  const token = signAccessToken(owner._id, jti);
  await createSessionForToken({
    userId: owner._id,
    businessId,
    token,
    deviceLabel: 'perf:turn probe',
  });
  await mongoose.disconnect();

  console.log(`[turns] tenant ${business.name}`);
  console.log(`[turns] base   ${base}`);
  console.log('');

  const results = [];
  let conversationId;
  for (const [index, question] of questions.entries()) {
    const body = { message: question.message };
    if (conversationId) body.conversationId = conversationId;

    const started = Date.now();
    let status;
    let payload;
    let raw;
    try {
      const res = await fetch(`${base}/api/ai/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      status = res.status;
      raw = await res.text();
      payload = raw ? JSON.parse(raw) : null;
    } catch (err) {
      results.push({ question: question.message, status: 0, ms: Date.now() - started, error: err?.message ?? String(err) });
      console.log(`[turns] q${index + 1} TRANSPORT FAILURE: ${err?.message ?? err}`);
      continue;
    }
    const ms = Date.now() - started;

    const assistant = payload?.assistantMessage;
    if (payload?.conversation?.id) conversationId = payload.conversation.id;
    const answer = assistant?.content ?? payload?.message ?? raw.slice(0, 400);
    const missing = question.expects
      .filter((fact) => !normalize(answer).includes(normalize(fact)))
      .map((fact) => String(fact).slice(0, 40));

    results.push({
      question: question.message,
      why: question.why,
      status,
      ms,
      degraded: payload?.degraded ?? null,
      model: assistant?.model ?? null,
      toolsUsed: assistant?.toolsUsed ?? [],
      usage: assistant?.usage ?? null,
      answerChars: String(answer).length,
      missingFacts: missing,
      answer,
    });

    console.log(
      `[turns] q${index + 1}  status=${status}  ${ms} ms  degraded=${payload?.degraded ?? '-'}  model=${assistant?.model ?? '-'}`,
    );
    console.log(`[turns]      tools : ${(assistant?.toolsUsed ?? []).join(', ') || '(none)'}`);
    console.log(`[turns]      check : ${question.why} -> ${missing.length ? `MISSING ${missing.join(', ')}` : 'all expected facts present'}`);
    console.log(`[turns]      answer: ${String(answer).replace(/\s+/g, ' ').slice(0, 420)}`);
    console.log('');
  }

  fs.writeFileSync(out, JSON.stringify(results, null, 1));
  const answered = results.filter((r) => r.status === 201);
  const times = answered.map((r) => r.ms).sort((a, b) => a - b);
  const grounded = answered.filter((r) => r.missingFacts.length === 0).length;
  console.log(
    `[turns] answered ${answered.length}/${results.length} | grounded ${grounded}/${answered.length} | ms: ${times.join(', ')} | slowest ${times.at(-1) ?? '-'}`,
  );
  console.log(`[turns] wrote ${out}`);
}

main().catch((err) => {
  console.error('turn probe failed:', err?.message ?? err);
  process.exit(1);
});
