// The audit trail's labels must cover every event the server can record.
//
// WHY THIS EXISTS — a defect found on the device, 2026-10-17. The mobile Audit
// screen kept its own label table, written at Phase 16A and never extended. Every
// event added afterwards rendered as a raw enum: the four session-lifecycle
// actions (Phase 26A), the two password-recovery actions (Phase 26B-2) and the two
// Firebase identity actions (Phase 32H) appeared on screen as `SESSION_CREATED`,
// `PASSWORD_RESET_COMPLETED`, `FIREBASE_IDENTITY_LINK_CONFLICT`, next to human
// labels like "Stock in" — and the `SESSION` entity type showed raw in the badge.
//
// Nothing failed when those actions were added: the server declared them, the
// screen rendered whatever arrived, and a test that does not know the label table
// cannot notice a missing row. This file is that test.
//
// THE TWO PROPERTIES THAT MAKE IT MORE THAN A KEY COUNT:
//  * a label must not EQUAL its key. Adding `SESSION_CREATED: 'SESSION_CREATED'`
//    would satisfy a presence check while leaving the screen exactly as broken as
//    it was on the device — which is why labels are compared, not just keys;
//  * the comparison is exercised with a planted missing action and a planted
//    identical label, so a scan that silently matched nothing cannot pass.
//
// WHERE THE TABLE LIVES, AND WHY IT IS READ AS DATA. `mobile/lib/auditLabels.json`
// is the one table the app renders. It is read here with `readFileSync` rather than
// imported as a module: importing the mobile `.ts` wrapper put a mobile ES module
// into `server/tsconfig.json` and made `npm run typecheck` fail with four
// `verbatimModuleSyntax` errors — a data file cannot collide with the server's
// module settings, and the app imports the very same file, so there is still
// exactly one table. The label *functions* are presentation behaviour and are
// covered by `mobile/__tests__/audit-labels.test.ts`; this guard is about coverage.
//
// It is presentation, so nothing here asserts authorization.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../src/constants/audit.ts';

const LABELS_PATH = new URL('../../mobile/lib/auditLabels.json', import.meta.url);
const table = JSON.parse(readFileSync(LABELS_PATH, 'utf8'));

const ACTION_LABELS = table.actions;
const ENTITY_LABELS = table.entityTypes;

const actions = Object.values(AUDIT_ACTIONS);
const entityTypes = Object.values(AUDIT_ENTITY_TYPES);

/** Keys of the server list that the table does not label. */
function missing(serverKeys, labels) {
  return serverKeys.filter((key) => !Object.prototype.hasOwnProperty.call(labels, key));
}

/** Labels that merely repeat their key — present, and still unreadable. */
function unhumanised(serverKeys, labels) {
  return serverKeys.filter((key) => labels[key] === key);
}

test('the scan is reading both sides', () => {
  // Floors come from the measured tree (31 actions, 9 entity types on 2026-10-17),
  // so a rename that made either side silently empty cannot pass as "all
  // labelled".
  assert.ok(actions.length >= 31, `expected at least 31 actions, found ${actions.length}`);
  assert.ok(entityTypes.length >= 9, `expected at least 9 entity types, found ${entityTypes.length}`);
  // …and the table itself was parsed, not skipped: an unreadable or renamed file
  // must fail loudly here rather than compare two empty objects.
  assert.ok(Object.keys(ACTION_LABELS).length >= 31, 'the action label table did not load');
  assert.ok(Object.keys(ENTITY_LABELS).length >= 9, 'the entity label table did not load');
});

test('★ every audit action has a human label', () => {
  assert.deepEqual(missing(actions, ACTION_LABELS), []);
});

test('★ every audit entity type has a human label', () => {
  assert.deepEqual(missing(entityTypes, ENTITY_LABELS), []);
});

test('★ no label is just the enum repeated back', () => {
  assert.deepEqual(unhumanised(actions, ACTION_LABELS), []);
  assert.deepEqual(unhumanised(entityTypes, ENTITY_LABELS), []);
});

test('every label is a non-empty, trimmed human string', () => {
  // A blank or padded label is present and still wrong on screen, and neither of
  // the checks above would see it.
  for (const [key, label] of Object.entries({ ...ACTION_LABELS, ...ENTITY_LABELS })) {
    assert.equal(typeof label, 'string', `${key} is not a string`);
    assert.ok(label.length > 0, `${key} has an empty label`);
    assert.equal(label.trim(), label, `${key} has leading or trailing whitespace`);
  }
});

test('the table holds nothing the server cannot emit', () => {
  // A stale label is not user-visible, but it is the same drift in the other
  // direction, and it hides the fact that the action was renamed or removed.
  const declared = new Set(actions);
  assert.deepEqual(Object.keys(ACTION_LABELS).filter((key) => !declared.has(key)), []);
  const declaredTypes = new Set(entityTypes);
  assert.deepEqual(Object.keys(ENTITY_LABELS).filter((key) => !declaredTypes.has(key)), []);
});

test('the events that rendered raw on the device are the ones that were missing', () => {
  // These eight are exactly what the phone showed as enums, plus the SESSION badge.
  assert.equal(ACTION_LABELS.SESSION_CREATED, 'Signed in');
  assert.equal(ACTION_LABELS.SESSION_LOGGED_OUT, 'Signed out');
  assert.equal(ACTION_LABELS.SESSION_REVOKED, 'Session ended');
  assert.equal(ACTION_LABELS.SESSIONS_REVOKED_ALL, 'All sessions ended');
  assert.equal(ACTION_LABELS.PASSWORD_RESET_REQUESTED, 'Password reset requested');
  assert.equal(ACTION_LABELS.PASSWORD_RESET_COMPLETED, 'Password reset completed');
  assert.equal(ACTION_LABELS.FIREBASE_IDENTITY_LINKED, 'Sign-in identity linked');
  assert.equal(ACTION_LABELS.FIREBASE_IDENTITY_LINK_CONFLICT, 'Sign-in identity conflict');
  assert.equal(ENTITY_LABELS.SESSION, 'Session');
});

test('the checks can fail — planted gaps and a planted identical label', () => {
  // Both directions of the guard, on fixtures rather than the real table: a
  // missing key is reported, and a key whose label equals itself is reported.
  const server = ['SESSION_CREATED', 'INVENTORY_STOCK_IN'];
  assert.deepEqual(missing(server, { INVENTORY_STOCK_IN: 'Stock in' }), ['SESSION_CREATED']);
  assert.deepEqual(unhumanised(server, { SESSION_CREATED: 'SESSION_CREATED', INVENTORY_STOCK_IN: 'Stock in' }), [
    'SESSION_CREATED',
  ]);
  // …and a complete, humanised table is reported clean, so the helpers are not
  // answering "broken" for everything.
  assert.deepEqual(missing(server, { SESSION_CREATED: 'Signed in', INVENTORY_STOCK_IN: 'Stock in' }), []);
  assert.deepEqual(unhumanised(server, { SESSION_CREATED: 'Signed in', INVENTORY_STOCK_IN: 'Stock in' }), []);
});
