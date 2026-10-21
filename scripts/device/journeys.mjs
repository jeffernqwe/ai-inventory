/**
 * The journeys `scripts/device/run.mjs` can drive on a real phone.
 *
 * Each step is ONE verb (see `STEP_VERBS` in `lib.mjs`), so the table is checkable as data:
 * `validateJourneys` rejects a misspelt or doubled verb instead of letting the step quietly do
 * nothing. `server/test/device-harness.test.mjs` runs that check over this file on every CI run.
 *
 * WHAT A JOURNEY IS FOR. These replace the hand-written adb tap sequences a device pass used to be:
 * the same screens, in the same order, asserted from the accessibility tree, with screenshots and a
 * report left behind. They are not a substitute for judgement — a journey cannot tell you a screen
 * looks wrong, only that its text is where it should be.
 *
 * THE ROUTES ARE DEEP LINKS the app already supports (`inventoryai://<route>`), which is why a run
 * needs no coordinate guessing: navigation is by route, and every interaction is by the label a
 * person would read.
 */

/** The read-only walk: every main screen opens and names itself. No writes, so it is safe to run
 *  against any tenant at any time. */
const smoke = {
  id: 'smoke',
  summary: 'Every main screen opens and renders its own heading (read-only).',
  steps: [
    { open: 'inventoryai://dashboard' },
    { expect: 'Overview' },
    { open: 'inventoryai://inventory' },
    { expect: 'Inventory' },
    { open: 'inventoryai://products' },
    { expect: 'Products' },
    { open: 'inventoryai://purchase-orders' },
    { expect: 'Purchase Orders' },
    { open: 'inventoryai://suppliers' },
    { expect: 'Suppliers' },
    { open: 'inventoryai://restock' },
    { expect: 'Restock' },
    { open: 'inventoryai://ai' },
    { expect: 'AI Assistant' },
    { open: 'inventoryai://audit' },
    { expect: 'Audit' },
    { shot: 'smoke-final' },
  ],
};

/** The label path, without paper: print → the PDF the app writes → decode its bars.
 *  Needs `--product=<id>` for a product whose barcode is a 13-digit EAN-13, and a debuggable
 *  (development) build so the app's own cache can be read. */
const label = {
  id: 'label',
  summary: 'Share a product label as a PDF and decode its barcode from the bytes (needs --product).',
  steps: [
    { open: 'inventoryai://products/{{product}}' },
    { expect: 'Barcode label' },
    // The code the app displays is the expectation the decode is held to — read off the screen
    // rather than supplied, so the check compares the app with itself.
    { readCode: true },
    { tap: 'Share PDF' },
    { decodeLabel: true },
    { key: 'BACK' },
    { shot: 'label-done' },
  ],
};

/** Writes, so it is opt-in and it leaves a draft behind for a person to receive. It exercises the
 *  form a device pass used to fill by hand: supplier, location, one line, create. */
const draft = {
  id: 'draft',
  summary: 'Create one draft purchase order from the phone (writes: leaves a draft behind).',
  steps: [
    { open: 'inventoryai://purchase-orders/new' },
    { expect: 'New Purchase Order' },
    { tap: 'Choose a supplier' },
    { tapFirst: 'Supplier' },
    { tap: 'Where stock will land' },
    { tapFirst: 'Receiving location' },
    { tap: 'Add line' },
    { tap: 'Choose a product' },
    { tapFirst: 'Product 1' },
    { type: { value: '1', into: 'Quantity ordered' } },
    { tap: 'Create draft order' },
    { expect: 'Draft PO-' },
    // Dismiss the app's own confirmation. A dialog left open covers the NEXT journey's first
    // screen, which is how a clean `--all` run once failed on a journey it had nothing to do with.
    { tap: 'OK' },
    { shot: 'draft-created' },
  ],
};

export const JOURNEYS = Object.freeze([smoke, label, draft]);

/** Journeys that write to the tenant, and are therefore never part of `--all`. */
export const WRITE_JOURNEYS = Object.freeze(['draft']);
