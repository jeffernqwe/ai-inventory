// `npm run seed -- --plan=<demo|accounts|roles> --database=<name> …`
//
// THE ONE SEEDING COMMAND. Development and production differ in exactly two
// things: which database `MONGODB_DB_NAME` resolves to, and how many confirmation
// phrases that target requires (two for development, three for production). The
// command itself, the arguments and the dataset shapes are identical.
//
// This file is only a dispatcher. It resolves `--plan`, refuses anything it does
// not know, and runs the plan's own script with every other argument forwarded and
// the environment inherited. It therefore adds no second implementation of any
// dataset, and no second copy of the safety rule: the child script calls the same
// `assertSeedTarget` the direct commands do, so `npm run seed --plan=demo` and
// `npm run seed:demo` cannot disagree about what is safe.
//
// EXIT CODES are the child's, unchanged: a refusal and a verification failure stay
// distinguishable to whatever called this.
//
// Usage:
//   SEED_CONFIRM=seed-demo-account SEED_DB_CONFIRM=inventoryai_dev_db \
//     npm run seed -- --plan=demo --database=inventoryai_dev_db --email=you@example.com
//
// Production (three phrases):
//   NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
//     SEED_CONFIRM=seed-demo-account \
//     SEED_DB_CONFIRM=inventoryai_prod_db \
//     SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA \
//     npm run seed -- --plan=demo --database=inventoryai_prod_db \
//       --email=you@example.com --business=<the id verify:demo prints>

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { SeedSafetyError } from './perf/lib.mjs';
import { extractSeedPlanArg, resolveSeedPlan } from './seed/guard.mjs';

function fail(message) {
  console.error(`[seed] ${message}`);
  process.exit(1);
}

const { plan: requestedPlan, rest } = extractSeedPlanArg(process.argv.slice(2));

let selected;
try {
  selected = resolveSeedPlan(requestedPlan);
} catch (err) {
  if (err instanceof SeedSafetyError) fail(err.message);
  throw err;
}

const script = fileURLToPath(new URL(`./${selected.script}`, import.meta.url));

console.log(`[seed] plan    : ${selected.plan} — ${selected.description}`);
console.log(`[seed] runs    : scripts/${selected.script}`);
console.log(`[seed] phrases : SEED_CONFIRM=${selected.phrase} and SEED_DB_CONFIRM=<database>` +
  (process.env.MONGODB_DB_NAME === 'inventoryai_prod_db'
    ? ', plus SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA'
    : ''));

// `stdio: 'inherit'` keeps the plan's own output, prompts and progress visible and
// unmodified — a wrapper that buffered them would hide the guard's message.
const child = spawnSync(process.execPath, [script, ...rest], {
  stdio: 'inherit',
  env: process.env,
});

if (child.error) {
  fail(`could not start scripts/${selected.script}: ${child.error.message}`);
}
process.exit(child.status ?? 1);
