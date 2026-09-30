/**
 * Phase A (F-1) — the Firebase credential authority, pinned structurally.
 *
 * THE PHASE'S GUARANTEE IS THE ABSENCE OF A CAPABILITY, and an absence cannot be proven
 * behaviourally: a route that no longer exists passes every test that never calls it. So
 * this file asserts the SHAPE of the shipped server — which routes are registered, which
 * update operator may name which field, and which lookup resolves an identity — and it
 * fails on the INTRODUCTION of the capability rather than on its use.
 *
 * WHAT IS DELIBERATELY NOT HERE. The behavioural half — the exchange, the bridge, the
 * link lifecycle — is already owned by 'phase32c-firebase-exchange.test.mjs',
 * 'phase32h-firebase-linking.test.mjs' and the N-4 suites, all of which run unchanged.
 * This file adds only what none of them can see: that the removal left nothing behind,
 * and that no reachable path can clear 'firebaseUid'.
 *
 * NO DATABASE IS REQUIRED. Every assertion reads source or walks a router, which is also
 * why it is registered in PURE_UNIT and runs in both modes.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { AUDIT_ACTIONS } from '../src/constants/audit.ts';
import { unitSuite } from './testEnv.mjs';

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(SERVER_ROOT, 'src');

const readSource = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');

/**
 * Strips block and line comments. Line comments are stripped only when they start a line,
 * so a '//' inside a string is left alone. This exists because the guards below assert that
 * certain identifiers never appear, and the shipped modules document the removal in prose.
 */
const codeOnly = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Every .ts/.js module under src/, recursively, as src-relative POSIX paths. */
function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.js')) return [];
    return [path.relative(SRC, full).split(path.sep).join('/')];
  });
}

const SOURCES = sourceFiles(SRC).map((rel) => ({ rel, code: codeOnly(readSource(rel)) }));


/**
 * Every '$set: { ... }' (or '$unset: { ... }') literal in a source file, with the braces
 * matched rather than guessed at, so a block's members can be inspected as a whole.
 */
function updateBlocks(source, operator) {
  const blocks = [];
  let from = 0;
  for (;;) {
    const at = source.indexOf(operator, from);
    if (at === -1) break;
    const open = source.indexOf("{", at + operator.length);
    // Only a colon may separate the operator from its block. Anything else means this
    // occurrence is not an update block at all, and the scan stops rather than guessing.
    const between = open === -1 ? null : source.slice(at + operator.length, open).split(":").join("").trim();
    if (open === -1 || between !== "") break;
    let depth = 0;
    let i = open;
    for (; i < source.length; i += 1) {
      if (source[i] === "{") depth += 1;
      else if (source[i] === "}" && (depth -= 1) === 0) break;
    }
    blocks.push(source.slice(at, i + 1));
    from = i + 1;
  }
  return blocks;
}

/**
 * The filter object of every call to a given user lookup, brace-matched so only the
 * filter is inspected and never the rest of the statement.
 */
function filterOf(source, needle) {
  const filters = [];
  let from = 0;
  for (;;) {
    const at = source.indexOf(needle, from);
    if (at === -1) break;
    const open = source.indexOf("{", at);
    if (open === -1) break;
    let depth = 0;
    let i = open;
    for (; i < source.length; i += 1) {
      if (source[i] === "{") depth += 1;
      else if (source[i] === "}" && (depth -= 1) === 0) break;
    }
    filters.push(source.slice(open, i + 1));
    from = i + 1;
  }
  return filters;
}

/** Every route path registered on the shipped auth router. */
async function authRoutePaths() {
  const mod = await import(pathToFileURL(path.join(SRC, 'routes', 'auth.routes.ts')).href);
  const router = mod.createAuthRouter({ limits: { loginAccount: 5, loginIp: 20, register: 5 } });
  return router.stack.filter((layer) => layer.route).map((layer) => layer.route.path);
}

unitSuite('Phase A (F-1) — the Firebase credential authority (declaration guards)', () => {
  describe('the unlink capability is gone, not disabled', () => {
    it('★ the shipped auth router registers no unlink path, and keeps its four neighbours', async () => {
      const paths = await authRoutePaths();

      assert.equal(
        paths.filter((route) => /unlink/i.test(route)).length,
        0,
        'a route matching /unlink is registered'
      );

      // The removal must not have taken a neighbour with it: these four are what the route
      // inventory is now, and a missing one would be a silent authorization-surface change.
      for (const expected of [
        '/firebase/exchange',
        '/firebase/register',
        '/firebase/link',
        '/credentials-changed',
      ]) {
        assert.ok(paths.includes(expected), 'the removal took "' + expected + '" with it');
      }
    });

    it('★ no module under src/ names the removed capability in code', () => {
      // Comment-stripped, so the removal notes these modules carry in their own prose count
      // as documentation rather than as a call site.
      const offenders = SOURCES.filter((entry) => /unlink/i.test(entry.code)).map((entry) => entry.rel);

      assert.deepEqual(offenders, [], 'a module still names the removed capability in code');
    });

    it('the service module, the audit actions and the payload validator went with it', () => {
      assert.equal(
        fs.existsSync(path.join(SRC, 'services', 'firebaseUnlink.service.ts')),
        false,
        'the unlink service file still exists'
      );

      const auditKeys = Object.keys(AUDIT_ACTIONS);
      assert.deepEqual(auditKeys.filter((key) => /UNLINK/i.test(key)), [], 'an unlink audit action remains');
      // The linkage actions are the pair the removal must NOT have disturbed.
      assert.deepEqual(
        auditKeys.filter((key) => /^FIREBASE_IDENTITY/.test(key)).sort(),
        ['FIREBASE_IDENTITY_LINKED', 'FIREBASE_IDENTITY_LINK_CONFLICT']
      );

      // The validator is replaced by a removal note, so a reader looking for it can find out
      // where it went rather than concluding it was never there.
      const validate = readSource('utils/validate.ts');
      assert.ok(/REMOVED in Phase A/.test(validate), 'the removal note is gone from validate.ts');
      assert.ok(
        !/export function validateFirebaseUnlink/.test(codeOnly(validate)),
        'the unlink validator is still exported'
      );
    });
  });

  describe('no reachable path can clear firebaseUid', () => {
    it('★ no $unset anywhere under src/ names firebaseUid', () => {
      // The unlink was the only $unset in the codebase; this is the guard that keeps one
      // from coming back the quiet way, as a field added to some other update.
      const offenders = SOURCES.flatMap(({ rel, code }) =>
        updateBlocks(code, '$unset')
          .filter((block) => block.includes('firebaseUid'))
          .map((block) => rel + ': ' + block.slice(0, 120))
      );

      assert.deepEqual(offenders, []);
    });

    it('★ exactly one $set names firebaseUid, and it ATTACHES a verified identity', () => {
      const writers = SOURCES.flatMap(({ rel, code }) =>
        updateBlocks(code, '$set')
          .filter((block) => block.includes('firebaseUid'))
          .map((block) => ({ rel, block }))
      );

      assert.equal(writers.length, 1, 'the number of places that write firebaseUid changed');
      assert.equal(writers[0].rel, 'services/firebaseLink.service.ts');
      // A verified uid, never null and never a client-supplied value.
      assert.ok(
        writers[0].block.includes('firebaseUid: identity.uid'),
        'the single writer does not attach a verified uid'
      );
    });

    it('firebaseUid: null appears only as a QUERY FILTER, at exactly the two reviewed sites', () => {
      // A review trigger rather than a prohibition: 'firebaseUid: null' is legitimate inside
      // a filter meaning "no identity attached yet", and a conditional filter is what makes a
      // second link race-safe. A THIRD site is where an unlink could reappear, so it fails
      // here and is looked at on purpose.
      const sites = SOURCES.filter(({ code }) => code.includes('firebaseUid: null')).map(
        (entry) => entry.rel
      );

      assert.deepEqual(sites.sort(), [
        'services/firebaseLink.service.ts',
        'services/passwordReset.service.ts',
      ]);
    });
  });

  describe('an identity is resolved by uid, never by email', () => {
    it('★ the exchange resolves a user by firebaseUid and by nothing else', () => {
      const code = codeOnly(readSource('services/firebaseAuth.service.ts'));

      assert.ok(
        code.includes('User.findOne({ firebaseUid: identity.uid })'),
        'the uid lookup is gone from the exchange'
      );
      // No User lookup in this module is keyed on an address, so the email cannot become a
      // join key by accident.
      // Every user lookup in this module is inspected through its FILTER, so a lookup
      // keyed on an address cannot hide behind a later mention of one.
      assert.deepEqual(
        [...filterOf(code, 'User.findOne('), ...filterOf(code, 'User.findOneAndUpdate(')].filter(
          (filter) => filter.includes('email')
        ),
        []
      );
    });

    it('★ the registration conflict is detected BEFORE any Business is created', () => {
      const code = codeOnly(readSource('services/firebaseAuth.service.ts'));

      const conflictAt = code.indexOf("'EMAIL_IN_USE'");
      const createAt = code.indexOf('Business.create');

      assert.ok(conflictAt > -1, 'the email conflict is no longer reported');
      assert.ok(createAt > -1, 'the registration path no longer creates a business');
      assert.ok(conflictAt < createAt, 'a business can be created before the conflict is detected');
      // One address check, and it is the registration conflict rather than a resolver.
      assert.deepEqual(filterOf(code, 'User.exists('), ['{ email }']);
    });

    it('the linking service never joins on an email either', () => {
      const code = codeOnly(readSource('services/firebaseLink.service.ts'));

      // Every user lookup in this module is inspected through its FILTER, so a lookup
      // keyed on an address cannot hide behind a later mention of one.
      assert.deepEqual(
        [...filterOf(code, 'User.findOne('), ...filterOf(code, 'User.findOneAndUpdate(')].filter(
          (filter) => filter.includes('email')
        ),
        []
      );
      assert.ok(code.includes('User.findOne({ firebaseUid: identity.uid })'));
    });
  });
});
