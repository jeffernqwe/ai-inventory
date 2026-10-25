// `npm run perf:turns -- --business=<id>` — measure REAL assistant turns over HTTP,
// against a seeded tenant, and check each answer against known ground truth.
//
// DEPLOYED SERVER (production included):
//   PERF_TURNS_CONFIRM=perf-turns:production PERF_ACCOUNT_PASSWORD='…' \
//     EXPO_PUBLIC_FIREBASE_API_KEY='…' npm run perf:turns -- \
//       --base=https://ai-inventory-l1mi.onrender.com \
//       --database=inventoryai_prod_db --business=<id> --login --only=1,2
//
// WHY THIS EXISTS. `perf:measure` times the tools in isolation, with zero model
// calls, which is the right instrument for a query cost but says nothing about what
// a member actually experiences: the provider's own latency, how many tool
// iterations a question causes, whether the answer is grounded in the tenant's real
// numbers, and whether a large catalogue pushes a turn past `AI_TURN_DEADLINE_MS`.
// This probe asks the assistant the questions a member asks, over the real route,
// and prints the wall clock, the tools the turn used, the model, and the answer.
//
// GROUND TRUTH, READ AT RUN TIME RATHER THAN REMEMBERED. Each question carries the
// facts its answer must contain, and the probe REPORTS the missing ones instead of
// judging the prose. Every fact comes out of the database when the probe runs: the
// dashboard counts from `dashboardService.summary()`, the restock total from
// `productService.listReorder().total`, and the product's own name and on-hand
// quantity from its documents.
//
// WHY IT CHANGED (2026-10-16). The first three facts used to be literals — 10 000
// products, 1 492 low, 620 out — because the seed is deterministic. The seeded
// tenant then grew to 50 000 products and the probe printed `MISSING 10000, 1492,
// 620` against a completely correct answer. That is the one thing an instrument must
// never do: a false negative that costs a person an afternoon of re-reading a good
// answer. A number remembered in a script is only ever true of one database.
//
// WHAT THIS DOES AND DOES NOT PROVE. Taking the counts from the same services the AI
// tools call makes this a check that the model REPORTS the database faithfully, and
// it works at any catalogue size. It cannot catch a defect INSIDE those services,
// because they produced the expectation — deliberately so: duplicating the low-stock
// rule here (available <= minimumStock, ACTIVE only) would risk an expectation that
// is itself wrong, and those rules already have their own suites. Numbers are
// compared after stripping thousands separators, because a model writes 1,492 as
// often as 1492.
//
// AUTH, TWO WAYS. Against a LOCAL server it does NOT create a password for the seed user
// (no credential belongs in a script): it mints a session exactly the way a successful login
// does — a `jti`, a signed access token, and the server-side session row the token names —
// using the application's own functions, so `requireAuth` is exercised for real and the probe
// holds a token the server would have issued itself.
//
// A DEPLOYED server cannot be reached that way: its `JWT_SECRET` is not on a laptop (correctly),
// so a locally minted token is refused there. `--login` therefore signs in over Firebase's REST
// endpoint with the seeded account's password and exchanges the ID token at
// `POST /api/auth/firebase/exchange` — the production authentication path itself, not a copy of
// it. The database must then be NAMED (`--database=<name>`) and confirmed with
// `PERF_TURNS_CONFIRM=perf-turns:production`, because `--base=https://…` alone says which server
// to call but not which database the ground truth in this process is read from.
//
// COST. Every turn spends provider quota (the deployed free tier allows roughly 50
// requests a day IN TOTAL, roadmap §27BF), and a turn with tool iterations spends
// more than one request. Keep the question list short — and when you only need ONE
// of them (`--only=1`, or `--only=1,3`), say so: re-checking a single question
// should not cost the others. The provider's remaining allowance is read BEFORE the
// first turn (AI-27), and a run that cannot fit its questions is refused with exit 2
// rather than spent discovering it — `--force` overrides. `npm run ai:usage --
// --provider-only` answers the same question on its own, for free. The turn's own split now arrives in the SERVER's
// log (`[ai] turn outcome=… providerMs=… calls=… toolMs=…`, AI-5), so a single
// question is often all that is needed to see where the time went.

import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';

import env from '../src/config/env.ts';
// The models BARREL, not the four models this script reads directly: the services it
// now calls populate by model NAME (`Location`, `Category`), so a script that imports
// only what it touches itself fails with "Schema hasn't been registered for model
// 'Location'" — which is exactly how the first run of the run-time-derived version
// behaved. Importing the barrel registers every schema, as the app itself does.
import { Business, Inventory, Product, User } from '../src/models/index.ts';
import { signAccessToken } from '../src/config/jwt.ts';
import dashboardService from '../src/services/dashboard.service.ts';
import inventoryService from '../src/services/inventory.service.ts';
import productService from '../src/services/product.service.ts';
import { createSessionForToken, newSessionId } from '../src/services/session.service.ts';
// The allowance reading lives in `ai-usage.mjs`, which already asks the provider's own
// account (`GET /v1/key`) and already knows how to read a free-model counter. Imported
// rather than re-implemented: a second copy of that knowledge is how two tools end up
// disagreeing about the same day's budget.
import { DEFAULT_BASE_URL, allowanceLine, readProviderUsage, shortfall } from './ai-usage.mjs';
import { factPresent } from './perf/factCheck.mjs';
import { exchangeForAccessToken, signInWithPassword } from './perf/firebaseLogin.mjs';
import {
  PERF_TURNS_PROD_CONFIRM,
  SEED_OWNER_EMAIL,
  SeedSafetyError,
  assertMeasurementTarget,
} from './perf/lib.mjs';

function argValue(flag) {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : undefined;
}

/** Names the answer must contain once the product-specific fact is known. */
const PRODUCT_SKU = 'SEEDSKU-0';

async function main() {
  const businessId = argValue('--business');
  const base = argValue('--base') ?? 'http://localhost:4000';
  // The default lands OUTSIDE the repository on purpose (a measurement must never
  // become a committed file), and it is derived from the host's own temp directory
  // rather than naming one developer's machine, so the probe works anywhere.
  const out = argValue('--out') ?? path.join(os.tmpdir(), 'ai-turns.json');
  if (!businessId) throw new Error('--business=<id> is required');

  // This run WRITES conversation rows and spends the shared free-model allowance, so the
  // database is decided before a connection exists and before a single turn is authorised.
  // Development and test need no naming; anything else — production above all — must be named
  // with `--database=` and confirmed, because this process also reads the ground truth from it.
  const login = process.argv.includes('--login');
  let target;
  try {
    target = assertMeasurementTarget({
      mongodbUri: env.mongodbUri,
      resolvedDbName: env.mongodbDbName,
      requestedDatabase: argValue('--database'),
      confirm: process.env.PERF_TURNS_CONFIRM,
      confirmPhrase: PERF_TURNS_PROD_CONFIRM,
      command: 'perf:turns',
    });
  } catch (err) {
    if (!(err instanceof SeedSafetyError)) throw err;
    console.error(`[turns] ${err.message}`);
    process.exit(1);
  }
  console.log(
    `[turns] database     : ${target.database} (environment ${env.nodeEnv})${target.production ? '   (PRODUCTION)' : ''}`,
  );

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

  // The tenant-wide facts, read the same way — and through the same services the AI
  // tools themselves call, so the expectation can never describe a different
  // database than the answer it is checked against.
  const summary = await dashboardService.summary(businessId);
  const restock = await productService.listReorder(businessId, { skip: 0, limit: 1 });
  // AI-23 — the per-location figures this probe now asks about, read through the same
  // service the new tool calls, so the expectation describes this database rather than a
  // remembered one. The two biggest shelves are used: a comparison of two locations is
  // what the device question asked, and picking them by stock avoids relying on names.
  const breakdown = await inventoryService.locationBreakdown(businessId);
  const topShelves = breakdown.locations.slice(0, 2);

  const questions = [
    {
      message: 'How is my inventory doing? Give me the headline numbers.',
      expects: [summary.totalProducts, summary.lowStockProducts, summary.outOfStockProducts],
      why: `dashboard summary: active products / low stock / out of stock (${summary.totalProducts} / ${summary.lowStockProducts} / ${summary.outOfStockProducts}, read now)`,
    },
    {
      message: 'Which products need restocking, and how many are there in total?',
      expects: [restock.total],
      why: `reorder list total (${restock.total}, read now)`,
    },
    {
      message: `What is the current stock of the product with SKU ${PRODUCT_SKU}? Tell me its name and quantity.`,
      // The question asks for BOTH facts, so both are checked. The first version checked only
      // the name, which meant an answer that named the right product and omitted — or
      // invented — its quantity still printed OK. The dashboard's on-hand figure is the
      // authority, and it is read from the database above.
      expects: [String(product.name), onHand],
      why: `product lookup (name ${product.name}, on hand across locations ${onHand}, read now)`,
    },
    {
      // THE QUESTION THIS HARNESS WAS MISSING. On 2026-10-13 this exact wording
      // returned `504 AI_TIMEOUT` at 60 341 ms against this tenant (§27BG, Q4) —
      // the one recorded failure that a re-run could not reproduce, because the
      // question was never in the list. It is here so the failure that mattered is
      // the one the harness would notice coming back.
      message:
        'How many products are completely out of stock, and what percentage of the active catalogue is that?',
      expects: [summary.outOfStockProducts, summary.totalProducts],
      why: `the out-of-stock count (${summary.outOfStockProducts}) and the percentage base (${summary.totalProducts}) it is quoted against (§27BG Q4)`,
    },
    {
      // OWNER REQUEST, 2026-10-16: "During the next AI test, include this simple
      // question — 'How many total units do we have?' — to verify that the
      // assistant can report the total inventory quantity correctly." It is the
      // simplest figure in the system and the one a member checks the dashboard
      // against, so a wrong or refused answer here is a first-impression defect.
      // The expectation is `totalInventoryQuantity`, the same field the mobile
      // dashboard renders, so a mismatch means the assistant and the app disagree.
      message: 'How many total units do we have?',
      expects: [summary.totalInventoryQuantity],
      why: `total on-hand units across the tenant (${summary.totalInventoryQuantity}, read now — the figure the dashboard shows)`,
    },
    {
      // AI-23, from the owner's own phone question on 2026-10-19: it cost 3 provider calls
      // and 29.3 s because the member never names the locations, so a call went on learning
      // them before any per-location question could be phrased. `getLocationBreakdown`
      // exists to answer it in one lookup, and only a REAL turn on the deployed model can
      // show whether the model reaches for it. Two counts are required, so an answer that
      // describes only one location fails.
      // The wording matters, and the first run proved it: *"Compare my two locations"* on a tenant
      // with THREE locations is genuinely ambiguous, and the model correctly asked which two
      // (calling only `listLocations`). This wording removes the ambiguity while still asking
      // the comparison the tool exists to answer, so a per-location lookup per shelf remains
      // the alternative the tool has to beat.
      message: 'How many products does each of my locations hold, and which holds the most?',
      expects: topShelves.map((row) => row.products).slice(0, 2),
      why: `the two biggest locations' product counts (${topShelves
        .map((row) => `${row.name ?? 'unnamed'}: ${row.products}`)
        .join(', ')}, read now — one lookup should answer this)`,
    },
  ];

  // Which questions this run asks — computed BEFORE anything is minted or spent, because
  // the allowance check below is a function of this list's length.
  const only = (argValue('--only') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const picked = questions.filter((_question, i) => only.length === 0 || only.includes(String(i + 1)));
  if (picked.length === 0) {
    throw new Error(`--only=${only.join(',')} matched no question (the list has 1..${questions.length})`);
  }

  // AI-27 — read the provider's own remaining allowance BEFORE the first turn.
  //
  // Measured 2026-10-19: two questions here answered `429 AI_QUOTA_EXCEEDED`, and the
  // run's only finding was that the day had already been spent. The same fact is
  // available for free (the provider reports its own counters), so it is read first and
  // the probe refuses rather than spends. It refuses only on a KNOWN shortfall: an
  // unreadable allowance — no key, no network, an unfamiliar body — is printed and the run
  // continues, because a diagnostic that cannot see must not stop work it might be wrong
  // about. `--force` overrides, for the case where the provider's counter is stale but its
  // answers are not. The refusal happens BEFORE a session is minted, so a refused run
  // leaves nothing behind.
  const allowance = await readProviderUsage({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseUrl: process.env.OPENROUTER_BASE_URL || DEFAULT_BASE_URL,
  });
  const short = shortfall(allowance, picked.length);
  console.log(`[turns] allowance: ${allowanceLine(allowance)}; ${picked.length} question(s) selected`);
  if (short && !process.argv.includes('--force')) {
    console.error(
      `[turns] refusing to spend ${short.needed} turn(s): ${short.remaining} of ${short.limit} ` +
        'free-model request(s) are left for today. Nothing was sent to the provider. Re-run once ' +
        'the window rolls over (00:00 UTC), ask fewer questions with --only=, or pass --force.',
    );
    await mongoose.disconnect();
    process.exit(2);
  }

  // Authenticate, then let go of the database entirely: the probe must measure the SERVER's turn,
  // not share its connection pool. A local run mints its own session; `--login` uses the app's own
  // Firebase sign-in and exchange, which is the only path a deployed server accepts.
  let token;
  let authLabel;
  if (login) {
    const email = argValue('--email') ?? SEED_OWNER_EMAIL;
    const password = process.env.PERF_ACCOUNT_PASSWORD || process.env.DEMO_ACCOUNT_PASSWORD;
    const apiKey = argValue('--firebase-api-key') ?? process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
    if (!password) {
      throw new Error(
        '--login needs PERF_ACCOUNT_PASSWORD (or DEMO_ACCOUNT_PASSWORD) in the environment — ' +
          'the credential the seed set on the account it created',
      );
    }
    const signedIn = await signInWithPassword({ apiKey, email, password });
    const exchanged = await exchangeForAccessToken({
      baseUrl: base,
      idToken: signedIn.idToken,
      deviceLabel: 'perf:turn probe (firebase login)',
    });
    token = exchanged.token;
    authLabel = `firebase login as ${email}`;
  } else {
    const jti = newSessionId();
    token = signAccessToken(owner._id, jti);
    await createSessionForToken({
      userId: owner._id,
      businessId,
      token,
      deviceLabel: 'perf:turn probe',
    });
    authLabel = `local session for user ${String(owner._id)}`;
  }
  await mongoose.disconnect();

  console.log(`[turns] tenant ${business.name}`);
  console.log(`[turns] base   ${base}`);
  console.log(`[turns] auth   ${authLabel}`);
  console.log('');

  const results = [];
  let conversationId;
  for (const question of picked) {
    const index = questions.indexOf(question);
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
    // THE FACT CHECK ONLY MEANS SOMETHING ON A TURN THAT SUCCEEDED. A failed turn
    // answers with an error envelope, and reporting its facts as `MISSING` reads as
    // "the model got the numbers wrong" when the truth is "the model never answered"
    // — the same class of false negative this probe was just fixed for. Measured
    // 2026-10-16: a `502 AI_UNAVAILABLE` printed `MISSING 3079, 50000` against an
    // error body and nothing else.
    const succeeded = status === 201;
    const missing = succeeded
      ? question.expects
          .filter((fact) => !factPresent(answer, fact))
          .map((fact) => String(fact).slice(0, 40))
      : [];

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
    console.log(`[turns]      tools : ${(assistant?.toolsUsed ?? []).join(', ') || '(none named in the response)'}`);
    console.log(
      `[turns]      check : ${question.why} -> ${
        succeeded
          ? missing.length
            ? `MISSING ${missing.join(', ')}`
            : 'all expected facts present'
          : `NOT CHECKED — the turn did not succeed (status ${status}); see the server's own [ai] line for what ran`
      }`,
    );
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
