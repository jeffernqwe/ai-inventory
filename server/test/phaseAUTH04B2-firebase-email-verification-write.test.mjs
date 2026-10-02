// AUTH-04-B2 — the Firebase Admin `updateUser` write bridge.
//
// This suite pins the ONE new Firebase capability AUTH-04 introduces: setting a
// verified identity's `emailVerified` flag. No challenge, no route, no HTTP, no
// code minting — so the properties worth asserting are:
//
//   * the write is EXACTLY `{ emailVerified: true }` and there is no parameter
//     through which a caller could ask for a second field;
//   * the uid is guarded BEFORE the Admin app is built, so a blank or non-string
//     value never spends a credential build and never reaches the SDK;
//   * the result is narrowed to `{ uid, emailVerified }` — the SDK's record
//     carries email, disabled, customClaims and metadata, and none of it may cross
//     this boundary;
//   * every SDK failure maps by CODE, per the locked AUTH-04 table:
//     user-not-found / user-disabled -> FIREBASE_TOKEN_INVALID,
//     invalid-credential -> FIREBASE_NOT_CONFIGURED, everything else (including a
//     missing or non-string code) -> FIREBASE_UNAVAILABLE;
//   * no upstream message, and no code at all, can reach an error, a log line or a
//     caller.
//
// DATABASE-FREE on purpose: no model, no connection, no route, no network. It runs
// in both `npm test` and `npm run test:unit`.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { unitSuite } from './testEnv.mjs';

import {
  updateFirebaseUserEmailVerified,
  setFirebaseUserUpdater,
  resetFirebaseUserUpdater,
  hasCustomFirebaseUserUpdater,
  isFirebaseAdminAppInitialized,
  resetFirebaseAdminApp,
  FirebaseNotConfigured,
  FirebaseTokenError,
  FirebaseUnavailableError,
  FIREBASE_NOT_CONFIGURED,
  FIREBASE_TOKEN_INVALID,
  FIREBASE_UNAVAILABLE,
  isFirebaseError,
} from '../src/services/firebase/index.ts';
import { firebaseErrorFromSdkCode } from '../src/services/firebase/firebaseErrors.ts';
import {
  registerFakeFirebaseUserUpdater,
  deregisterFakeFirebaseUserUpdater,
  setFakeFirebaseUserRecord,
  setFakeFirebaseUpdateFailure,
  setFakeFirebaseUpdateThrow,
  fakeUserRecord,
  updatedUids,
  clearUpdatedUids,
} from './fakes/firebaseUserUpdater.mjs';

const UID = 'firebase-uid-abc123';
const TOKEN = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJhYmMxMjMifQ.c2lnbmF0dXJl';
const ADDRESS = 'owner@inventory-ai.test';

const FIREBASE_ENV_KEYS = [
  'FIREBASE_SERVICE_ACCOUNT_JSON',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
];

/** Runs `fn` with exactly the named Firebase vars set, restoring the environment. */
async function withFirebaseEnv(vars, fn) {
  const saved = new Map(FIREBASE_ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of FIREBASE_ENV_KEYS) {
    if (Object.prototype.hasOwnProperty.call(vars, key) && vars[key] !== undefined) {
      process.env[key] = vars[key];
    } else {
      delete process.env[key];
    }
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function captureError(fn) {
  try {
    await fn();
  } catch (err) {
    return err;
  }
  return assert.fail('expected the call to reject, but it resolved');
}

/** The whole error surface a caller or a crash reporter could reach. */
function serialiseError(err) {
  return [err.message, err.stack, JSON.stringify(err, Object.getOwnPropertyNames(err))].join('\n');
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function captureConsole(fn) {
  const original = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  const lines = [];
  const capture = (...args) => {
    lines.push(args.map((arg) => (typeof arg === 'string' ? arg : safeStringify(arg))).join(' '));
  };
  console.log = capture;
  console.error = capture;
  console.warn = capture;
  console.info = capture;
  try {
    await fn();
  } finally {
    Object.assign(console, original);
  }
  return lines.join('\n');
}

/** Only the `reason` label, which is the one detail a mapped error carries. */
async function failureFor(configure) {
  registerFakeFirebaseUserUpdater();
  try {
    configure();
    return await captureError(() => updateFirebaseUserEmailVerified(UID));
  } finally {
    deregisterFakeFirebaseUserUpdater();
  }
}

const MODULE_URL = new URL('../src/services/firebase/userUpdater.ts', import.meta.url);
const moduleSource = readFileSync(MODULE_URL, 'utf8');

/**
 * Strips block and line comments, so a guard on an identifier cannot be satisfied
 * or broken by prose. The module documents what it must never contain, and a
 * source-text guard that read the documentation would be nonsense.
 */
const codeOnly = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const moduleCode = codeOnly(moduleSource);

unitSuite('AUTH-04-B2 — the Firebase Admin emailVerified write bridge', () => {
  // ---------------------------------------------------------------------------
  // The seam
  // ---------------------------------------------------------------------------
  describe('the test seam', () => {
    it('has no substituted delegate by default, and reset restores the real path', () => {
      assert.equal(hasCustomFirebaseUserUpdater(), false, 'the suite must start on the real path');

      registerFakeFirebaseUserUpdater();
      assert.equal(hasCustomFirebaseUserUpdater(), true);

      deregisterFakeFirebaseUserUpdater();
      assert.equal(hasCustomFirebaseUserUpdater(), false, 'deregistering must restore the real path');

      // `null` is the documented restore, independent of the fake helper.
      setFirebaseUserUpdater(async () => fakeUserRecord());
      assert.equal(hasCustomFirebaseUserUpdater(), true);
      resetFirebaseUserUpdater();
      assert.equal(hasCustomFirebaseUserUpdater(), false);
    });

    it('returns the PREVIOUS delegate, as the verifier seam does', () => {
      const first = async () => fakeUserRecord();
      const second = async () => fakeUserRecord();

      const before = setFirebaseUserUpdater(first);
      assert.equal(before, null, 'the first substitution replaces the real path, so there is none');

      const replaced = setFirebaseUserUpdater(second);
      assert.equal(replaced, first, 'the setter must hand back what it replaced');

      const restored = setFirebaseUserUpdater(null);
      assert.equal(restored, second);

      assert.equal(hasCustomFirebaseUserUpdater(), false);
    });

    it('leaves the seam clean at the end of the suite', () => {
      assert.equal(hasCustomFirebaseUserUpdater(), false);
    });
  });

  // ---------------------------------------------------------------------------
  // The uid guard — before anything is built or touched
  // ---------------------------------------------------------------------------
  describe('the uid guard', () => {
    it('refuses a blank, non-string or missing uid before the transport is reached', async () => {
      registerFakeFirebaseUserUpdater();
      try {
        for (const uid of ['', '   ', undefined, null, 42, 0, {}, [], true]) {
          clearUpdatedUids();
          const err = await captureError(() => updateFirebaseUserEmailVerified(uid));

          assert.ok(err instanceof FirebaseTokenError, `uid ${JSON.stringify(uid)} must be refused`);
          assert.equal(err.code, FIREBASE_TOKEN_INVALID);
          assert.equal(err.reason, 'missing-uid');
          assert.deepEqual(updatedUids(), [], 'the transport must not be reached');
        }
      } finally {
        deregisterFakeFirebaseUserUpdater();
      }
    });

    it('passes the TRIMMED uid through, and reports it back', async () => {
      registerFakeFirebaseUserUpdater();
      try {
        clearUpdatedUids();
        setFakeFirebaseUserRecord(fakeUserRecord({ uid: 'some-other-uid' }));
        const result = await updateFirebaseUserEmailVerified(`  ${UID}  `);

        assert.deepEqual(updatedUids(), [UID], 'the SDK must be handed the trimmed uid');
        assert.equal(
          result.uid,
          UID,
          'the returned uid is the value this call was authorised to write',
        );
      } finally {
        deregisterFakeFirebaseUserUpdater();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Success and the narrowed shape
  // ---------------------------------------------------------------------------
  describe('a successful write', () => {
    it('calls the delegate once with the uid and resolves { uid, emailVerified: true }', async () => {
      registerFakeFirebaseUserUpdater();
      try {
        clearUpdatedUids();
        setFakeFirebaseUserRecord(fakeUserRecord({ uid: UID, emailVerified: true }));
        const result = await updateFirebaseUserEmailVerified(UID);

        assert.deepEqual(result, { uid: UID, emailVerified: true });
        assert.deepEqual(updatedUids(), [UID], 'exactly one write, for exactly this uid');
      } finally {
        deregisterFakeFirebaseUserUpdater();
      }
    });

    it('returns exactly two own properties, whatever the record carries', async () => {
      registerFakeFirebaseUserUpdater();
      try {
        setFakeFirebaseUserRecord(fakeUserRecord({ uid: UID }));
        const result = await updateFirebaseUserEmailVerified(UID);

        assert.deepEqual(Object.keys(result).sort(), ['emailVerified', 'uid']);
      } finally {
        deregisterFakeFirebaseUserUpdater();
      }
    });

    it('does not leak the SDK record’s email, disabled flag, claims or metadata', async () => {
      registerFakeFirebaseUserUpdater();
      try {
        setFakeFirebaseUserRecord(
          fakeUserRecord({
            uid: UID,
            email: ADDRESS,
            customClaims: { role: 'OWNER', businessId: 'biz-1' },
            metadata: { lastSignInTime: 'Wed, 01 Oct 2026 00:00:00 GMT' },
          })
        );
        const result = await updateFirebaseUserEmailVerified(UID);
        const serialised = JSON.stringify(result);

        for (const forbidden of [ADDRESS, 'OWNER', 'biz-1', 'lastSignInTime', 'disabled', 'customClaims']) {
          assert.ok(!serialised.includes(forbidden), `the narrowed result must not carry ${forbidden}`);
        }
        assert.deepEqual(serialised, `{"uid":"${UID}","emailVerified":true}`);
      } finally {
        deregisterFakeFirebaseUserUpdater();
      }
    });

    it('reads the flag as === true, so every other value is false (O-4)', async () => {
      registerFakeFirebaseUserUpdater();
      try {
        const cases = [
          [true, true],
          [false, false],
          ['true', false],
          [1, false],
          ['yes', false],
          [undefined, false],
          [null, false],
          [{}, false],
        ];
        for (const [reported, expected] of cases) {
          setFakeFirebaseUserRecord({ uid: UID, emailVerified: reported });
          const result = await updateFirebaseUserEmailVerified(UID);
          assert.equal(
            result.emailVerified,
            expected,
            `a record reporting ${JSON.stringify(reported)} must read as ${expected}`,
          );
        }
      } finally {
        deregisterFakeFirebaseUserUpdater();
      }
    });

    it('does not turn a false report into a domain failure (O-4)', async () => {
      registerFakeFirebaseUserUpdater();
      try {
        setFakeFirebaseUserRecord({ uid: UID, emailVerified: false });
        const result = await updateFirebaseUserEmailVerified(UID);
        assert.deepEqual(result, { uid: UID, emailVerified: false }, 'this is B4’s decision, not B2’s');
      } finally {
        deregisterFakeFirebaseUserUpdater();
      }
    });

    it('tolerates a delegate that resolves with a record carrying no usable flag', async () => {
      registerFakeFirebaseUserUpdater();
      try {
        // `null` is the fake's "restore the default success" convention, so the
        // empty shapes are spelled out: the narrowing must tolerate all of them.
        for (const record of [{}, { emailVerified: undefined }, { emailVerified: null }, { uid: UID }]) {
          setFakeFirebaseUserRecord(record);
          const result = await updateFirebaseUserEmailVerified(UID);
          assert.deepEqual(result, { uid: UID, emailVerified: false });
        }
      } finally {
        deregisterFakeFirebaseUserUpdater();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // The locked error table
  // ---------------------------------------------------------------------------
  describe('the locked error mapping', () => {
    it('auth/user-not-found -> FirebaseTokenError / FIREBASE_TOKEN_INVALID', async () => {
      const err = await failureFor(() => setFakeFirebaseUpdateFailure('auth/user-not-found'));
      assert.ok(err instanceof FirebaseTokenError);
      assert.equal(err.code, FIREBASE_TOKEN_INVALID);
      assert.equal(err.reason, 'auth/user-not-found');
      assert.equal(isFirebaseError(err), true);
    });

    it('auth/user-disabled -> FirebaseTokenError / FIREBASE_TOKEN_INVALID', async () => {
      const err = await failureFor(() => setFakeFirebaseUpdateFailure('auth/user-disabled'));
      assert.ok(err instanceof FirebaseTokenError);
      assert.equal(err.code, FIREBASE_TOKEN_INVALID);
      assert.equal(err.reason, 'auth/user-disabled');
    });

    it('auth/invalid-credential -> FirebaseNotConfigured / FIREBASE_NOT_CONFIGURED', async () => {
      const err = await failureFor(() => setFakeFirebaseUpdateFailure('auth/invalid-credential'));
      assert.ok(err instanceof FirebaseNotConfigured);
      assert.equal(err.code, FIREBASE_NOT_CONFIGURED);
      assert.equal(err instanceof FirebaseUnavailableError, false);
    });

    it('every other code -> FirebaseUnavailableError / FIREBASE_UNAVAILABLE', async () => {
      for (const code of [
        'auth/internal-error',
        'auth/insufficient-permission',
        'auth/quota-exceeded',
        'app/network-error',
        'auth/some-future-code',
      ]) {
        const err = await failureFor(() => setFakeFirebaseUpdateFailure(code));
        assert.ok(err instanceof FirebaseUnavailableError, `${code} must be transient`);
        assert.equal(err.code, FIREBASE_UNAVAILABLE);
        assert.equal(err.reason, code, 'a recognised code is a safe label');
      }
    });

    it('a missing, non-string or absurd code is unavailable, never terminal', async () => {
      // `null` rather than `undefined`: `undefined` would trigger the fake's own
      // default parameter and hand the bridge a real code instead of no code.
      const absent = await failureFor(() => setFakeFirebaseUpdateFailure(null));
      assert.ok(absent instanceof FirebaseUnavailableError);
      assert.equal(absent.reason, 'unknown');

      const numeric = await failureFor(() => setFakeFirebaseUpdateFailure(12345));
      assert.ok(numeric instanceof FirebaseUnavailableError);
      assert.equal(numeric.reason, 'unknown');

      // A code-shaped value that is NOT a plain SDK identifier cannot survive
      // `safeTokenReason`: it is sanitised to 'unknown' and treated as transient,
      // so a hostile value can neither be relayed nor made terminal.
      const hostileCode = `auth/user-not-found;token=${TOKEN}`;
      const hostile = await failureFor(() => setFakeFirebaseUpdateFailure(hostileCode));
      assert.ok(hostile instanceof FirebaseUnavailableError);
      assert.equal(hostile.reason, 'unknown');
      assert.ok(!serialiseError(hostile).includes(TOKEN));
    });

    it('a thrown non-Error is unavailable, and nothing about it is relayed', async () => {
      for (const thrown of ['a string', 42, null, undefined, new Error('no code at all')]) {
        const err = await failureFor(() => setFakeFirebaseUpdateThrow(thrown));
        assert.ok(err instanceof FirebaseUnavailableError, `${String(thrown)} must not be terminal`);
        assert.equal(err.code, FIREBASE_UNAVAILABLE);
      }
    });

    it('classifies by the code wherever it is found, regardless of the thrown shape', async () => {
      // The SDK always rejects with an Error carrying `code`, but the bridge reads
      // the code off whatever was thrown — so a plain object carrying a recognised
      // code is classified by it rather than defaulting. Pinned because it is the
      // behaviour `verificationErrorFrom` already has, and a future reader should
      // not mistake it for an accident.
      const byShape = await failureFor(() =>
        setFakeFirebaseUpdateThrow({ code: 'auth/user-disabled' })
      );
      assert.ok(byShape instanceof FirebaseTokenError);
      assert.equal(byShape.reason, 'auth/user-disabled');

      const unknownShape = await failureFor(() => setFakeFirebaseUpdateThrow({ code: 'nonsense' }));
      assert.ok(unknownShape instanceof FirebaseUnavailableError);
      assert.equal(unknownShape.reason, 'nonsense');
    });

    it('isFirebaseError() recognises all three domain classes, and nothing else', () => {
      assert.equal(isFirebaseError(new FirebaseTokenError()), true);
      assert.equal(isFirebaseError(new FirebaseNotConfigured()), true);
      assert.equal(isFirebaseError(new FirebaseUnavailableError()), true);
      assert.equal(isFirebaseError(new Error('unrelated')), false);
      assert.equal(isFirebaseError(null), false);
    });

    it('the shared O-2 helper is the single dispatcher, and is pure', () => {
      assert.ok(firebaseErrorFromSdkCode('auth/user-not-found') instanceof FirebaseTokenError);
      assert.ok(firebaseErrorFromSdkCode('auth/user-disabled') instanceof FirebaseTokenError);
      assert.ok(firebaseErrorFromSdkCode('auth/invalid-credential') instanceof FirebaseNotConfigured);
      assert.ok(firebaseErrorFromSdkCode('auth/internal-error') instanceof FirebaseUnavailableError);
      assert.ok(firebaseErrorFromSdkCode(undefined) instanceof FirebaseUnavailableError);
      assert.ok(firebaseErrorFromSdkCode(null) instanceof FirebaseUnavailableError);
      assert.ok(firebaseErrorFromSdkCode({}) instanceof FirebaseUnavailableError);

      // Deterministic: the same input gives the same class and reason every time.
      const first = firebaseErrorFromSdkCode('auth/internal-error');
      const second = firebaseErrorFromSdkCode('auth/internal-error');
      assert.equal(first.constructor, second.constructor);
      assert.equal(first.reason, second.reason);

      // The not-configured message is the caller's to choose, and never a value.
      const custom = firebaseErrorFromSdkCode('auth/invalid-credential', 'custom copy');
      assert.equal(custom.message, 'custom copy');
    });
  });

  // ---------------------------------------------------------------------------
  // Secrecy
  // ---------------------------------------------------------------------------
  describe('nothing upstream survives', () => {
    it('discards a hostile upstream message entirely', async () => {
      const hostile = `updateUser rejected for ${ADDRESS} with token ${TOKEN}`;
      const err = await failureFor(() => setFakeFirebaseUpdateFailure('auth/internal-error', hostile));

      const surface = serialiseError(err);
      for (const secret of [TOKEN, ADDRESS, 'updateUser rejected', hostile]) {
        assert.ok(!surface.includes(secret), `a thrown error must never carry ${secret}`);
      }

      const own = Object.getOwnPropertyNames(err).filter(
        (key) => !['stack', 'message', 'name', 'code', 'reason'].includes(key)
      );
      assert.deepEqual(own, [], 'no upstream body or transport error may be attached');
      assert.equal(err.cause, undefined);
    });

    it('never puts the uid into the error, and keeps `reason` allowlisted', async () => {
      const err = await failureFor(() => setFakeFirebaseUpdateFailure('auth/user-not-found'));
      assert.ok(!serialiseError(err).includes(UID));
      assert.deepEqual(
        Object.keys(err).sort(),
        ['code', 'name', 'reason'],
        'the class name, the code and the safe label are the only enumerable state'
      );
      assert.equal(err.name, 'FirebaseTokenError');
      assert.match(err.reason, /^[a-z0-9/_-]{1,64}$/i);
    });

    it('writes nothing to the console on success or on any failure', async () => {
      registerFakeFirebaseUserUpdater();
      try {
        const logged = await captureConsole(async () => {
          setFakeFirebaseUserRecord(fakeUserRecord({ uid: UID }));
          await updateFirebaseUserEmailVerified(UID);

          for (const code of [
            'auth/user-not-found',
            'auth/user-disabled',
            'auth/invalid-credential',
            'auth/internal-error',
          ]) {
            setFakeFirebaseUpdateFailure(code, `failed for ${ADDRESS} with ${TOKEN}`);
            await captureError(() => updateFirebaseUserEmailVerified(UID));
          }

          setFakeFirebaseUpdateThrow('a string');
          await captureError(() => updateFirebaseUserEmailVerified(UID));

          await captureError(() => updateFirebaseUserEmailVerified(''));
        });

        for (const secret of [TOKEN, ADDRESS, UID]) {
          assert.ok(!logged.includes(secret), `nothing carrying ${secret} may reach the console`);
        }
        assert.equal(logged, '', 'the bridge must produce no output at all');
      } finally {
        deregisterFakeFirebaseUserUpdater();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // The real path, with no Firebase configured and no network
  // ---------------------------------------------------------------------------
  describe('the real path', () => {
    it('refuses a blank uid BEFORE attempting the credential build', async () => {
      try {
        await resetFirebaseAdminApp();

        // No Firebase configured at all: if the uid guard ran after the app build,
        // this would surface as FIREBASE_NOT_CONFIGURED instead of missing-uid.
        await withFirebaseEnv({}, async () => {
          const err = await captureError(() => updateFirebaseUserEmailVerified('   '));

          assert.ok(err instanceof FirebaseTokenError, 'the uid guard must decide first');
          assert.equal(err.reason, 'missing-uid');
          assert.equal(isFirebaseAdminAppInitialized(), false, 'no credential may be built');
        });
      } finally {
        await resetFirebaseAdminApp();
      }
    });

    it('fails as FIREBASE_NOT_CONFIGURED before any Admin app is built', async () => {
      assert.equal(hasCustomFirebaseUserUpdater(), false, 'the real path must be in force');

      try {
        await resetFirebaseAdminApp();

        await withFirebaseEnv({}, async () => {
          assert.equal(isFirebaseAdminAppInitialized(), false);

          const err = await captureError(() => updateFirebaseUserEmailVerified(UID));

          assert.ok(err instanceof FirebaseNotConfigured, 'an unconfigured server is an operator fault');
          assert.equal(err.code, FIREBASE_NOT_CONFIGURED);
          assert.equal(
            isFirebaseAdminAppInitialized(),
            false,
            'the configuration failure must precede the credential build'
          );
        });
      } finally {
        await resetFirebaseAdminApp();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Source guards — the boundary is a property of the code, not only of behaviour
  // ---------------------------------------------------------------------------
  describe('source guards', () => {
    it('logs nothing', () => {
      assert.ok(!/console\./.test(moduleSource), 'the bridge must have no logging call');
    });

    it('contains exactly the one hardcoded write, and no second field', () => {
      const writes = moduleCode.match(/emailVerified:\s*true/g) ?? [];
      assert.equal(writes.length, 1, 'the write payload must be stated once, literally');
      assert.match(moduleCode, /updateUser\(uid,\s*\{\s*emailVerified:\s*true\s*\}\)/);
    });

    it('takes no properties, options or field-list parameter', () => {
      for (const forbidden of ['properties', 'options', 'fields', 'patch']) {
        assert.ok(
          !new RegExp(`\\b${forbidden}\\b`).test(moduleCode),
          `the bridge must not accept a ${forbidden} parameter`
        );
      }
      assert.match(moduleCode, /updateFirebaseUserEmailVerified\(\s*uid:\s*unknown\s*\)/);
    });

    it('states the uid guard, and never builds an app at module scope', () => {
      assert.match(moduleCode, /typeof uid !== 'string'\s*\|\|\s*uid\.trim\(\) === ''/);
      assert.match(moduleCode, /throw new FirebaseTokenError\('missing-uid'\)/);

      // The app build lives inside a function and is reached only by a call, so
      // importing this module can never construct a credential. (That the guard
      // runs BEFORE that call is asserted behaviourally, on the real path.)
      assert.match(moduleCode, /async function updateUserWithAdminSdk/);
      assert.ok(
        !/^\s*const\s+\w+\s*=\s*getFirebaseAdminApp\(\)/m.test(moduleCode),
        'no module-level app binding may exist'
      );
    });

    it('initializes no app and revokes no tokens — both belong elsewhere or nowhere', () => {
      for (const banned of ['initializeApp', 'revokeRefreshTokens', 'createUser', 'deleteUser']) {
        assert.ok(!moduleCode.includes(banned), `the bridge must not contain ${banned}`);
      }
      // The Phase A (F-1) guard reads every module's code for this identifier.
      assert.ok(!/unlink/i.test(moduleCode), 'the removed capability must not reappear in code');
    });

    it('reads only the SDK error code, never its message', () => {
      assert.match(moduleCode, /\.code\b/, 'the mapper must read the code');
      assert.ok(!/\.message\b/.test(moduleCode), 'the upstream message must never be read');
    });

    it('delegates classification to the shared helper rather than restating the table', () => {
      assert.match(moduleCode, /firebaseErrorFromSdkCode\(/);
      // The two TERMINAL codes must never be restated here. `auth/invalid-credential`
      // is deliberately absent from this list: it appears once as part of the
      // not-configured MESSAGE, which is fixed copy rather than a lookup table.
      for (const code of ['auth/user-not-found', 'auth/user-disabled']) {
        assert.ok(
          !moduleCode.includes(code),
          `the bridge must not restate the SDK code table (${code})`
        );
      }
      assert.match(moduleCode, /isFirebaseError\(err\)/, 'a domain error must pass through untouched');
      // And the transport is behind the seam, so no test path can reach the SDK.
      assert.match(moduleCode, /updaterDelegate \?\? updateUserWithAdminSdk/);
    });
  });
});
