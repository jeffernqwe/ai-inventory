// The read-only witness for `cleanup:account`.
//
// WHY THIS EXISTS. A tenant-scoped cleanup proves the NAMED tenants are empty, and the
// `businessId` filter is what keeps every delete inside them — but nothing in the command
// reads a DIFFERENT tenant. "The other business was untouched" was therefore an argument
// from the code, not a measurement. A witness turns it into one: snapshot an outside
// tenant's data counts and its login/business rows before the run, read them again after,
// and fail the run if any part moved.
//
// WHAT A SNAPSHOT CONTAINS. The data-only teardown counts (the same plan `cleanup:account`
// deletes), plus the fields that make the login and business rows what they are: the user
// id, address, business id, role, status, Firebase linkage, and the business's name and
// status. The Firebase UID is COMPARED but never printed; a failure says "Firebase linkage
// changed" and nothing more.
//
// WHAT IT DOES NOT DO. It does not connect, read, write or delete. The CLI resolves the
// account and counts its tenant; every rule here is a pure function of the values passed in,
// so each refusal is asserted without a database. It also cannot make a witness safe by
// itself: `assertWitnessOutsidePlan` refuses one that resolves to a tenant the cleanup plan
// names, because a witness inside the plan proves nothing.
//
// NOTHING HERE RUNS ON IMPORT.

import { CleanupSafetyError } from './lib.mjs';
import { isEmailAddress, normaliseEmail } from '../seed/lib.mjs';

/**
 * One witness address, or null when the flag is absent.
 *
 * `--witness` is deliberately narrower than `--accounts`: it names an ACCOUNT, and the
 * address is the only thing needed to resolve its tenant. The `address:businessId` form is
 * refused rather than silently ignoring the second field, because a typed id that is not
 * compared is exactly the kind of claim this project refuses elsewhere.
 */
export function parseWitnessAddress(raw) {
  if (raw === undefined) return null;

  const text = String(raw).trim();
  if (!text) {
    throw new CleanupSafetyError('--witness needs an address. Nothing was deleted.');
  }
  if (text.includes(':')) {
    throw new CleanupSafetyError(
      '--witness takes one address only, not address:businessId. The witness is resolved ' +
        'from its own account row, so there is no id to name. Nothing was deleted.',
    );
  }

  const email = normaliseEmail(text);
  if (!isEmailAddress(email)) {
    throw new CleanupSafetyError(
      `--witness "${text}" has no usable address. Nothing was deleted.`,
    );
  }
  return email;
}

/**
 * Refuse a witness that the cleanup can reach.
 *
 * Two accounts in one business resolve to one tenant, so comparing only the address is not
 * enough. Both checks run before the witness is counted or any delete starts.
 */
export function assertWitnessOutsidePlan({ witness, plan }) {
  const email = normaliseEmail(witness?.email);
  const businessId = witness?.businessId == null ? '' : String(witness.businessId);

  if (!businessId) {
    throw new CleanupSafetyError(
      `the witness ${email || '(no address)'} has no business in this database, so there is ` +
        'nothing to prove. Nothing was deleted.',
    );
  }

  for (const entry of plan ?? []) {
    if (normaliseEmail(entry?.email) === email) {
      throw new CleanupSafetyError(
        `--witness=${email} is in the cleanup plan. A witness must be a tenant this run is ` +
          'not emptying. Nothing was deleted.',
      );
    }
    if (entry?.businessId != null && String(entry.businessId) === businessId) {
      throw new CleanupSafetyError(
        `the witness ${email} resolves to the same business ${businessId} as ` +
          `${normaliseEmail(entry.email)}, which is in the cleanup plan. The witness must be ` +
          'a tenant this run is not emptying. Nothing was deleted.',
      );
    }
  }

  return true;
}

/** The stable part of a witness: the login row, the business row, and the data counts. */
export function witnessSnapshot({ user, business, total, counts }) {
  const sortedCounts = Object.fromEntries(
    Object.entries(counts ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, count]) => [name, Number(count) || 0]),
  );

  return {
    userId: String(user?._id ?? ''),
    email: normaliseEmail(user?.email),
    businessId: String(user?.businessId ?? ''),
    businessName: business?.name ?? null,
    businessStatus: business?.status ?? null,
    role: user?.role ?? null,
    status: user?.status ?? null,
    firebaseUid: user?.firebaseUid ?? null,
    total: Number(total) || 0,
    counts: sortedCounts,
  };
}

/**
 * Every difference between two snapshots, in human terms.
 *
 * The UID itself is never included: a failure is printed to an operator's terminal and a
 * Firebase UID identifies a person's login. "Firebase linkage changed" is the whole fact
 * needed to know the witness is no longer the same account.
 */
export function witnessDifferences(before, after) {
  const changes = [];
  const same = (key) => before?.[key] === after?.[key];

  if (!same('userId')) changes.push('the login row was replaced');
  if (!same('email')) changes.push(`email changed from ${before?.email} to ${after?.email}`);
  if (!same('businessId')) {
    changes.push(`business id changed from ${before?.businessId} to ${after?.businessId}`);
  }
  if (!same('businessName')) {
    changes.push(
      `business name changed from "${before?.businessName ?? '(none)'}" to ` +
        `"${after?.businessName ?? '(none)'}"`,
    );
  }
  if (!same('businessStatus')) {
    changes.push(
      `business status changed from ${before?.businessStatus ?? '(none)'} to ` +
        `${after?.businessStatus ?? '(none)'}`,
    );
  }
  if (!same('role')) changes.push(`role changed from ${before?.role ?? '(none)'} to ${after?.role ?? '(none)'}`);
  if (!same('status')) {
    changes.push(`account status changed from ${before?.status ?? '(none)'} to ${after?.status ?? '(none)'}`);
  }
  if (!same('firebaseUid')) changes.push('Firebase linkage changed');
  if (!same('total')) {
    changes.push(`document total changed from ${before?.total ?? 0} to ${after?.total ?? 0}`);
  }

  const names = new Set([
    ...Object.keys(before?.counts ?? {}),
    ...Object.keys(after?.counts ?? {}),
  ]);
  for (const name of [...names].sort()) {
    const from = Number(before?.counts?.[name]) || 0;
    const to = Number(after?.counts?.[name]) || 0;
    if (from !== to) changes.push(`${name}: ${from} → ${to}`);
  }

  return changes;
}

/**
 * Fail when the witness is not byte-for-byte the tenant it was before the run.
 *
 * `context` names what was happening ("the cleanup" or "the cleanup preview") so the
 * message does not claim a deletion during a dry run.
 */
export function assertWitnessUnchanged({ before, after, context = 'the cleanup' }) {
  const changes = witnessDifferences(before, after);
  if (!changes.length) return true;

  throw new CleanupSafetyError(
    `the witness tenant ${before?.email ?? '(no address)'} changed during ${context}: ` +
      `${changes.join('; ')}. The run cannot prove that tenant was untouched — inspect before ` +
      're-running anything.',
  );
}

export default {
  parseWitnessAddress,
  assertWitnessOutsidePlan,
  witnessSnapshot,
  witnessDifferences,
  assertWitnessUnchanged,
};
