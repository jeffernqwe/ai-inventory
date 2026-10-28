// §27CT — the role-boundary fixture's guards.
//
// The fixture's VALUE is that a person can sign in as ADMIN, MANAGER or STAFF and
// see what that role actually reaches. Its RISK is the opposite: a script that
// mints identities, writes users and deletes tenants is one wrong target away
// from damaging real data. Nothing in the three scripts is exercised over a live
// database here — that is what running them does — so this suite pins the
// properties that make running them safe, and the one piece of logic the verifier
// uses to decide whether a cell matched.
//
// Three kinds of assertion:
//
//  1. DERIVED, NOT TRANSCRIBED — the matrix's expected outcome comes from
//     `hasPermission`, so this suite can assert both that every role but OWNER is
//     refused somewhere and that the cell comparison agrees in BOTH directions.
//     A comparison that answered `true` for everything would pass a green matrix
//     and prove nothing; the controls below fail it.
//  2. SOURCE-ORDER — the dangerous operations (deleting a Firebase identity) have
//     a required order relative to the proof that no database row still points at
//     it. Order cannot be observed without running the code, and running it
//     against a real identity is exactly what must never happen in a test, so the
//     order is read out of the source.
//  3. NO EMAIL PATH — the whole point of the fixture is that no verification code
//     is sent. A future edit that reached for the mail layer would be visible here
//     (and would also break on an `.invalid` address).
//
// DB-FREE on purpose: this must stay green on a machine with no MongoDB.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ACCOUNTS,
  CLEANUP_CONFIRM_PHRASE,
  PASSWORD_ENV,
  ROLE_TEST_BUSINESS_NAME,
  SEED_CONFIRM_PHRASE,
  ensureRoleTestTenant,
} from '../scripts/role-test/lib.mjs';
import {
  AUTHENTICATED_ROUTES,
  MATRIX,
  admitted,
  cellAgrees,
  forbidden,
} from '../scripts/role-test/matrix.mjs';
import { PERMISSIONS, ROLES, ROLE_VALUES, hasPermission } from '../src/constants/roles.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, '..');

const source = (relative) => readFileSync(path.join(serverRoot, relative), 'utf8');
const packageJson = JSON.parse(source('package.json'));
const seeder = source('scripts/seed-role-accounts.mjs');
const cleanup = source('scripts/cleanup-role-accounts.mjs');
const verifier = source('scripts/verify-role-access.mjs');
const lib = source('scripts/role-test/lib.mjs');
const matrixSource = source('scripts/role-test/matrix.mjs');

describe('§27CT the fixture is one account per role, and cannot be a real address', () => {
  test('holds exactly one account per role, OWNER first', () => {
    assert.deepEqual(
      ACCOUNTS.map((account) => account.role),
      ROLE_VALUES,
    );
    assert.equal(new Set(ACCOUNTS.map((account) => account.email)).size, ROLE_VALUES.length);
  });

  test('every address is in the reserved .invalid domain, so no code can ever be delivered', () => {
    for (const account of ACCOUNTS) {
      assert.match(
        account.email,
        /@example\.invalid$/,
        `${account.email} is not a reserved-domain address`,
      );
    }
  });

  test('the fixture is named so it cannot be mistaken for real data', () => {
    assert.match(ROLE_TEST_BUSINESS_NAME, /do not use/i);
    assert.equal(SEED_CONFIRM_PHRASE, 'seed-roles');
    assert.equal(CLEANUP_CONFIRM_PHRASE, 'cleanup:roles');
    assert.equal(PASSWORD_ENV, 'ROLE_TEST_PASSWORD');
  });

  test('the three commands are registered, so the documented invocations exist', () => {
    assert.equal(packageJson.scripts['seed:roles'], 'node scripts/seed-role-accounts.mjs');
    assert.equal(packageJson.scripts['cleanup:roles'], 'node scripts/cleanup-role-accounts.mjs');
    assert.equal(packageJson.scripts['verify:roles'], 'node scripts/verify-role-access.mjs');
  });

  test('every printed next step names the database and the production environment', () => {
    // A hint is a command the operator will paste. In production it must carry
    // `NODE_ENV=production MONGODB_DB_NAME=…`, or the pasted line resolves the
    // development database and either seeds the wrong one or is refused by the very
    // guard it was meant to satisfy. `--database=` is asserted for the same reason.
    assert.match(seeder, /const envPrefix = production \? `NODE_ENV=production MONGODB_DB_NAME=\$\{target\.database\} ` : ''/);
    assert.ok(seeder.includes('to run for real: ${envPrefix}'), 'the real-run hint omits the environment prefix');
    assert.ok(
      seeder.includes('`npm run ${COMMAND} -- --database=${target.database}`'),
      'the real-run hint omits --database=',
    );
    assert.ok(
      seeder.includes('${envPrefix}SEED_CONFIRM=${SEED_CONFIRM_PHRASE} npm run verify:roles'),
      'the verify:roles hint omits the environment prefix',
    );
    const verifyHint = seeder.slice(seeder.indexOf('npm run verify:roles'), seeder.indexOf('npm run verify:roles') + 260);
    assert.match(verifyHint, /--database=\$\{target\.database\}/, 'the verify:roles hint omits --database=');
    assert.match(verifyHint, /--business=\$\{tenant\.businessId\}/, 'the verify:roles hint omits --business=');
  });
});

describe('§27CT no mail path, and no identity is created by a pattern', () => {
  test('none of the three scripts imports the mail layer or a mailer', () => {
    for (const [name, text] of [
      ['seed-role-accounts.mjs', seeder],
      ['cleanup-role-accounts.mjs', cleanup],
      ['verify-role-access.mjs', verifier],
      ['role-test/lib.mjs', lib],
    ]) {
      for (const forbiddenImport of ['services/mail', 'nodemailer', 'sendMail', 'resend', 'brevo']) {
        assert.ok(
          !text.toLowerCase().includes(forbiddenImport.toLowerCase()),
          `${name} reaches the mail path (${forbiddenImport}) — the fixture must never send mail`,
        );
      }
    }
  });

  test('identities are only ever created for the four literal fixture addresses', () => {
    // One call site, and its argument is the account's own email. The Admin SDK is
    // never asked to list, iterate or pattern-match identities — which is what
    // keeps the blast radius at four reserved addresses.
    assert.equal(
      (lib.match(/ensureVerifiedIdentity\(/g) ?? []).length,
      2, // the definition, and the one call site in ensureRoleTestTenant
      'ensureVerifiedIdentity must have exactly one call site',
    );
    assert.match(lib, /const identity = await ensureVerifiedIdentity\(account\.email, password\)/);
    assert.ok(!/listUsers/.test(lib), 'the fixture must not enumerate identities');
  });

  test('the seeder refuses to run without the target guard and without a password', () => {
    // The guard is still called with this fixture's own phrase and with `--database=`
    // passed through. Since §27FT it is the SHARED guard (`assertSeedTarget`), which
    // requires two phrases in development and three in production; the fixture keeps
    // its own phrase and gains the database phrase like every other plan.
    assert.match(seeder, /assertSeedTarget\(\{/);
    assert.match(seeder, /confirmPhrase: SEED_CONFIRM_PHRASE/);
    assert.match(seeder, /database: argValue\('--database'\)/);
    // The teardown command it prints carries the database phrase (and the production
    // phrase when it applies), so the printed line works in either environment.
    assert.match(seeder, /cleanup:roles -- --database=\$\{target\.database\}/);
    assert.match(seeder, /CLEANUP_DB_CONFIRM=\$\{target\.database\}/);
    assert.match(seeder, /readFixturePassword|ensureRoleTestTenant/);
    // The password VALUE is never interpolated into any output. Naming the
    // variable is fine ("from ROLE_TEST_PASSWORD (not printed)"); printing its
    // value is not.
    assert.ok(!/\$\{password\}/.test(seeder), 'the seeder must never print the password');
    assert.ok(
      !/\$\{process\.env\[PASSWORD_ENV\]\}/.test(seeder),
      'the seeder must never print the password from the environment',
    );
  });
});

describe('§27CT cleanup deletes the database first and an identity only after proving nothing points at it', () => {
  test('a destructive command reads CLEANUP_CONFIRM, not the seeder phrase', () => {
    // One fixture, two families: the seeder export must not confirm its teardown.
    assert.match(cleanup, /confirmPhrase: CLEANUP_CONFIRM_PHRASE/);
    assert.match(cleanup, /assertScopedCleanupTarget\(\{/);
    assert.match(cleanup, /database: argValue\('--database'\)/);
    assert.ok(!/confirmPhrase: SEED_CONFIRM_PHRASE/.test(cleanup));
  });

  test('the Firebase delete is gated behind --delete-firebase', () => {
    assert.match(cleanup, /const deleteFirebase = process\.argv\.includes\('--delete-firebase'\)/);
    assert.match(cleanup, /if \(!deleteFirebase\) \{/);
  });

  test('--dry-run counts through the removal plan and stops before removeTenant', () => {
    assert.match(cleanup, /const dryRun = process\.argv\.includes\('--dry-run'\)/);
    const dryAt = cleanup.indexOf('if (dryRun)');
    const removeAt = cleanup.indexOf('await removeTenant(');
    assert.ok(dryAt > -1, 'cleanup:roles has no dry-run branch');
    assert.ok(removeAt > dryAt, 'the real removal is reached before the dry-run branch');
    assert.match(cleanup, /countTenantRemoval\(\[businessId\]\)/);
  });

  test('no user may still reference an address when its identity is deleted', () => {
    const proof = cleanup.indexOf('stillLinked');
    const deletion = cleanup.indexOf('auth.deleteUser');
    assert.ok(proof > -1 && deletion > -1, 'both the proof and the deletion must exist');
    assert.ok(
      proof < deletion,
      'the F-50 proof (no MongoDB user still uses the address) must run BEFORE any identity is deleted',
    );
    assert.match(cleanup, /stillLinked !== 0/);
  });

  test('the tenant is resolved by its own fingerprints and verified afterwards', () => {
    assert.match(cleanup, /findRoleTestBusiness/);
    assert.ok(!/find\(\{\}\)/.test(cleanup), 'cleanup must never scan a whole collection');
    assert.match(cleanup, /countTenantLeftovers/);
    assert.match(cleanup, /countTenantRemoval/);
    assert.match(cleanup, /leftovers !== 0/);
    // The extras now live in the shared teardown plan; a second manual deletion/count
    // in this script would be exactly the drift the plan removes.
    assert.ok(!/clearRoleFixtureExtras/.test(cleanup));
    assert.ok(!/countRoleFixtureExtras/.test(cleanup));
  });
});

describe('§27CT the verifier derives its expectation from the role catalogue', () => {
  test('the expectation is hasPermission, not a second copy of the matrix', () => {
    assert.match(verifier, /hasPermission\(role, route\.permission\)/);
    assert.match(verifier, /cellAgrees\(expected, res\)/);
  });

  test('every checked route declares a permission that exists in the catalogue', () => {
    const catalogue = new Set(Object.values(PERMISSIONS));
    for (const route of MATRIX) {
      assert.ok(catalogue.has(route.permission), `${route.path} declares unknown ${route.permission}`);
    }
    assert.ok(MATRIX.length >= 18, `expected at least 18 gated routes, found ${MATRIX.length}`);
    assert.ok(AUTHENTICATED_ROUTES.length > 0);
  });

  test('the matrix cannot spend AI quota — the chat route is deliberately absent', () => {
    for (const route of [...MATRIX, ...AUTHENTICATED_ROUTES]) {
      assert.notEqual(route.path, '/api/ai/chat');
    }
    assert.ok(
      MATRIX.some((route) => route.permission === PERMISSIONS.AI_USE && route.method === 'GET'),
      'ai.use must be exercised through its READ route',
    );
  });

  test('MANAGER and STAFF are refused route-level; OWNER and ADMIN are not, and that is the recorded shape', () => {
    // OWNER holds every permission, so no route can refuse it. ADMIN holds every
    // permission that has an ENDPOINT: the two it lacks (business.manage,
    // roles.manage) are declared CATALOGUE_ONLY by Phase 22, so no shipped route can
    // distinguish ADMIN from OWNER. That is Phase 24's recorded finding, not a hole
    // this fixture may paper over — which is exactly why the verifier ALSO checks
    // the user-management rules, where ADMIN is genuinely restricted.
    for (const role of [ROLES.MANAGER, ROLES.STAFF]) {
      const denied = MATRIX.filter((route) => !hasPermission(role, route.permission));
      assert.ok(denied.length > 0, `${role} is refused nowhere — the matrix proves nothing about it`);
    }
    for (const role of [ROLES.OWNER, ROLES.ADMIN]) {
      assert.equal(
        MATRIX.filter((route) => !hasPermission(role, route.permission)).length,
        0,
        `${role} must be admitted by every shipped route`,
      );
    }
    // ADMIN's real restriction lives inside the users API, and the verifier is
    // required to check it — otherwise "ADMIN is unrestricted" would be the whole
    // finding for that role.
    assert.match(verifier, /ADMIN cannot create ADMIN/);
    assert.match(verifier, /ADMIN cannot modify another ADMIN/);
    assert.match(verifier, /the OWNER cannot be modified/);
    const staffDenied = MATRIX.filter((route) => !hasPermission(ROLES.STAFF, route.permission)).map(
      (route) => route.permission,
    );
    for (const permission of [
      PERMISSIONS.USERS_MANAGE,
      PERMISSIONS.AUDIT_VIEW,
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.PRODUCTS_MANAGE,
    ]) {
      assert.ok(staffDenied.includes(permission), `STAFF must be refused ${permission}`);
    }
  });
});

describe('§27CT the cell comparison agrees in both directions, and only there', () => {
  const allow = (extra = {}) => ({ status: 200, json: {}, ...extra });
  const deny = { status: 403, json: { code: 'FORBIDDEN' } };

  test('★ a correctly admitted cell passes and a correctly refused cell passes', () => {
    assert.equal(cellAgrees(true, allow()), true);
    assert.equal(cellAgrees(false, deny), true);
  });

  test('★ the two directions of a real defect are both caught', () => {
    // A refused request where the matrix said allowed (a role lost access).
    assert.equal(cellAgrees(true, deny), false);
    // An admitted request where the matrix said refused (a guard is missing).
    assert.equal(cellAgrees(false, allow()), false);
    assert.equal(admitted(deny), false);
    assert.equal(forbidden(allow()), false);
  });

  test('an unauthenticated 401 is a failure for both kinds of cell', () => {
    // 401 is never "the gate admitted" and is never "the gate refused FORBIDDEN";
    // it means the session the row was checked with is not usable, which would
    // otherwise be reported as a passing deny row.
    const unauth = { status: 401, json: { code: 'AUTH_REQUIRED' } };
    assert.equal(cellAgrees(true, unauth), false);
    assert.equal(cellAgrees(false, unauth), false);
  });

  test('a code-less 404 is a mistyped route, not an admission', () => {
    assert.equal(cellAgrees(true, { status: 404, json: null }), false);
    assert.equal(cellAgrees(true, { status: 404, json: {} }), false);
    // …while an ApiError 404 (a real route reaching its service) does prove admission.
    assert.equal(cellAgrees(true, { status: 404, json: { code: 'NOT_FOUND' } }), true);
  });

  test('a 403 with a business-rule code is not the permission refusal', () => {
    // ADMIN_RESTRICTED / CANNOT_MODIFY_SELF / OWNER_IMMUTABLE are refusals that
    // happen AFTER the gate admitted. A deny cell asserting one of them would be
    // asserting the wrong mechanism.
    assert.equal(cellAgrees(false, { status: 403, json: { code: 'ADMIN_RESTRICTED' } }), false);
    assert.equal(cellAgrees(false, { status: 403, json: { code: 'CANNOT_MODIFY_SELF' } }), false);
  });

  test('the comparison is not a constant', () => {
    // The control that a `() => true` implementation cannot pass: the same
    // response must be right for one expectation and wrong for the other.
    assert.notEqual(cellAgrees(true, deny), cellAgrees(false, deny));
    assert.notEqual(cellAgrees(true, allow()), cellAgrees(false, allow()));
  });
});

describe('§27CT the fixture is composable, not hard-wired', () => {
  test('the tenant is identified by BOTH its name and its owner address', () => {
    assert.match(lib, /name: ROLE_TEST_BUSINESS_NAME/);
    assert.match(lib, /email: ACCOUNTS\[0\]\.email/);
    assert.match(lib, /fingerprints disagree/);
  });

  test('an account that belongs to another business is refused, never moved', () => {
    assert.match(lib, /Refusing to move an account between tenants/);
    // And the identity is never re-pointed when the address already carries a
    // different Firebase uid — the F-50 state.
    assert.match(lib, /Refusing to re-point it/);
  });

  test('the fixture verifies its own shape after writing it', () => {
    assert.match(lib, /the role fixture is not in the shape it must have/);
    assert.match(lib, /expected exactly 1/);
  });

  test('the source of truth for the matrix lives in one module the verifier imports', () => {
    assert.match(verifier, /from '\.\/role-test\/matrix\.mjs'/);
    assert.match(matrixSource, /expectation/i);
    // The verifier must not build its own table.
    assert.ok(
      !/permission: PERMISSIONS\./.test(verifier),
      'the verifier must not transcribe the matrix itself',
    );
  });
});

// A compile-time reachability check: the exported helper the seeder calls must
// still exist under the name the scripts import, so a rename cannot pass because
// the scripts import at runtime and this suite never runs them.
test('§27CT ensureRoleTestTenant is exported for the seeder', () => {
  assert.equal(typeof ensureRoleTestTenant, 'function');
});
