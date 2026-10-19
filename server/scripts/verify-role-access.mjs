// `npm run verify:roles -- --business=<id>`
//
// Prove, over the REAL shipped routes, that each of the fixture's four accounts
// is allowed exactly what its role grants and refused exactly what it does not.
//
// THE EXPECTATION IS DERIVED, NEVER TRANSCRIBED. Every cell is compared against
// the shipped `hasPermission(role, permission)` — the same call the authorization
// middleware makes — so a grant that changes moves the expectation with it. There
// is no second copy of the role matrix here to drift out of date.
//
// TWO WAYS IN, AND THE DIFFERENCE MATTERS:
//   * default — a session minted the way login mints one (a signed token plus its
//     server-side session row). This proves the server-side boundary for these
//     four USERS, and it works with no password and no provider.
//   * `--signin` — a real Firebase email/password sign-in, then the real
//     `POST /api/auth/firebase/exchange`. This additionally proves that each
//     account can actually sign in from the phone path: the identity exists, it
//     is marked verified, the password is the one in `ROLE_TEST_PASSWORD`, and
//     the exchange resolves it to the right MongoDB user and role. It needs a
//     Firebase WEB api key (`FIREBASE_WEB_API_KEY`, or `EXPO_PUBLIC_FIREBASE_API_KEY`)
//     and the same password the seeder used; both stay in the environment and are
//     never printed.
//
// NO DATA IS WRITTEN and no AI quota is spent: the matrix uses a READ route for
// `ai.use` and an ABSENT id for by-id routes, and refused cells never reach a
// controller. The only rows created are four sessions, removed again before the
// script exits.
//
// Usage:
//   SEED_CONFIRM=seed-roles npm run verify:roles -- --business=<id>
//   ROLE_TEST_PASSWORD='…' FIREBASE_WEB_API_KEY='…' SEED_CONFIRM=seed-roles \
//     npm run verify:roles -- --business=<id> --signin
//
// Exit code 0 = every cell matched. 1 = a cell disagreed, or the fixture is not
// in the shape it must have.

import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';

import env from '../src/config/env.ts';
import { ROLE_VALUES, hasPermission } from '../src/constants/roles.ts';
import { decodeAccessToken, signAccessToken } from '../src/config/jwt.ts';
import { createSessionForToken, newSessionId } from '../src/services/session.service.ts';
import { SeedSafetyError, assertSafeTarget } from './perf/lib.mjs';
import { AUTHENTICATED_ROUTES, MATRIX, admitted, cellAgrees } from './role-test/matrix.mjs';
import {
  PASSWORD_ENV,
  ROLE_TEST_BUSINESS_NAME,
  SEED_CONFIRM_PHRASE,
  findRoleTestBusiness,
} from './role-test/lib.mjs';
import Session from '../src/models/session.model.ts';
import User from '../src/models/user.model.ts';

const COMMAND = 'verify:roles';
const DEVICE_LABEL = 'role-verify';

function argValue(flag) {
  const prefix = `${flag}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function fail(message) {
  console.error(`[${COMMAND}] ${message}`);
  process.exit(1);
}

async function api(base, method, path, { token, body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* an empty body is a JSON null here, not a crash */
  }
  return { status: res.status, json };
}

/**
 * A real Firebase email/password sign-in, then the real exchange.
 *
 * The Web API key is public by design (it ships inside every client build); what
 * it cannot do is read a password. It is read from the environment only.
 */
async function signInAndExchange(base, email, password, webApiKey) {
  const signIn = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(webApiKey)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const signed = await signIn.json().catch(() => ({}));
  if (!signIn.ok || !signed?.idToken) {
    const reason = signed?.error?.message ?? `HTTP ${signIn.status}`;
    throw new SeedSafetyError(
      `Firebase sign-in failed for ${email}: ${reason}. Check that ${PASSWORD_ENV} is the password ` +
        'the seeder set (re-run `seed:roles` to set it again).',
    );
  }

  const exchanged = await api(base, 'POST', '/api/auth/firebase/exchange', {
    body: { idToken: signed.idToken, deviceLabel: DEVICE_LABEL },
  });
  if (exchanged.status !== 200 || !exchanged.json?.token) {
    throw new SeedSafetyError(
      `the exchange refused ${email}: HTTP ${exchanged.status} ${JSON.stringify(exchanged.json)}`,
    );
  }
  return exchanged.json.token;
}

/** A session minted the way login mints one, so the token passes `requireAuth`. */
async function mintedToken(user) {
  const jti = newSessionId();
  const token = signAccessToken(user._id, jti);
  await createSessionForToken({
    userId: user._id,
    businessId: user.businessId,
    token,
    deviceLabel: DEVICE_LABEL,
  });
  return token;
}

/**
 * The app's OWN user-management boundary, exercised through the endpoint the
 * Users screen calls.
 *
 * This is the half of role behaviour that is written in `users.service`, not in
 * the route's permission gate: an ADMIN holds `users.manage` and still may not
 * create another ADMIN, may not change its own role, and may not touch an
 * existing ADMIN. A matrix that only asks "is the gate open?" would call all of
 * those allowed.
 *
 * Every probe account is created with a throwaway random password (never used to
 * sign in) and deleted again before the script exits, so the fixture keeps exactly
 * one account per role. A prefix identifies them, and any probe left behind by an
 * interrupted earlier run is cleared first rather than becoming a mysterious
 * second STAFF.
 */
async function checkUserManagementBoundary(base, tokens, businessId, byRole) {
  const PREFIX = 'verify-roles-probe-';
  const password = `${randomBytes(18).toString('base64url')}Aa1!`;
  const stamp = Date.now().toString(36);
  const email = (label) => `${PREFIX}${stamp}-${label}@example.invalid`;

  await User.deleteMany({ businessId, email: { $regex: `^${PREFIX}` } });

  const created = [];
  const results = [];
  const check = (label, res, expectedStatus, expectedCode) => {
    const ok = res.status === expectedStatus && (expectedCode ? res.json?.code === expectedCode : true);
    results.push({ label, ok, status: res.status, code: res.json?.code ?? null });
    return ok;
  };
  const create = async (actor, role, label) => {
    const res = await api(base, 'POST', '/api/users', {
      token: tokens[actor],
      body: { name: `Verify probe ${label}`, email: email(label), password, role },
    });
    if (res.status === 201 && res.json?.id) created.push(res.json.id);
    return res;
  };

  try {
    check('OWNER creates STAFF', await create('OWNER', 'STAFF', 'staff-by-owner'), 201);
    check('OWNER creates MANAGER', await create('OWNER', 'MANAGER', 'manager-by-owner'), 201);
    check('OWNER creates ADMIN', await create('OWNER', 'ADMIN', 'admin-by-owner'), 201);
    check('OWNER cannot create OWNER', await create('OWNER', 'OWNER', 'owner-by-owner'), 400, 'VALIDATION_ERROR');

    check('ADMIN creates STAFF', await create('ADMIN', 'STAFF', 'staff-by-admin'), 201);
    check('ADMIN creates MANAGER', await create('ADMIN', 'MANAGER', 'manager-by-admin'), 201);
    check('ADMIN cannot create ADMIN', await create('ADMIN', 'ADMIN', 'admin-by-admin'), 403, 'ADMIN_RESTRICTED');

    check('MANAGER cannot create users', await create('MANAGER', 'STAFF', 'staff-by-manager'), 403, 'FORBIDDEN');
    check('STAFF cannot create users', await create('STAFF', 'STAFF', 'staff-by-staff'), 403, 'FORBIDDEN');

    const self = await api(base, 'PATCH', `/api/users/${byRole.ADMIN._id}`, {
      token: tokens.ADMIN,
      body: { role: 'STAFF' },
    });
    check('ADMIN cannot change its own role', self, 403, 'CANNOT_MODIFY_SELF');

    const probeAdmin = created[2];
    const adminOnAdmin = await api(base, 'PATCH', `/api/users/${probeAdmin}`, {
      token: tokens.ADMIN,
      body: { role: 'STAFF' },
    });
    check('ADMIN cannot modify another ADMIN', adminOnAdmin, 403, 'ADMIN_RESTRICTED');

    const ownerImmutable = await api(base, 'PATCH', `/api/users/${byRole.OWNER._id}`, {
      token: tokens.ADMIN,
      body: { role: 'STAFF' },
    });
    check('the OWNER cannot be modified', ownerImmutable, 403, 'OWNER_IMMUTABLE');

    console.log('');
    console.log(`[${COMMAND}] user-management boundary (the app's own POST/PATCH /api/users)`);
    for (const result of results) {
      console.log(
        `[${COMMAND}]   ${result.ok ? 'ok  ' : 'FAIL'} ${result.label.padEnd(34)} ` +
          `HTTP ${result.status} ${result.code ?? ''}`,
      );
    }

    return results;
  } finally {
    // Only the rows this check created: by id, inside the fixture tenant.
    if (created.length) await User.deleteMany({ businessId, _id: { $in: created } });
    await User.deleteMany({ businessId, email: { $regex: `^${PREFIX}` } });
  }
}

async function main() {
  const businessArg = argValue('--business');
  const base = argValue('--base') ?? 'http://localhost:4000';
  const signin = process.argv.includes('--signin');

  // The guard runs before the connection. This script writes almost nothing, but
  // it does mint sessions for real users, and a verification that can point at
  // production is a verification nobody should be able to run by accident.
  assertSafeTarget(env, COMMAND, { confirmPhrase: SEED_CONFIRM_PHRASE });

  let webApiKey = null;
  let password = null;
  if (signin) {
    webApiKey = process.env.FIREBASE_WEB_API_KEY ?? process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
    password = process.env[PASSWORD_ENV];
    if (!webApiKey) {
      fail(
        'set FIREBASE_WEB_API_KEY (or EXPO_PUBLIC_FIREBASE_API_KEY) for --signin. It is the public ' +
          'Firebase web key, never printed. Without it, run without --signin.',
      );
    }
    if (!password) {
      fail(`set ${PASSWORD_ENV} for --signin (the password the seeder used). Nothing was checked.`);
    }
  }

  await mongoose.connect(env.mongodbUri, { dbName: env.mongodbDbName });

  const businessId = await findRoleTestBusiness(businessArg ? { businessIds: [businessArg] } : {});
  if (!businessId) {
    fail(
      'no role fixture exists. Create it first: ' +
        `ROLE_TEST_PASSWORD='…' SEED_CONFIRM=${SEED_CONFIRM_PHRASE} npm run seed:roles`,
    );
  }
  if (businessArg && String(businessArg) !== String(businessId)) {
    fail(`--business=${businessArg} does not name the role fixture (${businessId}). Nothing was checked.`);
  }

  const users = await User.find({ businessId }).select('_id email role status firebaseUid businessId').lean();
  const byRole = {};
  for (const role of ROLE_VALUES) {
    const matching = users.filter((user) => user.role === role);
    if (matching.length !== 1) {
      fail(`the fixture holds ${matching.length} ${role} account(s); expected exactly 1.`);
    }
    if (matching[0].status !== 'ACTIVE') fail(`${matching[0].email} is ${matching[0].status}.`);
    byRole[role] = matching[0];
  }

  console.log(`[${COMMAND}] database : ${env.mongodbDbName}`);
  console.log(`[${COMMAND}] tenant   : ${businessId} ("${ROLE_TEST_BUSINESS_NAME}")`);
  console.log(`[${COMMAND}] server   : ${base}`);
  console.log(`[${COMMAND}] sign-in  : ${signin ? 'REAL Firebase sign-in + exchange' : 'minted sessions (no password used)'}`);
  console.log('');

  const tokens = {};
  try {
    for (const role of ROLE_VALUES) {
      const user = byRole[role];
      tokens[role] = signin ? await signInAndExchange(base, user.email, password, webApiKey) : await mintedToken(user);
      const me = await api(base, 'GET', '/api/auth/me', { token: tokens[role] });
      if (me.status !== 200 || me.json?.user?.role !== role) {
        fail(
          `/api/auth/me answered HTTP ${me.status} role ${JSON.stringify(me.json?.user?.role)} for ` +
            `${user.email}; expected 200 ${role}. The fixture and the server disagree — stop here.`,
        );
      }
      console.log(`[${COMMAND}] ${role.padEnd(7)} ${user.email.padEnd(30)} signed in (HTTP 200, role ${role})`);
    }

    console.log('');
    console.log(`[${COMMAND}] real routes — "allow" = admitted by the gate, "deny" = 403 FORBIDDEN`);
    console.log('');

    // The widest label is the by-id receive route, so the column is measured
    // rather than guessed — a guessed width sheared the last cell into the path.
    const routeWidth =
      Math.max(...MATRIX.map((r) => `${r.method} ${r.path} → ${r.permission}`.length), 'route'.length) + 2;
    const header = ['route'.padEnd(routeWidth), ...ROLE_VALUES.map((r) => r.padEnd(9))].join('');
    console.log(`[${COMMAND}] ${header}`);
    console.log(`[${COMMAND}] ${'-'.repeat(header.length)}`);

    let cells = 0;
    const mismatches = [];

    for (const route of MATRIX) {
      const line = [`${route.method} ${route.path} → ${route.permission}`.padEnd(routeWidth)];
      for (const role of ROLE_VALUES) {
        const expected = hasPermission(role, route.permission);
        const res = await api(base, route.method, route.path, { token: tokens[role], body: route.body });
        // Two separate questions: what the gate DID, and whether that agrees with
        // the role matrix. Collapsing them would print "allow" for a correctly
        // refused cell.
        const actual = admitted(res);
        const agreed = cellAgrees(expected, res);
        cells += 1;
        if (!agreed) {
          mismatches.push({
            role,
            route,
            expected,
            status: res.status,
            code: res.json?.code,
          });
        }
        line.push(`${(agreed ? (actual ? 'allow' : 'deny') : 'MISMATCH')}`.padEnd(9));
      }
      console.log(`[${COMMAND}] ${line.join('')}`);
    }

    // These must not discriminate by role at all: every account can read them.
    console.log('');
    console.log(`[${COMMAND}] authenticated-only routes (no role gate)`);
    for (const route of AUTHENTICATED_ROUTES) {
      for (const role of ROLE_VALUES) {
        const res = await api(base, route.method, route.path, { token: tokens[role] });
        cells += 1;
        if (res.status !== 200) {
          mismatches.push({ role, route, expected: true, status: res.status, code: res.json?.code });
        }
      }
      console.log(`[${COMMAND}]   ${`${route.method} ${route.path}`.padEnd(34)} 200 for all four roles`);
    }

    const boundary = await checkUserManagementBoundary(base, tokens, businessId, byRole);
    for (const result of boundary) {
      if (!result.ok) {
        mismatches.push({
          role: result.label,
          route: { method: 'POST/PATCH', path: '/api/users' },
          expected: true,
          status: result.status,
          code: result.code,
        });
      }
      cells += 1;
    }

    console.log('');
    if (mismatches.length) {
      console.log(`[${COMMAND}] FAIL — ${mismatches.length} of ${cells} cell(s) disagree with ROLE_PERMISSIONS:`);
      for (const m of mismatches) {
        console.log(
          `[${COMMAND}]   ${m.role} ${m.route.method} ${m.route.path} ` +
            `expected ${m.expected ? 'allow' : 'deny'}, got HTTP ${m.status} ${m.code ?? '(no code)'}`,
        );
      }
      process.exitCode = 1;
    } else {
      console.log(`[${COMMAND}] OK — ${cells} of ${cells} cells matched ROLE_PERMISSIONS exactly.`);
      console.log(`[${COMMAND}]   ${MATRIX.length} gated route(s) × 4 roles, plus ${AUTHENTICATED_ROUTES.length} ungated route(s) × 4 roles.`);
      console.log(`[${COMMAND}] note: the app's own buttons are gated by the mobile mirror of this matrix;`);
      console.log(`[${COMMAND}]       what a screen HIDES is verified by looking at the phone, not here.`);
    }
  } finally {
    // The verification's own sessions, and only those: matched by the four users
    // and this script's device label, so no session a person created is touched.
    const userIds = Object.values(byRole).map((user) => user._id);
    // An exchanged token names its own session (jti); a minted one does too.
    const jtis = Object.values(tokens)
      .filter(Boolean)
      .map((token) => decodeAccessToken(token)?.jti)
      .filter(Boolean);
    const removed = await Session.deleteMany({
      userId: { $in: userIds },
      $or: [{ deviceLabel: DEVICE_LABEL }, { jti: { $in: jtis } }],
    });
    console.log(`[${COMMAND}] cleaned  : removed ${removed.deletedCount ?? 0} verification session(s)`);
    await mongoose.disconnect();
  }
}

main().catch(async (err) => {
  await mongoose.disconnect().catch(() => {});
  if (err instanceof SeedSafetyError) fail(err.message);
  fail(err && err.message ? err.message : String(err));
});
