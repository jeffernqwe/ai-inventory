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
// deleted — a client-supplied or remembered id is never trusted. In production the account
// must be the OWNER of that one tenant; an optional `:businessId` is accepted and compared
// with the row, so a typo cannot empty a different business.
//
// THE PHRASES (the same two-in-development / three-in-production rule as every cleanup):
//   explicit list : CLEANUP_CONFIRM=cleanup-account-data
//   preset        : CLEANUP_CONFIRM=cleanup-three-accounts
//   both          : plus CLEANUP_DB_CONFIRM=<database>, and CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA
//
// THE PRESET IS DEVELOPMENT ONLY, and refused in production for the same reason the seeder's
// preset is: it would empty three real businesses in one command. Name the addresses instead;
// each one is resolved to its own tenant and checked before a row is deleted.
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
// Production (THREE phrases, the preset refused, the tenant resolved from the address):
//   NODE_ENV=production MONGODB_DB_NAME=inventoryai_prod_db \
//     CLEANUP_CONFIRM=cleanup-account-data CLEANUP_DB_CONFIRM=inventoryai_prod_db \
//     CLEANUP_PROD_CONFIRM=DELETE-PRODUCTION-DATA \
//     npm run cleanup:account -- --database=inventoryai_prod_db \
//       --accounts="you@example.com"
//
//   The optional id is still accepted, and is checked against the account's own tenant:
//     --accounts="you@example.com:<businessId>"

import 'dotenv/config';
import mongoose from 'mongoose';

import env from '../src/config/env.ts';
import Business from '../src/models/business.model.ts';
import User from '../src/models/user.model.ts';
import { assertScopedCleanupTarget } from './cleanup/guard.mjs';
import { CleanupSafetyError } from './cleanup/lib.mjs';
import { SeedSafetyError, clearTenantData, countTenantDataRemoval } from './perf/lib.mjs';
import {
  COMPARISON_ACCOUNTS,
  assertDistinctTenants,
  assertOneBusinessAssociation,
  assertProductionTenantOwnership,
  isEmailAddress,
  normaliseBusinessId,
  normaliseEmail,
  readBusinessAssociations,
} from './seed/lib.mjs';

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

/** One entry: `address[:businessId]`. The id is optional and is only ever a claim to check. */
function parseEntry(entry) {
  const parts = entry.split(':').map((part) => part.trim());
  if (parts.length < 1 || parts.length > 2) {
    fail(
      `--accounts entry "${entry}" must be address or address:businessId. Nothing was deleted.`,
    );
  }

  const email = normaliseEmail(parts[0]);
  if (!isEmailAddress(email)) {
    fail(`--accounts entry "${entry}" has no usable address. Nothing was deleted.`);
  }

  const rawBusinessId = parts[1];
  const businessId = normaliseBusinessId(rawBusinessId);
  if (rawBusinessId !== undefined && !businessId) {
    fail(
      `--accounts entry "${entry}" has a businessId that is not 24 hexadecimal characters. ` +
        'Nothing was deleted.',
    );
  }

  return { email, businessId: businessId ?? undefined };
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
        '--accounts="address,…" — each address is resolved to its own tenant and checked. ' +
        'Nothing was deleted.',
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
  }

  console.log(`Database : ${target.database}${target.production ? ' (PRODUCTION)' : ''}`);
  console.log(`Mode     : ${dryRun ? 'DRY RUN — counting only, nothing will be deleted' : 'DELETE — tenant data only'}`);
  console.log(`Accounts : ${plan.length}`);
  console.log('Keeps    : login, business, members, sessions, identity — never deletes an identity');

  // A connection failure happens before any tenant is resolved or deleted. The old report was the
  // driver's own line (a production dry run exited 1 with only its `DRY RUN` header printed,
  // 2026-10-28), which reads like a run that may have deleted something. It did not.
  try {
    await mongoose.connect(env.mongodbUri, { dbName: env.mongodbDbName });
  } catch (err) {
    throw new CleanupSafetyError(
      `could not reach MongoDB for ${target.database} (${String(err.message).split('\n')[0]}). ` +
        'No document was deleted — the run stopped before its first delete. ' +
        'A transient connection failure is worth one retry of the same command.',
    );
  }

  // ---- resolve and count EVERY tenant first: a misnamed or missing account stops the run
  // ---- before any row is deleted, so a partial cleanup cannot be mistaken for a done one.
  const prepared = [];
  for (const entry of plan) {
    // A destructive command cannot pick one of two tenants for an address, even though the
    // schema says that state cannot exist. The check runs before the lookup that assumes it.
    assertOneBusinessAssociation({
      email: entry.email,
      businessIds: await readBusinessAssociations({ email: entry.email }),
    });

    const user = await User.findOne({ email: entry.email })
      .select('_id businessId role status')
      .lean();

    if (!user) {
      console.log(`\n${entry.email} — no account — nothing to delete`);
      continue;
    }
    if (entry.businessId && String(user.businessId) !== String(entry.businessId)) {
      fail(
        `"${entry.email}" belongs to business ${String(user.businessId)}, not ${entry.businessId}. ` +
          'Refusing to empty a tenant the account does not own. Nothing was deleted.',
      );
    }
    const business = user.businessId
      ? await Business.findById(user.businessId).select('name status').lean()
      : null;

    if (target.production) {
      // The tenant must be a row this run can actually read. The seeder gets this from
      // `resolveExistingTenantForIdentity`; cleanup looks the user up directly, so the business
      // is checked here rather than assumed from a field that can be stale (§27BB / F-50).
      if (!business) {
        fail(
          `"${entry.email}" points at business ${String(user.businessId)}, which does not exist in ` +
            `${target.database}. Refusing to empty a tenant that cannot be checked. Nothing was deleted.`,
        );
      }
      if (business.status !== 'ACTIVE') {
        fail(
          `business ${String(user.businessId)} ("${business.name}") is ${business.status}, not ACTIVE. ` +
            'Refusing to empty it. Nothing was deleted.',
        );
      }

      // The same rule the seeder applies: a production cleanup needs the OWNER of that tenant.
      assertProductionTenantOwnership({
        email: entry.email,
        tenant: {
          businessId: user.businessId,
          businessName: business.name,
          role: user.role,
          status: user.status,
          businessStatus: business.status,
        },
        command: COMMAND,
        namingHint: 'a :businessId in --accounts',
      });
    }

    if (entry.businessId == null) entry.businessId = String(user.businessId);

    const { total, counts } = await countTenantDataRemoval([user.businessId]);
    prepared.push({
      ...entry,
      businessId: String(user.businessId),
      businessName: business?.name ?? 'no business',
      role: user.role,
      status: user.status,
      total,
      counts,
    });
  }

  // A plan names ACCOUNTS; every deletion is scoped to a TENANT, and two members of one business
  // would make the total count that tenant twice (the role fixture is exactly that shape). Checked
  // on the resolved ids, before anything is deleted: the counts above are reads, and a refusal
  // discards them rather than acting on a plan it will not run.
  assertDistinctTenants(prepared, {
    command: COMMAND,
    consequence: 'Nothing was deleted.',
  });

  if (!prepared.length) {
    console.log('\nResult   : SUCCESS — nothing to delete');
    await mongoose.disconnect();
    return;
  }

  const total = prepared.reduce((sum, entry) => sum + entry.total, 0);
  for (const entry of prepared) {
    console.log(
      `\n${entry.email} — ${entry.businessName} — ${entry.total.toLocaleString()} documents` +
        `${entry.total === 0 ? ' (already empty)' : ''}`,
    );
  }

  if (dryRun) {
    console.log('');
    console.log(
      `Would remove : ${total.toLocaleString()} documents across ${prepared.length} tenants`,
    );
    console.log('No data deleted.');
    console.log('Result   : DRY RUN SUCCESS');
    await mongoose.disconnect();
    return;
  }

  for (const entry of prepared) {
    const { removed } = await clearTenantData([entry.businessId]);
    // Prove it over the same plan the removal used: after a data-only clear, the count of
    // business-owned rows must be zero. The account rows are deliberately outside that plan.
    const remaining = (await countTenantDataRemoval([entry.businessId])).total;
    if (remaining !== 0) {
      fail(
        `verification failed: ${remaining} document(s) still reference ${entry.businessId} ` +
          `(${entry.email}). The removal is incomplete — inspect before re-running anything.`,
      );
    }
    console.log(
      `\n${entry.email} — ${entry.businessName} — removed ${removed.toLocaleString()} documents — 0 remaining`,
    );
  }

  console.log('');
  console.log(`Removed  : ${total.toLocaleString()} documents from ${prepared.length} tenants; 0 remaining`);
  console.log('Result   : SUCCESS');

  await mongoose.disconnect();
}

main().catch(async (err) => {
  await mongoose.disconnect().catch(() => {});
  if (err instanceof SeedSafetyError) fail(err.message);
  fail(err && err.message ? err.message : String(err));
});
