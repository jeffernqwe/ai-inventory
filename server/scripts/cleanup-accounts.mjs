// `npm run cleanup:account -- --database=<name> --accounts="a@x.com[:businessId],…" [--dry-run]`
// `npm run cleanup:three   -- --database=<name> [--dry-run]`   — the three fixed accounts
//
// Remove the SEEDED DATA of accounts you name, by address, and keep everything that makes
// them accounts: the MongoDB user row, the business row, its members, their sessions and the
// Firebase identity. This is the other half of `seed:accounts` / `seed:three` — the way back
// to an empty business without deleting a login, which is the one unrecoverable direction
// (§27BB / F-50, docs/guides/13-firebase-identities.md).
//
// WHAT IT REMOVES — exactly the business-owned rows `clearTenantData` defines, the same list
// every other cleanup and account deletion use: inventory, movements, purchase orders,
// products, categories, locations, suppliers, audit rows, invitations, and the assistant's
// conversations and messages. Nothing outside the named tenants is read, and nothing inside
// them survives except the account rows.
//
// WHY THE ACCOUNT IS RESOLVED BY ADDRESS. The person names the account the way they see it
// in the app. The address resolves to a user row, and that row's own `businessId` is what is
// deleted — a client-supplied or remembered id is never trusted. In production every account
// MUST also name its tenant, and the two must agree, so a typo cannot empty a different
// business.
//
// THE PHRASES (the same two-in-development / three-in-production rule as every cleanup):
//   explicit list : CLEANUP_CONFIRM=cleanup-account-data
//   preset        : CLEANUP_CONFIRM=cleanup-three-accounts
//   both          : plus CLEANUP_DB_CONFIRM=<database>, and CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA
//
// THE PRESET IS DEVELOPMENT ONLY, and refused in production for the same reason the seeder's
// preset is: it would empty three real businesses in one command. Name them instead, with the
// ids `npm run check:accounts -- --with-production` prints.
//
// `--dry-run` counts through the SAME plan the real run executes, prints every collection it
// would empty, and deletes nothing. A run where nothing was ever seeded reports "nothing to
// delete" and exits 0 — that is an answer, not a failure.
//
// WHAT IT NEVER DOES: delete a user row, a business row, a session or a Firebase identity —
// not even with a flag. Deleting a login whose database row has gone is what
// `cleanup -- --target=database` (database first) and then
// `cleanup -- --target=firebase` (identities second) are for, and the second refuses while a
// row still owns the address. See docs/guides/11-deleting-development.md, 12-deleting-production.md
// and 13-firebase-identities.md.
//
// Usage (development — TWO phrases):
//   CLEANUP_CONFIRM=cleanup-three-accounts CLEANUP_DB_CONFIRM=inventoryai_dev_db \
//     npm run cleanup:three -- --database=inventoryai_dev_db --dry-run
//   … and the same line without --dry-run to delete.
//
//   CLEANUP_CONFIRM=cleanup-account-data CLEANUP_DB_CONFIRM=inventoryai_dev_db \
//     npm run cleanup:account -- --database=inventoryai_dev_db \
//       --accounts="a@x.com,b@y.com" --dry-run
//
// Production (THREE phrases, the preset refused, every tenant named by id):
//   NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
//     CLEANUP_CONFIRM=cleanup-account-data CLEANUP_DB_CONFIRM=inventoryai_prod_db \
//     CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
//     npm run cleanup:account -- --database=inventoryai_prod_db \
//       --accounts="you@example.com:<the id check:accounts printed>,…"

import 'dotenv/config';
import mongoose from 'mongoose';

import env from '../src/config/env.ts';
import User from '../src/models/user.model.ts';
import { assertScopedCleanupTarget } from './cleanup/guard.mjs';
import { SeedSafetyError, clearTenantData, countTenantDataRemoval } from './perf/lib.mjs';
import { COMPARISON_ACCOUNTS, normaliseEmail } from './seed/lib.mjs';

const COMMAND = 'cleanup:account';

/** The phrase for an explicit `--accounts=` list. */
const CONFIRM_PHRASE = 'cleanup-account-data';

/** The phrase for the preset — a different set of tenants, so a different phrase. */
const PRESET = 'three';
const PRESET_PHRASE = 'cleanup-three-accounts';
const PRESET_ALIAS = 'cleanup:three';

function argValue(flag, argv = process.argv) {
  const prefix = `${flag}=`;
  const hit = argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function fail(message) {
  console.error(`[${COMMAND}] ${message}`);
  process.exit(1);
}

/** `--preset=three`, or nothing. Any other value is refused rather than guessed at. */
function presetValue(argv = process.argv) {
  const eq = argv.find((a) => a.startsWith('--preset='));
  if (eq) {
    const value = eq.slice('--preset='.length).trim().toLowerCase();
    if (value !== PRESET) {
      fail(`--preset must be ${PRESET} (or leave it out and pass --accounts=). Nothing was deleted.`);
    }
    return PRESET;
  }
  if (argv.includes('--preset')) {
    fail(`--preset needs a value: --preset=${PRESET}. Nothing was deleted.`);
  }
  return undefined;
}

/** One entry: `address[:businessId]`. The id is the production naming act, never a lookup. */
function parseEntry(entry) {
  const parts = entry.split(':').map((part) => part.trim());
  if (parts.length < 1 || parts.length > 2) {
    fail(
      `--accounts entry "${entry}" must be address or address:businessId. Nothing was deleted.`,
    );
  }

  const email = normaliseEmail(parts[0]);
  if (!email.includes('@')) {
    fail(`--accounts entry "${entry}" has no usable address. Nothing was deleted.`);
  }

  const businessId = parts[1];
  if (businessId && !/^[a-f0-9]{24}$/i.test(businessId)) {
    fail(
      `--accounts entry "${entry}" has a businessId that is not 24 hexadecimal characters. ` +
        'Nothing was deleted.',
    );
  }

  return { email, businessId: businessId || undefined };
}

function parsePlan(raw) {
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(parseEntry);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const preset = presetValue();
  const requested = argValue('--accounts');

  if (preset && requested) {
    fail(`pass either --preset=${PRESET} or --accounts=…, not both. Nothing was deleted.`);
  }
  if (!preset && !requested) {
    fail(
      '--accounts="address[:businessId],…" is required — for the three fixed accounts use ' +
        `${PRESET_ALIAS} (the same script with --preset=${PRESET}). Nothing was deleted.`,
    );
  }

  // Two phrases in development, three in production — the shared cleanup rule, run before
  // a connection is opened, and run on a dry run too so the preview proves the destination.
  const phrase = preset ? PRESET_PHRASE : CONFIRM_PHRASE;
  let target;
  try {
    target = assertScopedCleanupTarget({
      env,
      command: preset ? PRESET_ALIAS : COMMAND,
      confirmPhrase: phrase,
      database: argValue('--database'),
    });
  } catch (err) {
    if (err instanceof SeedSafetyError) fail(err.message);
    fail(err && err.message ? err.message : String(err));
  }

  if (target.production && preset) {
    fail(
      `the ${PRESET_ALIAS} preset is a development convenience and is refused in production: it would ` +
        'empty three real businesses in one command. Name every account instead, as ' +
        '--accounts="address:<businessId>,…" — `npm run check:accounts -- --with-production` prints these ' +
        'three with their ids. Nothing was deleted.',
    );
  }

  const plan = preset
    ? COMPARISON_ACCOUNTS.map((account) => ({ email: account.email, businessId: undefined }))
    : parsePlan(requested);

  if (!plan.length) fail('the plan is empty. Nothing was deleted.');

  const seen = new Set();
  for (const entry of plan) {
    if (seen.has(entry.email)) {
      fail(`"${entry.email}" appears twice in the plan. Nothing was deleted.`);
    }
    seen.add(entry.email);
    // Naming the tenant is what proves the deletion is meant, and it is required exactly
    // where the data is real. Development keeps the one-word command.
    if (target.production && !entry.businessId) {
      fail(
        `--accounts entry "${entry.email}" must name its tenant in production, as ` +
          `"${entry.email}:<businessId>" — that is what proves which business is emptied. ` +
          'Nothing was deleted.',
      );
    }
  }

  console.log(`[${COMMAND}] database : ${target.database}${target.production ? '   (PRODUCTION)' : ''}`);
  console.log(`[${COMMAND}] confirmed: ${target.phrases} phrase(s) accepted`);
  console.log(
    `[${COMMAND}] mode     : ${preset ? `${PRESET_ALIAS} preset (three fixed accounts)` : 'explicit --accounts list'}`,
  );
  console.log(`[${COMMAND}] accounts : ${plan.map((e) => e.email).join(', ')}`);
  console.log(`[${COMMAND}] removes  : their inventory data only — the login, the business row, its members and the Firebase identity are KEPT`);
  if (dryRun) console.log(`[${COMMAND}] mode     : DRY RUN — counting only, nothing will be deleted`);

  await mongoose.connect(env.mongodbUri, { dbName: env.mongodbDbName });

  // ---- resolve and count EVERY tenant first: a misnamed or missing account stops the run
  // ---- before any row is deleted, so a partial cleanup cannot be mistaken for a done one.
  const prepared = [];
  for (const entry of plan) {
    const user = await User.findOne({ email: entry.email })
      .select('_id businessId role')
      .lean();

    if (!user) {
      console.log(
        `[${COMMAND}]   ${entry.email}: no account in ${target.database} — nothing to delete ` +
          '(check the address, or the other database)',
      );
      continue;
    }
    if (entry.businessId && String(user.businessId) !== String(entry.businessId)) {
      fail(
        `"${entry.email}" belongs to business ${String(user.businessId)}, not ${entry.businessId}. ` +
          'Refusing to empty a tenant the account does not own. Nothing was deleted.',
      );
    }

    const { total, counts } = await countTenantDataRemoval([user.businessId]);
    prepared.push({ ...entry, businessId: String(user.businessId), role: user.role, total, counts });
  }

  if (!prepared.length) {
    console.log(
      `[${COMMAND}] nothing to delete — none of the named accounts exist in ${target.database}.`,
    );
    await mongoose.disconnect();
    return;
  }

  console.log('');
  for (const entry of prepared) {
    console.log(
      `[${COMMAND}]   ${entry.email.padEnd(36)} ${String(entry.total).padStart(7)} document(s)` +
        `${entry.total === 0 ? '  (already empty)' : ''}  business ${entry.businessId}`,
    );
  }
  const total = prepared.reduce((sum, entry) => sum + entry.total, 0);

  if (dryRun) {
    console.log('');
    for (const entry of prepared) {
      for (const [collection, count] of Object.entries(entry.counts)) {
        if (count > 0) {
          console.log(
            `[${COMMAND}]   ${entry.email}  ${collection.padEnd(24)} ${count}`,
          );
        }
      }
    }
    console.log(
      `[${COMMAND}] dry run complete — would remove ${total.toLocaleString()} document(s) across ` +
        `${prepared.length} tenant(s); nothing was deleted.`,
    );
    console.log(`[${COMMAND}] to run for real:`);
    // THE ENVIRONMENT PREFIX IS PART OF THE COMMAND — see the same constant in seed-perf-tenant.mjs:
    // `.env` resolves to development, and the guard refuses a database this process did not
    // resolve, so a production line without it cannot be pasted.
    if (target.production) {
      console.log(`[${COMMAND}]   NODE_ENV=production MONGODB_DB_NAME=${target.database} \\`);
    }
    console.log(
      `[${COMMAND}]   CLEANUP_CONFIRM=${phrase} CLEANUP_DB_CONFIRM=${target.database}` +
        `${target.production ? ' CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA' : ''} \\`,
    );
    console.log(
      `[${COMMAND}]     npm run ${preset ? PRESET_ALIAS : COMMAND} -- --database=${target.database}` +
        `${preset ? '' : ` --accounts="${plan.map((e) => (e.businessId ? `${e.email}:${e.businessId}` : e.email)).join(',')}"`}`,
    );
    await mongoose.disconnect();
    return;
  }

  console.log('');
  for (const entry of prepared) {
    const { removed, counts } = await clearTenantData([entry.businessId]);
    for (const [collection, count] of Object.entries(counts)) {
      if (count > 0) console.log(`[${COMMAND}]   ${entry.email}  ${collection.padEnd(24)} ${count}`);
    }
    // Prove it over the same plan the removal used: after a data-only clear, the count of
    // business-owned rows must be zero. The account rows are deliberately outside that plan.
    const remaining = (await countTenantDataRemoval([entry.businessId])).total;
    if (remaining !== 0) {
      fail(
        `verification failed: ${remaining} document(s) still reference ${entry.businessId} ` +
          `(${entry.email}). The removal is incomplete — inspect before re-running anything.`,
      );
    }
    console.log(`[${COMMAND}]   ${entry.email} removed ${removed.toLocaleString()} document(s); 0 remaining`);
  }

  console.log('');
  console.log(
    `[${COMMAND}] OK — ${total.toLocaleString()} document(s) removed from ${prepared.length} tenant(s), ` +
      'each verified at 0 remaining.',
  );
  console.log(
    `[${COMMAND}] kept      : the login, the business row, its members, their sessions and the Firebase ` +
      'identity (F-50 — this command never deletes an identity)',
  );
  console.log(
    `[${COMMAND}] next      : the accounts still sign in, and land in an empty business — seed them again, ` +
        'or start fresh from the app',
  );

  await mongoose.disconnect();
}

main().catch(async (err) => {
  await mongoose.disconnect().catch(() => {});
  if (err instanceof SeedSafetyError) fail(err.message);
  fail(err && err.message ? err.message : String(err));
});
