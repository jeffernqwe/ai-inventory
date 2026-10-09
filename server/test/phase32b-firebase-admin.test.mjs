// Phase 32B — the server-side Firebase Admin foundation.
//
// This is the first phase of the Firebase work, and it deliberately ships NO
// route: nothing in the running server verifies a Firebase ID token yet. What it
// adds is the layer that will, and this suite pins the properties that make that
// layer safe to build on.
//
//   * FIREBASE IS OPTIONAL AND ADDITIVE. With no Firebase configuration the
//     server behaves exactly as before — no production config problem, no route,
//     no behaviour change. This is the property that lets the phase ship without
//     a Firebase project existing, and it is asserted directly rather than left
//     implicit.
//   * NOTHING SECRET CAN ESCAPE. The service-account private key must not appear
//     in a config problem, in a thrown error, or in any own property of one. The
//     cases below plant a recognisable key and search for it everywhere a value
//     could surface.
//   * A TOKEN CANNOT SURVIVE INTO AN ERROR. `safeTokenReason` admits only a short
//     plainly-shaped class, and a JWT is dot-separated base64url — so the `.` a
//     token would need to be smuggled through is not in the alphabet. Asserted
//     with real JWT-shaped input, not a placeholder.
//   * THE SPARSE INDEX IS THE WHOLE MIGRATION. A unique index that is not sparse
//     makes the SECOND legacy user impossible to create, breaking the existing
//     registration path. That is proven against real MongoDB — both what the
//     database actually holds and what it actually does — because a declaration
//     check cannot tell you either.
//
// The verifier is exercised through the real seam
// (setFirebaseIdTokenVerifier), so the narrowing in `toVerifiedIdentity` runs on
// every case here. No case reaches the network, and no Firebase project exists.
//
// Registered MIXED in run-tests.mjs: config, error, verifier and validation cases
// run without a database; the model and index cases need MongoDB.

import 'dotenv/config';

import { it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { ensureDb, disconnectDb } from './helpers.mjs';
import { createTracker, uniqueEmail, uniqueName } from './support.mjs';
import { dbSuite, unitSuite } from './testEnv.mjs';

import Business from '../src/models/business.model.ts';
import User from '../src/models/user.model.ts';
import {
  firebaseConfig,
  serviceAccountProblems,
  isFirebaseConfigured,
  FIREBASE_ACCOUNT_ENV,
  FIREBASE_SERVICE_ACCOUNT_JSON,
} from '../src/config/firebase.ts';
import { validateProductionConfig } from '../src/config/validateConfig.ts';
import {
  FirebaseNotConfigured,
  FirebaseTokenError,
  safeTokenReason,
  isFirebaseError,
  FIREBASE_NOT_CONFIGURED,
  FIREBASE_TOKEN_INVALID,
} from '../src/services/firebase/firebaseErrors.ts';
import {
  verifyFirebaseIdToken,
  resetFirebaseIdTokenVerifier,
  hasCustomFirebaseIdTokenVerifier,
} from '../src/services/firebase/tokenVerifier.ts';
import {
  getFirebaseAdminApp,
  isFirebaseAdminAppInitialized,
  resetFirebaseAdminApp,
  FIREBASE_APP_NAME,
} from '../src/services/firebase/adminApp.ts';
import {
  isFirebaseConfigured as serviceIsFirebaseConfigured,
  firebaseProjectId,
} from '../src/services/firebase/index.ts';
import {
  initializeApp,
  getApps,
  deleteApp,
} from 'firebase-admin/app';
import {
  registerFakeFirebaseVerifier,
  deregisterFakeFirebaseVerifier,
  setFakeFirebaseToken,
  setFakeFirebaseFailure,
  verifiedTokens,
  clearVerifiedTokens,
  fakeServiceAccount,
  fakeServiceAccountJson,
  fakeServiceAccountJsonBase64,
} from './fakes/firebaseVerifier.mjs';

const ALL_FIREBASE_ENV = [FIREBASE_SERVICE_ACCOUNT_JSON, ...FIREBASE_ACCOUNT_ENV];

/** A key-shaped value distinctive enough to search for in any output. */
const SECRET_MARKER = 'phase32b_do_not_leak_this_private_key_material';

/**
 * Runs `fn` with exactly the named Firebase variables set, clearing the others
 * first. Restores the previous environment afterwards, whatever happens.
 *
 * Clears rather than merges so a case is never affected by a stray value left by
 * another — the "nothing configured" state is a real supported configuration
 * here, not merely the absence of one.
 */
async function withFirebaseEnv(vars, fn) {
  const saved = new Map(ALL_FIREBASE_ENV.map((key) => [key, process.env[key]]));
  try {
    for (const key of ALL_FIREBASE_ENV) delete process.env[key];
    for (const [key, value] of Object.entries(vars)) process.env[key] = value;
    return await fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

/** Every string reachable from a thrown error, for a leak search. */
function errorSurface(err) {
  const parts = [String(err?.message ?? ''), String(err?.name ?? ''), String(err?.code ?? '')];
  for (const key of Object.keys(err ?? {})) {
    parts.push(`${key}=${String(err[key])}`);
  }
  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// config/firebase.ts — environment parsing
// ---------------------------------------------------------------------------

unitSuite('Phase 32B — service account configuration', () => {
  it('reports NO problem when nothing Firebase-related is set', () => {
    // The additive property, at its root: an unconfigured Firebase is a
    // supported state, not a misconfiguration. If this ever fails, every
    // existing deployment stops booting.
    assert.deepEqual(serviceAccountProblems({}), []);
    assert.equal(isFirebaseConfigured({}), false);
  });

  it('resolves to source "none" and empty fields when unconfigured', () => {
    assert.deepEqual(firebaseConfig({}), {
      projectId: '',
      clientEmail: '',
      privateKey: '',
      source: 'none',
    });
  });

  it('accepts the three individual variables set together', () => {
    const values = {
      FIREBASE_PROJECT_ID: 'inventory-ai-test',
      FIREBASE_CLIENT_EMAIL: 'svc@example.test',
      FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
    };
    assert.deepEqual(serviceAccountProblems(values), []);
    assert.equal(isFirebaseConfigured(values), true);
    assert.equal(firebaseConfig(values).source, 'individual');
  });

  it('rejects a PARTIAL individual configuration, naming every missing variable', () => {
    // Half a service account is the dangerous case: it looks configured and fails
    // later, at the first exchange, far from the missing variable.
    const problems = serviceAccountProblems({ FIREBASE_PROJECT_ID: 'inventory-ai-test' });
    assert.deepEqual(problems.map((p) => p.variable).sort(), [
      'FIREBASE_CLIENT_EMAIL',
      'FIREBASE_PRIVATE_KEY',
    ]);
    assert.equal(isFirebaseConfigured({ FIREBASE_PROJECT_ID: 'x' }), false);
  });

  it('rejects an individual configuration where a variable is present but blank', () => {
    // Whitespace is not configuration. A dashboard that stores an empty string
    // must read as missing, not as set.
    const problems = serviceAccountProblems({
      FIREBASE_PROJECT_ID: 'inventory-ai-test',
      FIREBASE_CLIENT_EMAIL: 'svc@example.test',
      FIREBASE_PRIVATE_KEY: '   ',
    });
    assert.deepEqual(
      problems.map((p) => p.variable),
      ['FIREBASE_PRIVATE_KEY']
    );
  });

  it('accepts the whole service-account JSON verbatim', () => {
    const values = { [FIREBASE_SERVICE_ACCOUNT_JSON]: fakeServiceAccountJson() };
    assert.deepEqual(serviceAccountProblems(values), []);
    const config = firebaseConfig(values);
    assert.equal(config.source, 'service-account-json');
    assert.equal(config.projectId, 'inventory-ai-test');
  });

  it('accepts the same JSON base64-encoded', () => {
    // The single-line transport form. A JSON object begins with `{`, which is not
    // a base64 character, so the two spellings cannot be confused.
    const values = { [FIREBASE_SERVICE_ACCOUNT_JSON]: fakeServiceAccountJsonBase64() };
    assert.deepEqual(serviceAccountProblems(values), []);
    assert.equal(firebaseConfig(values).projectId, 'inventory-ai-test');
  });

  it('takes FIREBASE_SERVICE_ACCOUNT_JSON in preference to the individual variables', () => {
    // Documented precedence, so there is never a question of which value won.
    // The individual variables here are deliberately for a DIFFERENT project.
    const values = {
      [FIREBASE_SERVICE_ACCOUNT_JSON]: fakeServiceAccountJson({ projectId: 'from-json' }),
      FIREBASE_PROJECT_ID: 'from-individual-vars',
      FIREBASE_CLIENT_EMAIL: 'ignored@example.test',
      FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nignored\n-----END PRIVATE KEY-----',
    };
    assert.deepEqual(serviceAccountProblems(values), []);
    assert.equal(firebaseConfig(values).projectId, 'from-json');
    assert.equal(firebaseConfig(values).source, 'service-account-json');
  });

  it('reports an unparseable FIREBASE_SERVICE_ACCOUNT_JSON as a problem', () => {
    const problems = serviceAccountProblems({ [FIREBASE_SERVICE_ACCOUNT_JSON]: 'not-json-at-all' });
    assert.equal(problems.length, 1);
    assert.equal(problems[0].variable, FIREBASE_SERVICE_ACCOUNT_JSON);
    // Unparseable resolves to unconfigured rather than to a half-built config.
    assert.equal(isFirebaseConfigured({ [FIREBASE_SERVICE_ACCOUNT_JSON]: 'not-json' }), false);
  });

  it('reports which field of the JSON is missing', () => {
    const account = fakeServiceAccount();
    delete account.client_email;
    const problems = serviceAccountProblems({
      [FIREBASE_SERVICE_ACCOUNT_JSON]: JSON.stringify(account),
    });
    assert.equal(problems.length, 1);
    assert.match(problems[0].message, /client_email/);
  });

  it('converts a literal \\n sequence in FIREBASE_PRIVATE_KEY into real newlines', () => {
    // The one-line storage form. Without this conversion `cert()` rejects the
    // key, so every deployment storing it this way would fail.
    const config = firebaseConfig({
      FIREBASE_PROJECT_ID: 'inventory-ai-test',
      FIREBASE_CLIENT_EMAIL: 'svc@example.test',
      FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nMIIabc\\n-----END PRIVATE KEY-----',
    });
    assert.equal(
      config.privateKey,
      '-----BEGIN PRIVATE KEY-----\nMIIabc\n-----END PRIVATE KEY-----'
    );
    assert.ok(!config.privateKey.includes('\\n'), 'no literal backslash-n may survive');
  });

  it('leaves a key that already has real newlines untouched', () => {
    const pem = '-----BEGIN PRIVATE KEY-----\nMIIabc\n-----END PRIVATE KEY-----';
    const config = firebaseConfig({
      FIREBASE_PROJECT_ID: 'inventory-ai-test',
      FIREBASE_CLIENT_EMAIL: 'svc@example.test',
      FIREBASE_PRIVATE_KEY: pem,
    });
    assert.equal(config.privateKey, pem);
  });

  it('surfaces NO value when the JSON fails to parse', () => {
    // A parser's own message can quote the input it rejected, and that input is
    // the service-account credential. The message must name the variable only.
    const problems = serviceAccountProblems({
      [FIREBASE_SERVICE_ACCOUNT_JSON]: `{ broken ${SECRET_MARKER}`,
    });
    assert.ok(problems.length > 0);
    for (const problem of problems) {
      assert.ok(
        !problem.message.includes(SECRET_MARKER),
        `a config problem must never echo its input; got: ${problem.message}`
      );
    }
  });
});

// ---------------------------------------------------------------------------
// firebaseErrors.ts — the leak boundary
// ---------------------------------------------------------------------------

unitSuite('Phase 32B — Firebase error contract', () => {
  it('admits only short, plainly-shaped reason labels', () => {
    assert.equal(safeTokenReason('auth/id-token-expired'), 'auth/id-token-expired');
    assert.equal(safeTokenReason('auth/argument-error'), 'auth/argument-error');
  });

  it('rejects anything that could carry a token, as "unknown"', () => {
    // A real Firebase ID token. This is the property the error layer rests on,
    // asserted with the real shape rather than a stand-in.
    const jwt =
      'eyJhbGciOiJSUzI1NiIsImtpZCI6ImFiYyJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk'; // secret-guard:allow (deliberate fixture)
    assert.equal(safeTokenReason(jwt), 'unknown', 'a whole token can never survive');

    // The LENGTH bound is a second, independent barrier: strip the dots — the
    // only characters the allowlist rejects — and the token still cannot pass.
    assert.equal(safeTokenReason(jwt.replace(/\./g, '')), 'unknown', 'past the length bound');

    // A single base64url SEGMENT does satisfy the shape rule, and that is
    // asserted here as it actually behaves rather than as one might wish. It is
    // not a weakening of what this test is for: a lone segment carries no
    // signature, cannot be replayed as a credential, and `safeTokenReason` is
    // only ever handed an SDK error code such as `auth/id-token-expired`.
    const segment = jwt.split('.')[1];
    assert.equal(safeTokenReason(segment), segment);

    assert.equal(safeTokenReason('x'.repeat(65)), 'unknown', 'past the length bound');
    assert.equal(safeTokenReason('has spaces'), 'unknown');
    assert.equal(safeTokenReason(''), 'unknown');
    assert.equal(safeTokenReason(null), 'unknown');
    assert.equal(safeTokenReason(undefined), 'unknown');
    assert.equal(safeTokenReason(12345), 'unknown');
    assert.equal(safeTokenReason({ code: 'auth/id-token-expired' }), 'unknown');
  });

  it('namespaces its codes so they cannot be mistaken for auth or session codes', () => {
    assert.equal(FIREBASE_NOT_CONFIGURED, 'FIREBASE_NOT_CONFIGURED');
    assert.equal(FIREBASE_TOKEN_INVALID, 'FIREBASE_TOKEN_INVALID');
    // The mobile client clears a session on 401/403 carrying certain codes. A
    // Firebase code must never be one of them.
    for (const code of [FIREBASE_NOT_CONFIGURED, FIREBASE_TOKEN_INVALID]) {
      assert.ok(
        !['AUTH_REQUIRED', 'INVALID_TOKEN', 'SESSION_REVOKED', 'SESSION_INVALIDATED'].includes(code)
      );
    }
  });

  it('carries a code and NO HTTP status', () => {
    // Turning a domain failure into a status is the controller's job (Phase 32C).
    const notConfigured = new FirebaseNotConfigured();
    const tokenError = new FirebaseTokenError('auth/id-token-expired');
    for (const err of [notConfigured, tokenError]) {
      assert.equal(err.status, undefined);
      assert.equal(typeof err.code, 'string');
    }
    assert.equal(tokenError.reason, 'auth/id-token-expired');
  });

  it('recognises its own errors and nothing else', () => {
    assert.equal(isFirebaseError(new FirebaseNotConfigured()), true);
    assert.equal(isFirebaseError(new FirebaseTokenError('x')), true);
    assert.equal(isFirebaseError(new Error('nope')), false);
    assert.equal(isFirebaseError(null), false);
    assert.equal(isFirebaseError({ code: FIREBASE_TOKEN_INVALID }), false, 'shape is not identity');
  });

  it('never builds a token error whose reason carries the token', () => {
    const jwt = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxIn0.signature';
    const err = new FirebaseTokenError(safeTokenReason(jwt));
    assert.equal(err.reason, 'unknown');
    assert.ok(!errorSurface(err).includes(jwt));
  });
});

// ---------------------------------------------------------------------------
// tokenVerifier.ts — narrowing, through the real seam
// ---------------------------------------------------------------------------

unitSuite('Phase 32B — ID token verification and narrowing', () => {
  it('rejects an empty, blank or non-string token before reaching any verifier', async () => {
    registerFakeFirebaseVerifier();
    try {
      for (const bad of ['', '   ', null, undefined, 42, {}, []]) {
        await assert.rejects(
          () => verifyFirebaseIdToken(bad),
          (err) => err instanceof FirebaseTokenError && err.reason === 'missing-token',
          `expected ${JSON.stringify(bad)} to be rejected as missing-token`
        );
      }
      assert.deepEqual(verifiedTokens(), [], 'a missing token must not reach the verifier');
    } finally {
      deregisterFakeFirebaseVerifier();
    }
  });

  // Phase 32L widened this allowlist by exactly one field, `authTime`, because the
  // unlink operation must check the signed `auth_time`. The pin is updated rather
  // than relaxed: the assertion still names EVERY field the narrowing may return,
  // so a further claim could not be added without failing here.
  it('returns exactly the five allowlisted fields, and nothing else', async () => {
    registerFakeFirebaseVerifier();
    try {
      setFakeFirebaseToken({
        uid: 'firebase-uid-1',
        email: 'owner@example.test',
        email_verified: true,
        firebase: { sign_in_provider: 'password' },
        // Claims the caller must never see, including an authorization-shaped one.
        role: 'OWNER',
        businessId: 'attacker-supplied',
        admin: true,
      });
      const identity = await verifyFirebaseIdToken('fake-token');
      assert.deepEqual(identity, {
        uid: 'firebase-uid-1',
        email: 'owner@example.test',
        emailVerified: true,
        signInProvider: 'password',
        // Absent from this payload, and `null` rather than refused: a token that
        // cannot be dated is not a verification failure here — the freshness rule
        // is the one consumer that decides, and it fails closed.
        authTime: null,
      });
      assert.deepEqual(Object.keys(identity).sort(), [
        'authTime',
        'email',
        'emailVerified',
        'signInProvider',
        'uid',
      ]);
      // A role or businessId in the token must not survive the narrowing, so no
      // downstream caller can find one there and be tempted to trust it.
      assert.equal(identity.role, undefined);
      assert.equal(identity.businessId, undefined);
    } finally {
      deregisterFakeFirebaseVerifier();
    }
  });

  it('lowercases the email so it matches the users.email field', async () => {
    // users.email is stored with `lowercase: true`, so a Google-capitalized
    // address must not miss its MongoDB user.
    registerFakeFirebaseVerifier();
    try {
      setFakeFirebaseToken({ uid: 'u1', email: '  Owner@Example.TEST  ' });
      assert.equal((await verifyFirebaseIdToken('fake-token')).email, 'owner@example.test');
    } finally {
      deregisterFakeFirebaseVerifier();
    }
  });

  it('reads email_verified as false unless it is exactly boolean true', async () => {
    // The failure direction must be "not verified": this field decides whether an
    // account is treated as verified.
    registerFakeFirebaseVerifier();
    try {
      for (const [claim, expected] of [
        [true, true],
        [false, false],
        ['true', false],
        [1, false],
        [undefined, false],
        [null, false],
      ]) {
        setFakeFirebaseToken({ uid: 'u1', email_verified: claim });
        const identity = await verifyFirebaseIdToken('fake-token');
        assert.equal(
          identity.emailVerified,
          expected,
          `email_verified=${JSON.stringify(claim)} must read as ${expected}`
        );
      }
    } finally {
      deregisterFakeFirebaseVerifier();
    }
  });

  it('reports a null email when the token carries none', async () => {
    registerFakeFirebaseVerifier();
    try {
      setFakeFirebaseToken({ uid: 'u1' });
      assert.equal((await verifyFirebaseIdToken('fake-token')).email, null);
      setFakeFirebaseToken({ uid: 'u1', email: '   ' });
      assert.equal((await verifyFirebaseIdToken('fake-token')).email, null);
    } finally {
      deregisterFakeFirebaseVerifier();
    }
  });

  it('reads sign_in_provider from the nested firebase claim, or null', async () => {
    registerFakeFirebaseVerifier();
    try {
      setFakeFirebaseToken({ uid: 'u1', firebase: { sign_in_provider: 'google.com' } });
      assert.equal((await verifyFirebaseIdToken('t')).signInProvider, 'google.com');

      setFakeFirebaseToken({ uid: 'u1' });
      assert.equal((await verifyFirebaseIdToken('t')).signInProvider, null);

      setFakeFirebaseToken({ uid: 'u1', firebase: 'not-an-object' });
      assert.equal((await verifyFirebaseIdToken('t')).signInProvider, null);
    } finally {
      deregisterFakeFirebaseVerifier();
    }
  });

  it('rejects a verified token that carries no usable uid', async () => {
    // uid is the join key to the MongoDB user. An identity without one could only
    // ever resolve to nothing, and failing HERE keeps that from looking like a
    // lookup miss downstream.
    registerFakeFirebaseVerifier();
    try {
      for (const token of [{}, { uid: '' }, { uid: '   ' }, { uid: 123 }, { uid: null }]) {
        setFakeFirebaseToken(token);
        await assert.rejects(
          () => verifyFirebaseIdToken('fake-token'),
          (err) => err instanceof FirebaseTokenError && err.reason === 'missing-uid'
        );
      }
    } finally {
      deregisterFakeFirebaseVerifier();
    }
  });

  it('propagates a verifier rejection as FirebaseTokenError', async () => {
    registerFakeFirebaseVerifier();
    try {
      setFakeFirebaseFailure('auth/id-token-expired');
      await assert.rejects(
        () => verifyFirebaseIdToken('fake-token'),
        (err) => err instanceof FirebaseTokenError && err.reason === 'auth/id-token-expired'
      );
    } finally {
      deregisterFakeFirebaseVerifier();
    }
  });

  it('hands the verifier the token it was given, unmodified', async () => {
    registerFakeFirebaseVerifier();
    try {
      const token = 'the-exact-token-string';
      setFakeFirebaseToken({ uid: 'u1' });
      await verifyFirebaseIdToken(token);
      assert.deepEqual(verifiedTokens(), [token]);
    } finally {
      deregisterFakeFirebaseVerifier();
    }
  });

  it('restores the real implementation when the seam is cleared', () => {
    registerFakeFirebaseVerifier();
    assert.equal(hasCustomFirebaseIdTokenVerifier(), true);
    deregisterFakeFirebaseVerifier();
    assert.equal(hasCustomFirebaseIdTokenVerifier(), false);
  });

  it('reports unconfigured, not a token error, when nothing is configured', async () => {
    // With no seam and no Firebase environment, the real path must fail as an
    // OPERATOR problem. A token error here would tell a caller its token was bad
    // when the truth is that the server cannot check any token at all.
    //
    // The app is reset first, and that is load-bearing rather than tidy: an app
    // left initialized by an earlier case would send this call to Google's public
    // key endpoint, which is a real network request this suite must never make.
    clearVerifiedTokens();
    resetFirebaseIdTokenVerifier();
    await resetFirebaseAdminApp();

    await withFirebaseEnv({}, async () => {
      // Phase AUTH-01: the token must be JWT-SHAPED for this case to reach the
      // config check at all. The real path now rejects a non-JWT value as
      // `malformed-token` (terminal) BEFORE asking whether Firebase is configured,
      // so a shapeless string would exercise that guard instead of this one.
      await assert.rejects(
        () => verifyFirebaseIdToken('eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1MSJ9.c2ln'),
        (err) => err instanceof FirebaseNotConfigured && err.code === FIREBASE_NOT_CONFIGURED
      );
    });
  });
});

// ---------------------------------------------------------------------------
// adminApp.ts — the initialization wrapper
// ---------------------------------------------------------------------------

unitSuite('Phase 32B — Firebase Admin application lifecycle', () => {
  // A built app is memoized in the module AND registered in firebase-admin's own
  // registry, so without this every case after the first build would observe the
  // previous case's app — the memoization case would silently supply the app the
  // next case expects to have to build.
  beforeEach(async () => {
    await resetFirebaseAdminApp();
  });

  after(async () => {
    await resetFirebaseAdminApp();
  });

  it('is lazy: asking whether it is initialized does not initialize it', () => {
    assert.equal(isFirebaseAdminAppInitialized(), false);
  });

  it('throws FirebaseNotConfigured, naming variables, when unconfigured', async () => {
    await withFirebaseEnv({}, async () => {
      assert.throws(
        () => getFirebaseAdminApp(),
        (err) => err instanceof FirebaseNotConfigured && err.code === FIREBASE_NOT_CONFIGURED
      );
      assert.equal(isFirebaseAdminAppInitialized(), false, 'a failed build must not memoize');
    });
  });

  it('names every missing variable on a partial configuration', async () => {
    await withFirebaseEnv({ FIREBASE_PROJECT_ID: 'inventory-ai-test' }, async () => {
      assert.throws(
        () => getFirebaseAdminApp(),
        (err) => {
          assert.ok(err instanceof FirebaseNotConfigured);
          assert.match(err.message, /FIREBASE_CLIENT_EMAIL/);
          assert.match(err.message, /FIREBASE_PRIVATE_KEY/);
          assert.ok(!err.message.includes(SECRET_MARKER));
          return true;
        }
      );
    });
  });

  it('builds an app from a complete service account, then MEMOIZES it', async () => {
    // The key is real: `cert()` parses the PEM while the app is built, so a
    // placeholder would fail for the wrong reason. Building makes no network call.
    await withFirebaseEnv(
      { [FIREBASE_SERVICE_ACCOUNT_JSON]: fakeServiceAccountJson({ projectId: 'inventory-ai-test' }) },
      async () => {
        const first = getFirebaseAdminApp();
        assert.ok(first, 'an app must be built');
        assert.equal(first.options.projectId, 'inventory-ai-test');
        assert.equal(isFirebaseAdminAppInitialized(), true);
        // initializeApp throws app/duplicate-app on a second call with the same
        // name, so an unmemoized wrapper would work once and then fail.
        assert.equal(getFirebaseAdminApp(), first, 'the same app instance must be returned');
      }
    );
  });

  it('adopts an app that already exists under its own name', async () => {
    // The duplicate-app throw is the failure this guards; adoption makes it
    // unreachable even if another module initialized first.
    const existing = initializeApp({ projectId: 'adopted-project' }, FIREBASE_APP_NAME);
    try {
      assert.equal(
        getApps().some((app) => app.name === FIREBASE_APP_NAME),
        true
      );
      // No Firebase environment is set, so a NON-adoptive implementation would
      // throw FirebaseNotConfigured here.
      await withFirebaseEnv({}, async () => {
        assert.equal(getFirebaseAdminApp(), existing);
        assert.equal(isFirebaseAdminAppInitialized(), true);
      });
    } finally {
      // resetFirebaseAdminApp() adopts then deletes the app, so by the time the
      // second call runs the app is usually already gone — and `deleteApp` throws
      // SYNCHRONOUSLY in that case, before it can return a promise, so a
      // `.catch()` would never attach. The try/catch is what makes this cleanup
      // survive both orderings; without it a leaked app in firebase-admin's
      // registry would be silently adopted by the next case's getFirebaseAdminApp.
      await resetFirebaseAdminApp();
      try {
        await deleteApp(existing);
      } catch {
        /* already deleted by the reset above */
      }
    }
  });

  it('tears the app down so the next build reflects the CURRENT environment', async () => {
    await withFirebaseEnv(
      { [FIREBASE_SERVICE_ACCOUNT_JSON]: fakeServiceAccountJson({ projectId: 'project-one' }) },
      async () => {
        assert.equal(getFirebaseAdminApp().options.projectId, 'project-one');
        await resetFirebaseAdminApp();
        assert.equal(isFirebaseAdminAppInitialized(), false);
      }
    );

    await withFirebaseEnv(
      { [FIREBASE_SERVICE_ACCOUNT_JSON]: fakeServiceAccountJson({ projectId: 'project-two' }) },
      async () => {
        // Would still be 'project-one' if reset had not released the memoized app.
        assert.equal(getFirebaseAdminApp().options.projectId, 'project-two');
      }
    );
  });

  it('reports a rejected credential without relaying it', async () => {
    // `cert()` parses the PEM as the app is built, so an unusable key surfaces
    // here rather than at the first token exchange. Its own message is produced
    // by a library that was handed the private key, so it is NOT relayed.
    await withFirebaseEnv(
      {
        FIREBASE_PROJECT_ID: 'inventory-ai-test',
        FIREBASE_CLIENT_EMAIL: 'svc@example.test',
        FIREBASE_PRIVATE_KEY: SECRET_MARKER,
      },
      async () => {
        // The config layer sees a complete service account — the key is present,
        // it is simply not usable. That distinction is the point: this is not the
        // "partially configured" path, which would name variables instead.
        assert.equal(firebaseConfig().source, 'individual');

        assert.throws(
          () => getFirebaseAdminApp(),
          (err) => {
            assert.ok(err instanceof FirebaseNotConfigured);
            assert.ok(
              !errorSurface(err).includes(SECRET_MARKER),
              `the credential must not reach the error; got: ${errorSurface(err)}`
            );
            return true;
          }
        );
        assert.equal(isFirebaseAdminAppInitialized(), false);
      }
    );
  });
});

// ---------------------------------------------------------------------------
// services/firebase/index.ts — the service boundary
// ---------------------------------------------------------------------------

unitSuite('Phase 32B — Firebase service boundary', () => {
  beforeEach(async () => {
    await resetFirebaseAdminApp();
  });

  after(async () => {
    await resetFirebaseAdminApp();
  });

  it('answers isFirebaseConfigured without initializing an app', async () => {
    await withFirebaseEnv({ [FIREBASE_SERVICE_ACCOUNT_JSON]: fakeServiceAccountJson() }, async () => {
      assert.equal(serviceIsFirebaseConfigured(), true);
      // A readiness probe or a startup log line must not have the side effect of
      // building a credential.
      assert.equal(isFirebaseAdminAppInitialized(), false, 'asking must not build a credential');
      assert.equal(firebaseProjectId(), 'inventory-ai-test');
    });
  });

  it('answers false and an empty project id when unconfigured', async () => {
    await withFirebaseEnv({}, async () => {
      assert.equal(serviceIsFirebaseConfigured(), false);
      assert.equal(firebaseProjectId(), '');
    });
  });
});

// ---------------------------------------------------------------------------
// config/validateConfig.ts — production validation
// ---------------------------------------------------------------------------

unitSuite('Phase 32B — production config validation', () => {
  /** The rest of a valid production environment, so only Firebase is under test. */
  const BASE = {
    MONGODB_URI: 'mongodb://localhost:27017/inventory_ai',
    JWT_SECRET: 'a'.repeat(48),
  };
  const firebaseProblems = (values) =>
    validateProductionConfig({ ...BASE, ...values }).filter((p) => /^FIREBASE_/.test(p.variable));

  it('reports NO Firebase problem when Firebase is entirely unset', () => {
    // THE additive property. Phase 32B ships no route and no Firebase project
    // exists; if an unconfigured Firebase were a production problem, shipping
    // this phase would stop every existing deployment from booting.
    assert.deepEqual(firebaseProblems({}), []);
    assert.deepEqual(validateProductionConfig({ ...BASE }), []);
  });

  it('reports the missing variables of a partial configuration', () => {
    const problems = firebaseProblems({ FIREBASE_PROJECT_ID: 'inventory-ai-test' });
    assert.deepEqual(problems.map((p) => p.variable).sort(), [
      'FIREBASE_CLIENT_EMAIL',
      'FIREBASE_PRIVATE_KEY',
    ]);
  });

  it('accepts a complete individual configuration', () => {
    assert.deepEqual(
      firebaseProblems({
        FIREBASE_PROJECT_ID: 'inventory-ai-test',
        FIREBASE_CLIENT_EMAIL: 'svc@example.test',
        FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
      }),
      []
    );
  });

  it('accepts a complete service-account JSON', () => {
    assert.deepEqual(
      firebaseProblems({ [FIREBASE_SERVICE_ACCOUNT_JSON]: fakeServiceAccountJson() }),
      []
    );
  });

  it('reports an unparseable service-account JSON against its own variable', () => {
    const problems = firebaseProblems({ [FIREBASE_SERVICE_ACCOUNT_JSON]: '{{{ not json' });
    assert.equal(problems.length, 1);
    assert.equal(problems[0].variable, FIREBASE_SERVICE_ACCOUNT_JSON);
  });

  it('never prints a service-account value, whatever is wrong with it', () => {
    // Every failure shape, searched for the planted key material.
    const cases = [
      { [FIREBASE_SERVICE_ACCOUNT_JSON]: `{ broken ${SECRET_MARKER}` },
      {
        FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
          project_id: 'p',
          client_email: 'e',
          private_key: SECRET_MARKER,
        }),
      },
      {
        FIREBASE_PROJECT_ID: 'p',
        FIREBASE_CLIENT_EMAIL: SECRET_MARKER,
        FIREBASE_PRIVATE_KEY: SECRET_MARKER,
      },
      {
        FIREBASE_PROJECT_ID: SECRET_MARKER,
        FIREBASE_CLIENT_EMAIL: SECRET_MARKER,
        FIREBASE_PRIVATE_KEY: SECRET_MARKER,
      },
    ];
    for (const values of cases) {
      const rendered = JSON.stringify(validateProductionConfig({ ...BASE, ...values }));
      assert.ok(
        !rendered.includes(SECRET_MARKER),
        `a validation result must never carry a value; got: ${rendered}`
      );
    }
  });

  it('still reports the other production problems, so the checks above are not vacuous', () => {
    // Guards the interception: a `firebaseProblems` filter that matched nothing —
    // or a validator that returned nothing at all — would make every case in this
    // suite pass while testing nothing.
    assert.deepEqual(validateProductionConfig({}).map((p) => p.variable).sort(), [
      'JWT_SECRET',
      'MONGODB_URI',
    ]);
  });
});

// ---------------------------------------------------------------------------
// User model — additive fields and the sparse unique index (DB-backed)
// ---------------------------------------------------------------------------

const dbOk = await ensureDb();
const tracker = createTracker(dbOk);
let suiteBusinessId = null;

dbSuite('Phase 32B — User model Firebase fields (MongoDB)', dbOk, () => {
  before(async () => {
    if (!dbOk) return;
    // Make the declared indexes real before asserting on what the database does.
    // ensureIndexes creates what is missing and drops nothing, so it is safe
    // against a shared development database.
    await User.ensureIndexes();
    const business = await Business.create({ name: uniqueName('p32b-biz') });
    suiteBusinessId = business._id;
    tracker.trackBusiness(business._id);
  });

  after(async () => {
    await tracker.cleanup();
    await disconnectDb();
  });

  /** A minimal user on this suite's business. */
  async function makeUser(overrides = {}) {
    const user = await User.create({
      businessId: suiteBusinessId,
      name: uniqueName('p32b-user'),
      email: uniqueEmail('p32b'),
      ...overrides,
    });
    tracker.trackUser(user._id);
    return user;
  }

  it('declares firebaseUid UNIQUE and SPARSE', () => {
    const path = User.schema.path('firebaseUid');
    assert.ok(path, 'firebaseUid must exist on the schema');
    assert.equal(path.options.unique, true, 'unique is what declares the index');
    // Without sparse, a missing value indexes as null and the SECOND legacy user
    // collides with the first — a duplicate-key error on a record with nothing to
    // do with Firebase.
    assert.equal(
      path.options.sparse,
      true,
      'firebaseUid MUST be sparse, or legacy users cannot coexist'
    );
    assert.equal(path.options.required, undefined, 'firebaseUid is optional');
  });

  it('declares the index with unique + sparse options, not merely the path', () => {
    // The path option is the declaration; the index entry is what MongoDB builds.
    const entry = User.schema
      .indexes()
      .find(([keys]) => Object.keys(keys).length === 1 && keys.firebaseUid === 1);
    assert.ok(entry, 'a single-field firebaseUid index must be declared');
    assert.equal(entry[1].unique, true);
    assert.equal(entry[1].sparse, true);
  });

  it('has actually BUILT that index in MongoDB as sparse', async () => {
    // The strongest form of the claim: not what the schema says, but what the
    // database holds. A declaration that never built would leave the duplicate-key
    // trap in place while every schema assertion above still passed.
    const indexes = await User.collection.indexes();
    const live = indexes.find(
      (index) => JSON.stringify(index.key) === JSON.stringify({ firebaseUid: 1 })
    );
    assert.ok(live, `no live firebaseUid index; built: ${indexes.map((i) => i.name).join(', ')}`);
    assert.equal(live.unique, true);
    assert.equal(live.sparse, true);
  });

  it('lets MANY users without a firebaseUid coexist', async () => {
    // The migration property, proven against real MongoDB rather than inferred
    // from the declaration. This is what makes the phase additive: every
    // pre-existing account has no firebaseUid and must still be creatable.
    const a = await makeUser();
    const b = await makeUser();
    const c = await makeUser();
    for (const user of [a, b, c]) {
      assert.equal(user.firebaseUid, undefined);
    }
    assert.equal(await User.countDocuments({ _id: { $in: [a._id, b._id, c._id] } }), 3);
  });

  it('refuses a DUPLICATE firebaseUid', async () => {
    const uid = `firebase-uid-${process.pid}-${Date.now()}`;
    await makeUser({ firebaseUid: uid });
    await assert.rejects(
      () => makeUser({ firebaseUid: uid }),
      (err) => err.code === 11000,
      'a second user with the same firebaseUid must be rejected by the unique index'
    );
  });

  it('defaults emailVerified to false and stores a set value', async () => {
    const unset = await makeUser();
    assert.equal(unset.emailVerified, false, 'a user without the field must read as unverified');
    const verified = await makeUser({ emailVerified: true });
    assert.equal(verified.emailVerified, true);
    // Re-read to prove the default is persisted, not only applied in memory.
    const reread = await User.findById(unset._id);
    assert.equal(reread.emailVerified, false);
  });

  it('stores a user with NO passwordHash — the Firebase-native account shape', async () => {
    // passwordHash was relaxed from required to optional so a Firebase-native
    // account does not have to carry a meaningless placeholder in exactly the
    // field a reader would trust.
    const user = await makeUser({ firebaseUid: `fb-${process.pid}-${Date.now()}` });
    const reread = await User.findById(user._id).select('+passwordHash');
    assert.equal(reread.passwordHash, undefined);
  });

  it('still hides passwordHash on a default read while keeping it usable', async () => {
    // The relaxation must not have disturbed select:false — the legacy login path
    // selects it explicitly, and nothing else may see it. Asserted through a
    // re-read, since select:false governs query projection rather than the
    // document `create` hands back.
    const hash = '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ01';
    const user = await makeUser({ passwordHash: hash });

    const defaultRead = await User.findById(user._id);
    assert.equal(defaultRead.passwordHash, undefined, 'absent from a default read');

    const explicit = await User.findById(user._id).select('+passwordHash');
    assert.equal(explicit.passwordHash, hash, 'still readable when explicitly selected');
  });

  it('keeps every pre-existing users index — Phase 32B is purely additive', () => {
    const signatures = User.schema.indexes().map(([keys]) => JSON.stringify(keys));
    for (const key of [
      { businessId: 1 },
      { email: 1 },
      { businessId: 1, role: 1 },
      { businessId: 1, status: 1 },
      { businessId: 1, createdAt: -1, _id: -1 },
    ]) {
      assert.ok(
        signatures.includes(JSON.stringify(key)),
        `${JSON.stringify(key)} must survive Phase 32B; declared: ${JSON.stringify(signatures)}`
      );
    }
  });
});
