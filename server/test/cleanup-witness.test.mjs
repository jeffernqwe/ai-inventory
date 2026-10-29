/**
 * `cleanup:account --witness=` — the unrelated-tenant proof, DB-FREE.
 *
 * WHY THIS EXISTS. A scoped cleanup proves the named tenants are empty, but nothing in the
 * command reads a DIFFERENT tenant, so "the other business was untouched" was an argument
 * from the `businessId` filter rather than a measurement. The witness is the measurement:
 * capture one outside tenant's data counts and its login/business rows before the run, read
 * them again after, and fail the run if any part moved.
 *
 * WHAT THIS PINS.
 *
 *  * A witness must be a real address, and `--witness` takes an address only — not the
 *    `address:businessId` form `--accounts` accepts.
 *  * A witness that names a tenant in the cleanup plan is refused. The proof must come from
 *    a tenant the plan cannot reach.
 *  * The snapshot includes the data counts AND the login fields (`firebaseUid`, role, status)
 *    and the business row. A changed count, a replaced login row or a changed Firebase link
 *    is a failure, not a detail.
 *  * The CLI resolves and snapshots the witness before its first delete, and re-checks it
 *    before printing SUCCESS.
 *
 * The module is imported lazily so a missing implementation fails each case with a clear
 * assertion rather than a module-load crash.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL(`../scripts/${name}`, import.meta.url), 'utf8');

async function witnessModule() {
  try {
    return await import('../scripts/cleanup/witness.mjs');
  } catch (err) {
    assert.fail(`the witness module does not exist yet: ${err?.code ?? err?.message ?? err}`);
  }
}

const BUSINESS = '6ae15d1b6f2be6b817771e97';
const OTHER_BUSINESS = '6ae15dc16f2be6b817771e9c';

const USER = {
  _id: 'user-1',
  email: 'Witness@Example.com',
  businessId: BUSINESS,
  role: 'OWNER',
  status: 'ACTIVE',
  firebaseUid: 'firebase-uid-1',
};

const BUSINESS_ROW = { name: 'Witness Co', status: 'ACTIVE' };

describe('cleanup:account — the witness address', () => {
  it('is optional, normalised, and refused when it is not one address', async () => {
    const { parseWitnessAddress } = await witnessModule();

    assert.equal(parseWitnessAddress(undefined), null);
    assert.equal(parseWitnessAddress('  Witness@Example.COM '), 'witness@example.com');
    assert.throws(() => parseWitnessAddress(''), /--witness needs an address/);
    assert.throws(() => parseWitnessAddress('   '), /--witness needs an address/);
    assert.throws(() => parseWitnessAddress('not-an-address'), /has no usable address/);
    assert.throws(
      () => parseWitnessAddress(`witness@example.com:${BUSINESS}`),
      /address only/,
      'the witness flag must not accept the --accounts address:businessId form',
    );
  });
});

describe('cleanup:account — a witness must be outside the plan', () => {
  const plan = [
    { email: 'a@example.com', businessId: BUSINESS },
    { email: 'b@example.com', businessId: OTHER_BUSINESS },
  ];

  it('refuses the same address, even with different casing', async () => {
    const { assertWitnessOutsidePlan } = await witnessModule();

    assert.throws(
      () =>
        assertWitnessOutsidePlan({
          witness: { email: 'A@Example.com', businessId: 'different-business' },
          plan,
        }),
      /in the cleanup plan/,
    );
  });

  it('refuses a different account that resolves to a tenant in the plan', async () => {
    const { assertWitnessOutsidePlan } = await witnessModule();

    assert.throws(
      () =>
        assertWitnessOutsidePlan({
          witness: { email: 'member@example.com', businessId: BUSINESS },
          plan,
        }),
      /same business/,
    );
  });

  it('accepts a tenant the plan does not name', async () => {
    const { assertWitnessOutsidePlan } = await witnessModule();

    assert.doesNotThrow(() =>
      assertWitnessOutsidePlan({
        witness: { email: 'witness@example.com', businessId: 'a-third-business' },
        plan,
      }),
    );
  });

  it('refuses a witness with no tenant, because there is nothing to prove', async () => {
    const { assertWitnessOutsidePlan } = await witnessModule();

    assert.throws(
      () =>
        assertWitnessOutsidePlan({
          witness: { email: 'witness@example.com', businessId: null },
          plan,
        }),
      /has no business/,
    );
  });
});

describe('cleanup:account — the witness snapshot', () => {
  it('captures the data counts and the login and business fields', async () => {
    const { witnessSnapshot } = await witnessModule();

    const snapshot = witnessSnapshot({
      user: USER,
      business: BUSINESS_ROW,
      total: 5,
      counts: { products: 2, inventory: 3 },
    });

    assert.deepEqual(snapshot, {
      userId: 'user-1',
      email: 'witness@example.com',
      businessId: BUSINESS,
      businessName: 'Witness Co',
      businessStatus: 'ACTIVE',
      role: 'OWNER',
      status: 'ACTIVE',
      firebaseUid: 'firebase-uid-1',
      total: 5,
      counts: { inventory: 3, products: 2 },
    });
  });

  it('is unchanged only when every field and count is identical', async () => {
    const { witnessSnapshot, assertWitnessUnchanged } = await witnessModule();
    const before = witnessSnapshot({
      user: USER,
      business: BUSINESS_ROW,
      total: 5,
      counts: { products: 2, inventory: 3 },
    });
    const after = witnessSnapshot({
      user: { ...USER },
      business: { ...BUSINESS_ROW },
      total: 5,
      counts: { inventory: 3, products: 2 },
    });

    assert.doesNotThrow(() =>
      assertWitnessUnchanged({ before, after, context: 'the cleanup' }),
    );
  });

  it('fails when a data count changed, and names the collection', async () => {
    const { witnessSnapshot, assertWitnessUnchanged } = await witnessModule();
    const before = witnessSnapshot({
      user: USER,
      business: BUSINESS_ROW,
      total: 5,
      counts: { products: 2, inventory: 3 },
    });
    const after = witnessSnapshot({
      user: USER,
      business: BUSINESS_ROW,
      total: 4,
      counts: { products: 1, inventory: 3 },
    });

    assert.throws(
      () => assertWitnessUnchanged({ before, after, context: 'the cleanup' }),
      /products: 2 → 1/,
    );
  });

  it('fails when the login row, business row or Firebase linkage changed', async () => {
    const { witnessSnapshot, assertWitnessUnchanged } = await witnessModule();
    const base = witnessSnapshot({
      user: USER,
      business: BUSINESS_ROW,
      total: 5,
      counts: { products: 2, inventory: 3 },
    });

    for (const [afterUser, afterBusiness, expected] of [
      [{ ...USER, status: 'DISABLED' }, BUSINESS_ROW, /account status changed/],
      [{ ...USER, businessId: OTHER_BUSINESS }, BUSINESS_ROW, /business id changed/],
      [{ ...USER, firebaseUid: 'firebase-uid-2' }, BUSINESS_ROW, /Firebase linkage changed/],
      [USER, { ...BUSINESS_ROW, status: 'INACTIVE' }, /business status changed/],
      [USER, { ...BUSINESS_ROW, name: 'Renamed Co' }, /business name changed/],
    ]) {
      const after = witnessSnapshot({
        user: afterUser,
        business: afterBusiness,
        total: 5,
        counts: { products: 2, inventory: 3 },
      });
      assert.throws(
        () => assertWitnessUnchanged({ before: base, after, context: 'the cleanup' }),
        expected,
      );
    }
  });

  it('never prints a Firebase uid in the failure', async () => {
    const { witnessSnapshot, assertWitnessUnchanged } = await witnessModule();
    const before = witnessSnapshot({
      user: USER,
      business: BUSINESS_ROW,
      total: 5,
      counts: { products: 2, inventory: 3 },
    });
    const after = witnessSnapshot({
      user: { ...USER, firebaseUid: 'firebase-uid-2' },
      business: BUSINESS_ROW,
      total: 5,
      counts: { products: 2, inventory: 3 },
    });

    assert.throws(
      () => assertWitnessUnchanged({ before, after, context: 'the cleanup' }),
      (err) => {
        assert.match(err.message, /Firebase linkage changed/);
        assert.equal(err.message.includes('firebase-uid-1'), false);
        assert.equal(err.message.includes('firebase-uid-2'), false);
        return true;
      },
    );
  });
});

describe('cleanup:account — the CLI wires the witness before and after the delete', () => {
  const source = read('cleanup-accounts.mjs');

  it('accepts --witness=, parses it, and resolves it before the first delete', () => {
    assert.match(source, /--witness=/);
    assert.match(source, /parseWitnessAddress/);
    assert.match(source, /assertWitnessOutsidePlan/);

    const witnessLookup = source.indexOf('resolveWitness');
    const firstDelete = source.indexOf('clearTenantData([');
    assert.ok(witnessLookup > -1, 'the cleanup never resolves a witness');
    assert.ok(firstDelete > -1, 'the cleanup no longer deletes tenant data');
    assert.ok(witnessLookup < firstDelete, 'the witness is resolved after a delete has begun');
  });

  it('re-checks the witness before printing SUCCESS', () => {
    const witnessCheck = source.lastIndexOf('assertWitnessUnchanged');
    const finalSuccess = source.indexOf("console.log('Result   : SUCCESS')");
    assert.ok(witnessCheck > -1, 'the cleanup never checks the witness after the delete');
    assert.ok(finalSuccess > -1, 'the cleanup no longer prints SUCCESS');
    assert.ok(witnessCheck < finalSuccess, 'SUCCESS is printed before the witness is re-checked');
    assert.match(source, /Witness {2}: unchanged/);
  });

  it('does not let the witness become a second deletion target', () => {
    assert.equal(
      /clearTenantData\(\[[^\]]*witness/i.test(source),
      false,
      'the witness tenant is passed to clearTenantData',
    );
    assert.match(source, /cannot be the tenant this run is emptying/);
  });
});
