// Development/test cleanup utilities — orchestration, with every side effect
// injected through a small "ports" object.
//
// Why ports: the guard rules and the delete/verify sequence are the parts that
// must never be wrong, and testing them against a real database would mean the
// test itself is destructive. Passing `listCollectionNames`, `deleteMany`, etc.
// in as functions lets the whole sequence — including the post-cleanup
// verification — run against in-memory fakes. The functions return a report
// object so a caller can assert on exactly what happened.
//
// The guards still run FIRST, and they run before any port is called, so a
// refused run performs no destructive call at all. `perform*Cleanup` below is
// the whole guarded sequence in one function, which is what the tests exercise
// and what the CLI scripts call.

import { assertCleanupTarget } from './guard.mjs';
import {
  APPROVED_TEST_DATABASE,
  APPROVED_TEST_FIREBASE_PROJECT_ID,
  MONGODB_CLEANUP_TARGETS,
  PRODUCTION_CONFIRM_PHRASE,
  CleanupSafetyError,
  assertConfirmation,
  assertFirebaseProject,
  assertLiveTarget,
  assertNonProductionEnv,
  assertProductionConfirmation,
  assertTargetAllowed,
  assertTargetDatabase,
  isProductionTarget,
  resolveMongodbTarget,
} from './lib.mjs';

/** Raised when cleanup ran but the post-cleanup verification did not pass. */
export class CleanupIncompleteError extends CleanupSafetyError {
  constructor(message) {
    super(message);
    this.name = 'CleanupIncompleteError';
  }
}

const noopLog = () => {};

/**
 * Clear every document in every collection of an already-verified MongoDB
 * database, then verify the result. Does NOT run the guards — `performMongoCleanup`
 * does that; this is the mechanical half.
 *
 * @param {object} ports
 * @param {() => Promise<string[]>} ports.listCollectionNames
 * @param {(name: string) => Promise<number>} ports.countDocuments
 * @param {(name: string) => Promise<number>} ports.deleteMany   resolves to the
 *   number of documents deleted. The CLI adapter normalises the driver's
 *   `{ deletedCount }` result down to that number.
 * @param {(name: string) => Promise<string[]>} ports.listIndexes
 */
export async function clearMongoDatabase({ listCollectionNames, countDocuments, deleteMany, listIndexes, log = noopLog }) {
  const collections = [...(await listCollectionNames())].sort();

  const before = {};
  let totalBefore = 0;
  for (const name of collections) {
    const n = await countDocuments(name);
    before[name] = n;
    totalBefore += n;
    log(`before  ${name} = ${n}`);
  }
  log(`before  TOTAL = ${totalBefore}`);

  let totalDeleted = 0;
  for (const name of collections) {
    const deleted = await deleteMany(name);
    totalDeleted += deleted;
    log(`deleted ${name} = ${deleted}`);
  }
  log(`deleted TOTAL = ${totalDeleted}`);

  const after = {};
  let totalAfter = 0;
  const nonEmpty = [];
  for (const name of collections) {
    const n = await countDocuments(name);
    after[name] = n;
    totalAfter += n;
    log(`after   ${name} = ${n}`);
    if (n !== 0) nonEmpty.push(name);
  }
  log(`after   TOTAL = ${totalAfter}`);

  if (nonEmpty.length > 0) {
    throw new CleanupIncompleteError(
      `cleanup incomplete — these collections still contain documents: ${nonEmpty.join(', ')}`
    );
  }

  for (const name of collections) {
    const indexes = await listIndexes(name);
    if (!Array.isArray(indexes) || indexes.length === 0) {
      throw new CleanupIncompleteError(
        `collection "${name}" has no indexes after cleanup; the database structure was not preserved.`
      );
    }
  }

  return { collections: collections.length, totalBefore, totalDeleted, totalAfter, before, after };
}

/**
 * The fully guarded cleanup of the ONE database the operator named on the command
 * line — the `npm run cleanup -- --target=database` path.
 *
 * The rule is `assertCleanupTarget` in ./guard.mjs, the same one the seeders use:
 * the name must match what the process resolved, it must be a cleanable database,
 * and it must be confirmed by two phrases (three for production). It runs BEFORE
 * `connect` is called, so a refused run never opens a connection at all.
 *
 * `dryRun` stops after counting: it proves what would be deleted without deleting.
 */
export async function performNamedDatabaseCleanup({
  target = 'database',
  database,
  env,
  connect,
  log = noopLog,
  values = process.env,
  dryRun = false,
}) {
  const checked = assertCleanupTarget({ env, target, database, values });

  const { liveName, ports } = await connect(checked.database);
  assertLiveTarget({ requested: checked.database, liveName });
  log(`target database verified: ${checked.database}`);

  if (dryRun) {
    const collections = [...(await ports.listCollectionNames())].sort();
    const counts = {};
    let total = 0;
    for (const name of collections) {
      const n = await ports.countDocuments(name);
      counts[name] = n;
      total += n;
      log(`would delete ${name} = ${n}`);
    }
    log(`DRY RUN — ${collections.length} collection(s), ${total} document(s); nothing was deleted`);
    return { target: checked.database, dryRun: true, collections: collections.length, total, counts };
  }

  const report = await clearMongoDatabase({ ...ports, log });
  return { target: checked.database, dryRun: false, ...report };
}

/**
 * The fully guarded MongoDB cleanup: environment guard, target guard (configured
 * AND live names), then the confirmation phrase, then the mechanical clear.
 * Guards run before any port is touched.
 *
 * Superseded by `performNamedDatabaseCleanup` for the `npm run cleanup` path; kept
 * because the test-database helper and its tests still drive it.
 */
export async function performMongoCleanup({
  nodeEnv,
  configuredName,
  liveName,
  confirmPhrase,
  providedConfirm,
  ports,
  log = noopLog,
  expectedDatabase = APPROVED_TEST_DATABASE,
}) {
  assertNonProductionEnv(nodeEnv);
  const target = assertTargetDatabase({ configuredName, liveName }, expectedDatabase);
  assertConfirmation(providedConfirm, confirmPhrase);
  log(`target database verified: ${target}`);
  return clearMongoDatabase({ ...ports, log });
}

/**
 * Guarded cleanup of ONE explicitly named MongoDB database.
 *
 * The database to clear is passed in (`target`) and is never read from the
 * environment: `connect(target)` must open a connection whose live database name
 * is exactly `target`, and that is verified before anything is deleted. A
 * mismatch — or a connection that reports a blank name — refuses.
 *
 * The environment guard differs by target, and that difference is deliberate:
 *
 *   * a NON-production target (test/dev) requires `NODE_ENV` to be explicitly
 *     non-production, exactly like the single-target command;
 *   * the PRODUCTION target requires the stronger production confirmation phrase
 *     INSTEAD — it is the one command that is allowed to run in production, and
 *     only with the extra phrase.
 */
export async function performMongodbTargetCleanup({
  nodeEnv,
  target,
  confirmPhrase,
  providedConfirm,
  prodConfirmPhrase = PRODUCTION_CONFIRM_PHRASE,
  providedProdConfirm,
  connect,
  log = noopLog,
  targets = MONGODB_CLEANUP_TARGETS,
}) {
  const name = assertTargetAllowed(target, targets);

  if (isProductionTarget(name, targets)) {
    assertProductionConfirmation(providedProdConfirm, prodConfirmPhrase);
  } else {
    assertNonProductionEnv(nodeEnv);
  }

  assertConfirmation(providedConfirm, confirmPhrase);

  const { liveName, ports } = await connect(name);
  assertLiveTarget({ requested: name, liveName });
  log(`target database verified: ${name}`);

  const report = await clearMongoDatabase({ ...ports, log });
  return { target: name, ...report };
}

/**
 * The fully guarded cleanup of several explicitly selected databases, in order.
 *
 * The selection is resolved from an explicit selector (`test`/`dev`/`prod`/`all`)
 * through the hard-coded allowlist — never from `MONGODB_DB_NAME`. If the
 * selection includes production, the production confirmation phrase is required
 * in addition to the per-command phrase. Each database is then cleared with its
 * own guarded `performMongodbTargetCleanup`, so a failure on one stops the run
 * before the next is touched.
 */
export async function performMongodbTargetsCleanup({
  nodeEnv,
  selector,
  confirmPhrase,
  providedConfirm,
  prodConfirmPhrase = PRODUCTION_CONFIRM_PHRASE,
  providedProdConfirm,
  connect,
  log = noopLog,
  targets = MONGODB_CLEANUP_TARGETS,
}) {
  const selected = resolveMongodbTarget(selector, targets);

  // The production phrase is checked ONCE, up front, when the selection contains
  // production — before any database is touched. A selection without production
  // never requires it.
  if (selected.some((name) => isProductionTarget(name, targets))) {
    assertProductionConfirmation(providedProdConfirm, prodConfirmPhrase);
  }

  const reports = [];
  for (const name of selected) {
    reports.push(
      await performMongodbTargetCleanup({
        nodeEnv,
        target: name,
        confirmPhrase,
        providedConfirm,
        prodConfirmPhrase,
        providedProdConfirm,
        connect,
        log,
        targets,
      })
    );
  }
  return reports;
}

/**
 * Delete every Firebase Authentication user, then verify zero remain. Does NOT
 * run the guards — `performFirebaseCleanup` does that.
 *
 * @param {object} ports
 * @param {() => Promise<string[]>} ports.listUserIds
 * @param {(uids: string[]) => Promise<{ successCount: number, failureCount: number, errors: Array }>} ports.deleteUsers
 */
export async function deleteAllFirebaseUsers({ listUserIds, deleteUsers, batchSize = 1000, log = noopLog }) {
  const uids = await listUserIds();
  const before = uids.length;
  log(`before COUNT = ${before}`);

  let deleted = 0;
  let failures = 0;
  for (let i = 0; i < uids.length; i += batchSize) {
    const batch = uids.slice(i, i + batchSize);
    const result = await deleteUsers(batch);
    deleted += result.successCount ?? 0;
    failures += result.failureCount ?? 0;
  }

  const after = (await listUserIds()).length;
  log(`Before: ${before} Deleted: ${deleted} Failures: ${failures} After: ${after}`);

  if (failures > 0 || after !== 0) {
    throw new CleanupIncompleteError(
      `cleanup incomplete — ${after} user(s) remain and ${failures} deletion(s) failed.`
    );
  }

  return { before, deleted, failures, after };
}

/**
 * The fully guarded Firebase cleanup: environment guard, project guard, then the
 * confirmation phrase, then the batch deletion.
 */
export async function performFirebaseCleanup({
  nodeEnv,
  projectId,
  confirmPhrase,
  providedConfirm,
  ports,
  log = noopLog,
  expectedProjectId = APPROVED_TEST_FIREBASE_PROJECT_ID,
}) {
  assertNonProductionEnv(nodeEnv);
  const target = assertFirebaseProject(projectId, expectedProjectId);
  assertConfirmation(providedConfirm, confirmPhrase);
  log(`target Firebase project verified: ${target}`);
  return deleteAllFirebaseUsers({ ...ports, log });
}

export default {
  CleanupIncompleteError,
  clearMongoDatabase,
  performNamedDatabaseCleanup,
  performMongoCleanup,
  performMongodbTargetCleanup,
  performMongodbTargetsCleanup,
  deleteAllFirebaseUsers,
  performFirebaseCleanup,
};