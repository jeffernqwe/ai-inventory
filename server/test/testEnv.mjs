// Phase 07F (M9) — test classification + database-availability policy.
//
// M9 problem: DB-backed suites used `{ skip: !dbOk }`, so when MongoDB was
// unreachable they silently skipped and `node --test` still exited 0 — a false
// green. This module makes the policy explicit and fail-loud:
//
//   npm test (TEST_MODE=full, default)  — the full suite. DB-required suites
//        that cannot reach MongoDB become ONE failing test with an actionable
//        message. A full run is never silently green while DB coverage is down.
//   npm run test:unit (TEST_MODE=unit)  — DB-independent tests only. DB-required
//        suites become ONE skipped test carrying a visible reason; the run never
//        waits on MongoDB.
//   npm run test:db   (TEST_MODE=db)    — DB-required tests only (still fails
//        loudly if MongoDB is unreachable). DB-independent suites become ONE
//        skipped test carrying a visible reason.
//
// Suites declare their class through dbSuite() / unitSuite() below so the runner
// never silently drops coverage: an out-of-mode suite is a visible skipped test,
// and a DB-required suite that cannot reach MongoDB in a mode that needs it is a
// visible failure.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

export const VALID_MODES = ['full', 'unit', 'db'];

const rawMode = String(process.env.TEST_MODE || 'full').trim().toLowerCase();
export const TEST_MODE = VALID_MODES.includes(rawMode) ? rawMode : 'full';

if (rawMode !== TEST_MODE) {
  console.error(
    `[testEnv] Ignoring unknown TEST_MODE "${process.env.TEST_MODE}" — expected one of ${VALID_MODES.join(', ')}. Running in "full" mode.`
  );
}

/** Actionable, secret-free message shown when a DB-required suite cannot run. */
export const DB_UNAVAILABLE_MESSAGE =
  'This DB-backed test could not run because MongoDB is unreachable. ' +
  'Fix MongoDB connectivity and re-run: `npm test` (full suite). ' +
  'DB-independent tests alone: `npm run test:unit`. DB-backed tests alone: `npm run test:db`.';

const DB_SKIP_REASON =
  'DB-backed suite intentionally skipped because TEST_MODE=unit. Run `npm run test:db` or `npm test` to exercise it.';
const UNIT_SKIP_REASON =
  'DB-independent suite intentionally skipped because TEST_MODE=db. Run `npm test` to exercise it.';

/** One visible skipped test (never a silent describe-level skip) per out-of-mode suite. */
function registerModeSkip(name, reason) {
  describe(name, () => {
    it('intentionally skipped in this mode', { skip: reason }, () => {});
  });
}

/**
 * Declare a suite of DB-REQUIRED tests.
 *
 *  * unit mode            -> suite is skipped (visible skipped test + reason).
 *  * full / db + dbOk     -> suite runs exactly as `describe(name, fn)`.
 *  * full / db + !dbOk    -> suite FAILS loudly (one failing test): MongoDB is
 *                            required here, so skipping would be a false green.
 */
export function dbSuite(name, dbOk, fn) {
  if (typeof dbOk !== 'boolean') {
    throw new Error(`dbSuite("${name}"): expected a boolean dbOk as the 2nd argument`);
  }
  if (TEST_MODE === 'unit') {
    registerModeSkip(name, DB_SKIP_REASON);
    return;
  }
  if (!dbOk) {
    describe(name, () => {
      it('requires MongoDB but the database is unreachable', () => {
        assert.fail(DB_UNAVAILABLE_MESSAGE);
      });
    });
    return;
  }
  describe(name, fn);
}

/**
 * Declare a suite of DB-INDEPENDENT tests.
 *
 *  * db mode -> suite is skipped (visible skipped test + reason), so `test:db`
 *               reports only DB-backed coverage.
 *  * full / unit -> suite runs exactly as `describe(name, fn)`.
 */
export function unitSuite(name, fn) {
  if (TEST_MODE === 'db') {
    registerModeSkip(name, UNIT_SKIP_REASON);
    return;
  }
  describe(name, fn);
}
