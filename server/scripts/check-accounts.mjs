// `npm run check:accounts [--with-production] [--accounts="a@x.com,b@y.com"]`
//
// Answer, without changing anything: do these accounts exist, in which database, and are
// they linked to the Firebase identities they claim? Run this BEFORE seeding — it is the
// gate the seeder's own dry run points at.
//
// WHAT IT READS. For every address: the Firebase identity (uid, whether it is disabled or
// verified, and how it signs in), then the user row in each database — business, role,
// status, the stored `firebaseUid` — and, through the SAME teardown plan the cleanup
// executes, how many documents a seed would reset in that tenant.
//
// READ-ONLY, PROVEN RATHER THAN PROMISED. It never writes to either store: no insert, no
// update, no delete, no Firebase user creation or deletion, and no session. `--dry-run` is
// therefore not a mode it needs — there is nothing to preview but the state itself.
//
// WHICH DATABASE. Exactly ONE per run, and a fixed choice rather than a free-form flag: the
// development database by default, the production database when `--with-production` is given.
// One, because readiness is a statement about the environment that is about to be written to:
// judging both at once made a MISSING row in development fail a production check that was READY
// (measured 2026-10-28), and the exit code then described a database nobody was seeding. The tool
// still cannot be pointed at a database someone else names — it takes no `--database=` and needs
// no phrase — and the test database is never read: `npm test` owns it and clears it.
//
// THE FIREBASE PROJECT IS THE ONE THIS SHELL IS CONFIGURED FOR, printed by id so the
// answer is checkable. If the deployed server uses a different project, its identities are
// not the ones described here.
//
// EXIT CODES, the same contract `verify:demo` uses:
//   0  every account is READY in the database that was read
//   1  something is MISSING or MISMATCHED there — a state, not an error; the blocks say which
//   2  NOT CHECKED — no connection string, the database could not be reached, or Firebase
//      is not configured. Nothing is known, and nothing is claimed.
//
// Usage:
//   npm run check:accounts                                  # the three fixed accounts, development
//   npm run check:accounts -- --with-production                # production instead of development
//   npm run check:accounts -- --accounts="a@x.com,b@y.com"  # your own addresses

import 'dotenv/config';
import mongoose from 'mongoose';

import env, { DATABASE_NAMES } from '../src/config/env.ts';
import Business from '../src/models/business.model.ts';
import User from '../src/models/user.model.ts';
import { firebaseConfig, isFirebaseConfigured } from '../src/config/firebase.ts';
import { getFirebaseAdminApp } from '../src/services/firebase/adminApp.ts';
import { getAuth } from 'firebase-admin/auth';
import { SeedSafetyError, countTenantDataRemoval } from './perf/lib.mjs';
import { assertSeedFirebaseProject } from './seed/guard.mjs';
import { COMPARISON_ACCOUNTS, databasesToCheck, normaliseEmail, summariseReadiness } from './seed/lib.mjs';

const COMMAND = 'check:accounts';

function argValue(flag, argv = process.argv) {
  const prefix = `${flag}=`;
  const hit = argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function fail(message, code = 2) {
  console.error(`[${COMMAND}] ${message}`);
  process.exit(code);
}

/** The addresses to check: `--accounts=` if given, otherwise the three fixed ones. */
function parseAccounts(raw) {
  const list = raw
    ? raw
        .split(',')
        .map((value) => normaliseEmail(value))
        .filter(Boolean)
    : COMPARISON_ACCOUNTS.map((account) => account.email);

  if (!list.length) fail('--accounts="" names nothing. Nothing was read.');
  for (const email of list) {
    if (!email.includes('@')) fail(`"${email}" is not an address. Nothing was read.`);
  }
  return [...new Set(list)];
}

/** The Firebase half: identity present, and what it says about itself. */
async function readIdentity(auth, email) {
  try {
    const user = await auth.getUserByEmail(email);
    return {
      exists: true,
      uid: user.uid,
      disabled: Boolean(user.disabled),
      emailVerified: Boolean(user.emailVerified),
      providers: (user.providerData ?? []).map((p) => p.providerId).filter(Boolean),
    };
  } catch (err) {
    if (err?.code === 'auth/user-not-found') return { exists: false };
    throw err;
  }
}

const OWNER_COMMENT = 'the login, the business row and its members are never touched by a seed or a cleanup';

/**
 * One account, in one database.
 *
 * The verdict is the answer to the only question the seeder asks: will it reuse this
 * tenant, refuse, or create one? `countTenantDataRemoval` is the counting half of the
 * SAME teardown plan the cleanup runs, so "what a seed would reset" here is exactly what
 * would be replaced — the check, the preview and the delete cannot describe different rows.
 */
async function checkInDatabase(email, identity, { production = false } = {}) {
  const rows = await User.find({ email })
    .select('_id businessId role status firebaseUid emailVerified')
    .lean();

  // `users.email` is unique, so more than one row should be impossible — but a destructive
  // command resolves the address before it acts, and this is the read-only place to report
  // that the resolution would be a choice between tenants rather than a lookup.
  const linkedBusinesses = [...new Set(rows.map((row) => String(row.businessId)).filter(Boolean))];
  if (linkedBusinesses.length > 1) {
    return {
      verdict: 'AMBIGUOUS',
      detail:
        `${rows.length} user rows link this address to ${linkedBusinesses.length} businesses ` +
        `(${linkedBusinesses.join(', ')}) — a seed or cleanup would REFUSE to choose one`,
      businessId: null,
      documents: 0,
      products: 0,
    };
  }

  const user = rows[0];
  if (!user) {
    return {
      verdict: 'MISSING',
      detail: production
        ? 'no user row — a production seed REFUSES (register the account in the app first); it does not create a tenant'
        : 'no user row — a development seed would CREATE the tenant and print its id; nothing exists to replace',
      businessId: null,
      documents: 0,
      products: 0,
    };
  }

  const business = user.businessId
    ? await Business.findById(user.businessId).select('name status').lean()
    : null;

  // The stranded state §27BB (F-50) records: the row can neither sign in (the exchange
  // resolves by `firebaseUid` only) nor register again (409 EMAIL_IN_USE), and no seeder
  // repairs it. Reported as a refusal the seeder would make, not as a note.
  if (identity.exists && user.firebaseUid && String(user.firebaseUid) !== String(identity.uid)) {
    return {
      verdict: 'STALE LINK',
      detail:
        `the row holds Firebase uid ${String(user.firebaseUid).slice(0, 10)}… but Firebase reports ` +
        `${String(identity.uid).slice(0, 10)}… for that address — a seed would REFUSE, and nothing ` +
        'repairs this implicitly',
      businessId: user.businessId ? String(user.businessId) : null,
      role: user.role,
      documents: 0,
      products: 0,
    };
  }

  if (!user.firebaseUid) {
    return {
      verdict: 'NOT LINKED',
      detail: 'the row carries no firebaseUid, so a seed would REFUSE rather than attach an identity',
      businessId: user.businessId ? String(user.businessId) : null,
      role: user.role,
      documents: 0,
      products: 0,
    };
  }

  if (!business) {
    return {
      verdict: 'NO BUSINESS',
      detail: `business ${String(user.businessId)} does not exist — a seed would REFUSE rather than repair it`,
      businessId: user.businessId ? String(user.businessId) : null,
      role: user.role,
      documents: 0,
      products: 0,
    };
  }

  // A production seed replaces, and a production cleanup empties, the WHOLE tenant. Both act
  // only for the account that owns it, so a member is reported as not ready rather than
  // discovered at the write (or, worse, the delete).
  if (production && user.role !== 'OWNER') {
    return {
      verdict: 'NOT OWNER',
      detail:
        `${user.role}, business ${String(user.businessId)} "${business.name}" — a production seed ` +
        'or cleanup acts only for the OWNER',
      businessId: String(user.businessId),
      businessName: business.name,
      role: user.role,
      status: user.status,
      documents: 0,
      products: 0,
    };
  }

  const { total, counts } = await countTenantDataRemoval([user.businessId]);
  return {
    verdict: 'READY',
    detail: `${user.role}, business ${String(user.businessId)} "${business.name}"`,
    businessId: String(user.businessId),
    businessName: business.name,
    role: user.role,
    status: user.status,
    documents: total,
    products: counts.products ?? 0,
    collections: counts,
  };
}

function identityLine(identity) {
  if (!identity.exists) {
    return 'no identity — registering the address in the app creates one (a seed needs DEMO_ACCOUNT_PASSWORD)';
  }
  const flags = [
    identity.emailVerified ? 'verified' : 'NOT verified',
    identity.disabled ? 'DISABLED' : 'enabled',
  ];
  const providers = identity.providers.length ? `, ${identity.providers.join('+')}` : '';
  return `uid ${String(identity.uid).slice(0, 10)}…, ${flags.join(', ')}${providers}`;
}

async function connect(dbName) {
  try {
    await mongoose.connect(env.mongodbUri, { dbName });
  } catch (err) {
    fail(
      `could not reach MongoDB for ${dbName}: ${err?.message ?? err}. NOT CHECKED (exit 2) — ` +
        'this is not a data problem.',
    );
  }
}

async function main() {
  const withProduction = process.argv.includes('--with-production');
  const accounts = parseAccounts(argValue('--accounts'));

  if (!env.mongodbUri) fail('MONGODB_URI is not set. NOT CHECKED (exit 2). Nothing was read.');
  if (env.mongodbDbName === DATABASE_NAMES.test) {
    fail(
      `this shell resolves the TEST database, which "npm test" owns. Point MONGODB_DB_NAME at ` +
        'development (or production) before asking about accounts. Nothing was read.',
    );
  }

  // ONE database, chosen by the shared rule: development by default, production instead when it
  // was asked for. The readiness and the exit code below see only what this returned, so the other
  // environment cannot fail the check.
  const databases = databasesToCheck({ withProduction, databaseNames: DATABASE_NAMES });

  if (!isFirebaseConfigured()) {
    fail('Firebase is not configured, so the identities cannot be checked. NOT CHECKED (exit 2).');
  }
  // The answer depends on WHICH identity authority is being read: pointed at another project, this
  // tool would report "no identity" for accounts that exist. That is a wrong answer, not a missing
  // one, so it stops here rather than printing verdicts it cannot stand behind.
  try {
    assertSeedFirebaseProject(firebaseConfig().projectId);
  } catch (err) {
    fail(`${err.message} NOT CHECKED (exit 2).`);
  }
  const projectId = firebaseConfig().projectId;
  const auth = getAuth(getFirebaseAdminApp());

  console.log(`[${COMMAND}] READ-ONLY — nothing is created, changed or deleted`);
  console.log(`[${COMMAND}] Firebase  : ${projectId} (the project this shell is configured for)`);
  console.log(
    `[${COMMAND}] databases : ${databases.join(', ')}` +
      `${withProduction ? '  (production — development is the default)' : '  (add --with-production to check production instead)'}`,
  );
  console.log(`[${COMMAND}] accounts  : ${accounts.length}`);

  const identities = new Map();
  for (const email of accounts) identities.set(email, await readIdentity(auth, email));

  const checked = [];
  for (const dbName of databases) {
    await connect(dbName);
    const rows = [];
    for (const email of accounts) {
      rows.push({
        email,
        ...(await checkInDatabase(email, identities.get(email), {
          production: dbName === DATABASE_NAMES.production,
        })),
      });
    }
    checked.push({ dbName, rows });
    await mongoose.disconnect();
  }

  // The verdict and the exit code are computed from `checked` alone — the one database the rule
  // selected. A row that does not exist elsewhere is not a finding about this environment.
  const { pairs, notReady, ready } = summariseReadiness(checked);

  for (const email of accounts) {
    const identity = identities.get(email);
    console.log('');
    console.log(`[${COMMAND}] ${email}`);
    console.log(`[${COMMAND}]   firebase            : ${identityLine(identity)}`);
    for (const { dbName, rows } of checked) {
      const row = rows.find((r) => r.email === email);
      // Every line keeps the command's prefix, and the continuation lines up under the
      // database name's column rather than a character off it.
      const head = `[${COMMAND}]   `;
      const label = `${head}${dbName.padEnd(19)} : `;
      if (row.verdict === 'READY') {
        console.log(`${label}READY — ${row.detail}`);
        console.log(
          `${head}${' '.repeat(19)}   ${row.products.toLocaleString()} products / ` +
            `${row.documents.toLocaleString()} documents a seed would RESET` +
            `${row.documents === 0 ? ' (the tenant is empty)' : ''}`,
        );
      } else {
        console.log(`${label}${row.verdict} — ${row.detail}`);
      }
    }
  }

  console.log('');
  console.log(
    `[${COMMAND}] ${ready} of ${pairs} account/database pair(s) are READY in ${databases.join(', ')}; ` +
      'every count comes from the same plan a cleanup executes.',
  );
  console.log(`[${COMMAND}] kept by both commands: ${OWNER_COMMENT}`);

  // The bridge to the next step: the exact seeding command for what was just measured.
  const preset = accounts.length === COMPARISON_ACCOUNTS.length &&
    COMPARISON_ACCOUNTS.every((a) => accounts.includes(a.email));
  console.log('');
  // The next step belongs to the database that was read. Printing a development seed line after a
  // production check is how an operator gets told to run the wrong command in the wrong place.
  if (databases.includes(DATABASE_NAMES.development)) {
    if (preset) {
      console.log(`[${COMMAND}] seed the three fixed accounts (development, 30 000 / 50 000 / 90 000 products):`);
      console.log(`[${COMMAND}]   SEED_CONFIRM=seed-three-accounts SEED_DB_CONFIRM=${DATABASE_NAMES.development} \\`);
      console.log(`[${COMMAND}]     npm run seed:three -- --database=${DATABASE_NAMES.development} --dry-run`);
    } else {
      console.log(`[${COMMAND}] seed them (each entry is a product count):`);
      console.log(`[${COMMAND}]   SEED_CONFIRM=seed-accounts SEED_DB_CONFIRM=${DATABASE_NAMES.development} \\`);
      console.log(`[${COMMAND}]     npm run seed:accounts -- --database=${DATABASE_NAMES.development} \\`);
      console.log(`[${COMMAND}]       --accounts="${accounts.map((email) => `${email}:30000`).join(',')}" --dry-run`);
    }
  }
  if (withProduction) {
    const rows = checked.find((c) => c.dbName === DATABASE_NAMES.production)?.rows ?? [];
    // No ids in the hint any more: the seeder resolves each address to its own tenant and checks
    // ownership before it writes. An id pasted here would be a second source that can go stale.
    const entries = rows.map((row) => {
      const wanted = COMPARISON_ACCOUNTS.find((a) => a.email === row.email)?.products;
      return `${row.email}:${wanted ?? 30000}`;
    });
    console.log(
      `[${COMMAND}] production (three phrases; each tenant is resolved from the account and checked):`,
    );
    console.log(`[${COMMAND}]   NODE_ENV=production MONGODB_DB_NAME=${DATABASE_NAMES.production} \\`);
    console.log(`[${COMMAND}]     SEED_CONFIRM=seed-accounts SEED_DB_CONFIRM=${DATABASE_NAMES.production} \\`);
    console.log(`[${COMMAND}]     SEED_PROD_CONFIRM=SEED-PRODUCTION-DATA \\`);
    console.log(`[${COMMAND}]     npm run seed:accounts -- --database=${DATABASE_NAMES.production} \\`);
    console.log(`[${COMMAND}]       --accounts="${entries.join(',')}"`);
  }

  if (notReady > 0) {
    console.log('');
    console.log(
      `[${COMMAND}] NOT READY (exit 1) — ${notReady} pair(s) above are missing or mismatched. Nothing was ` +
        'changed; the seeder refuses on STALE LINK / NOT LINKED / NO BUSINESS / NOT OWNER / AMBIGUOUS, ' +
        'and creates a tenant only in development, for MISSING.',
    );
    process.exit(1);
  }
  console.log('');
  console.log(`[${COMMAND}] READY (exit 0) — every named account exists and is linked where it was checked.`);
  process.exit(0);
}

main().catch(async (err) => {
  await mongoose.disconnect().catch(() => {});
  if (err instanceof SeedSafetyError) fail(err.message);
  fail(err && err.message ? err.message : String(err));
});
