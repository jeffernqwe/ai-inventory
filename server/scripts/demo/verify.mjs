// The pure half of `npm run verify:demo`.
//
// The script reads rows and prints them; these two rules decide whether what it read is
// a usable seeded tenant. Keeping them here means the decisions are asserted on values
// in `DEMO1-demo-tenant.test.mjs` without a connection, and the script cannot quietly
// stop applying one of them.
//
// NOTHING RUNS ON IMPORT.

import { CODE_MODES } from '../seed/lib.mjs';
import { ean13CheckDigit } from '../../src/utils/internalBarcode.ts';

/**
 * Every movement must satisfy the arithmetic ITS OWN type implies.
 *
 * TRANSFER is deliberately included: the ledger stores TWO rows for one transfer, one
 * per leg, each with a positive quantity and a signed change. The old check treated
 * every transfer as an "unrecognised type", so a tenant with valid transfers could never
 * pass verification. An adjustment uses the absolute change, because its direction is
 * already carried by the sign of `newQuantity - previousQuantity`.
 */
export function ledgerViolations(transactions) {
  const rows = transactions ?? [];
  const bad = { STOCK_IN: 0, STOCK_OUT: 0, ADJUSTMENT: 0, TRANSFER: 0, other: 0 };

  for (const t of rows) {
    if (t.type === 'STOCK_IN') {
      if (t.newQuantity !== t.previousQuantity + t.quantity) bad.STOCK_IN += 1;
    } else if (t.type === 'STOCK_OUT') {
      if (t.newQuantity !== t.previousQuantity - t.quantity) bad.STOCK_OUT += 1;
    } else if (t.type === 'ADJUSTMENT') {
      if (t.quantity !== Math.abs(t.newQuantity - t.previousQuantity)) bad.ADJUSTMENT += 1;
    } else if (t.type === 'TRANSFER') {
      if (t.quantity !== Math.abs(t.newQuantity - t.previousQuantity)) bad.TRANSFER += 1;
    } else {
      bad.other += 1;
    }
  }

  const negative = rows.filter((t) => t.newQuantity < 0 || t.previousQuantity < 0).length;
  const badTotal = Object.values(bad).reduce((sum, count) => sum + count, 0);
  return { bad, negative, badTotal };
}

/**
 * A tenant with nothing in it cannot be called verified.
 *
 * The old verdict only counted violations, so an empty (or product-less) tenant produced
 * zero violations and printed SUCCESS. These are not row defects — there is simply
 * nothing the seeder claims that can be checked — so they get their own sentence and the
 * caller's FAILED exit code.
 */
export function tenantEmptinessProblem(counts) {
  const total = Object.values(counts ?? {}).reduce((sum, count) => sum + (Number(count) || 0), 0);
  if (total === 0) {
    return 'the tenant is empty — it holds no seeded documents';
  }
  if ((Number(counts?.products) || 0) === 0) {
    return 'the tenant holds no products — the seeded catalogue is missing';
  }
  return null;
}

/**
 * A positive whole number for `--expect-products`, or null when it is absent.
 *
 * It is optional: verification without an expected size still checks ledger arithmetic,
 * references and emptiness. With it, the command can say the seed produced the size that
 * was asked for, instead of only saying the tenant is not empty.
 */
export function parseExpectedProducts(raw) {
  if (raw === undefined) return null;
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) {
    throw new Error(`--expect-products must be a whole number, not "${text}". Nothing was read.`);
  }
  const value = Number.parseInt(text, 10);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('--expect-products must be a whole number greater than 0. Nothing was read.');
  }
  return value;
}

/**
 * The expected SKU/barcode mode, or null when the caller did not name one.
 *
 * The vocabulary is the seeder's own `CODE_MODES`, so a mode the seed accepts cannot become a
 * mode the verifier does not know. This is an EXPECTATION, not a claim: the verifier still reads
 * every product and classifies what it found.
 */
export function parseExpectedCodeMode(raw) {
  if (raw === undefined || raw === null) return null;
  const text = String(raw).trim().toLowerCase();
  if (!CODE_MODES.includes(text)) {
    throw new Error(
      `--expect-codes must be both, none, sku or barcode, not "${text}". Nothing was read.`,
    );
  }
  return text;
}

/** The human label for a mode. `sku` means SKU only, never "both". */
export function codeModeLabel(mode) {
  if (mode === 'sku') return 'SKU only';
  if (mode === 'barcode') return 'barcode only';
  if (mode === 'mixed') return 'MIXED';
  return mode === 'empty' ? 'empty' : mode;
}

/**
 * Turn four database counts into the four disjoint combinations and one mode.
 *
 * `sku` is every product carrying a non-empty SKU, including products that also carry a
 * barcode; `both` is the overlap, so the disjoint SKU-only count is `sku - both`. The same
 * arithmetic makes `neither` positive; a negative result means the counts cannot describe one
 * tenant and is refused rather than printed.
 */
export function classifyCodeCoverage({ total, sku, barcode, both }) {
  const values = { total, sku, barcode, both };
  for (const [name, value] of Object.entries(values)) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`code coverage ${name} must be a non-negative whole number. Nothing was read.`);
    }
  }
  if (both > sku || both > barcode || sku > total || barcode > total) {
    throw new Error('code coverage counts cannot exceed the total or the overlapping both count. Nothing was read.');
  }
  const skuOnly = sku - both;
  const barcodeOnly = barcode - both;
  const neither = total - sku - barcode + both;
  if (neither < 0) {
    throw new Error('code coverage counts cannot describe one tenant: SKU plus barcode exceeds total. Nothing was read.');
  }

  let mode = 'mixed';
  if (total === 0) mode = 'empty';
  else if (both === total) mode = 'both';
  else if (sku === total) mode = 'sku';
  else if (barcode === total) mode = 'barcode';
  else if (neither === total) mode = 'none';

  return { total, withSku: sku, withBarcode: barcode, both, skuOnly, barcodeOnly, neither, mode };
}

/** The one line the verifier prints, with the expectation named when one was supplied. */
export function formatCodeCoverage(coverage, expectedMode = null) {
  const expected = expectedMode ? ` (expected ${codeModeLabel(expectedMode)})` : '';
  return (
    `Codes    : ${coverage.both.toLocaleString()} both, ` +
    `${coverage.skuOnly.toLocaleString()} SKU only, ` +
    `${coverage.barcodeOnly.toLocaleString()} barcode only, ` +
    `${coverage.neither.toLocaleString()} neither — ${codeModeLabel(coverage.mode)}${expected}`
  );
}

/**
 * True when a stored value is a 13-digit EAN-13 with the correct mod-10 check digit.
 *
 * This is the SAME check the app uses when it issues an internal barcode. A 12-digit UPC-A is
 * deliberately not treated as EAN-13 here: the report counts it as non-EAN-13 rather than
 * pretending it was checked. A 13-digit value with a wrong final digit is the defect this
 * function exists to find.
 */
export function isValidEan13(value) {
  const text = typeof value === 'string' ? value : '';
  return /^\d{13}$/.test(text) && ean13CheckDigit(text.slice(0, 12)) === Number(text[12]);
}

/**
 * Count barcode health from the values the products actually store.
 *
 * `present` counts non-empty strings. `valid` and `invalid` count 13-digit values with a
 * correct or wrong check digit; `notEan13` counts every other string, which is reported but
 * never fails a run by itself (a product may legitimately carry a manufacturer code that is
 * not an EAN-13). Duplicate values are counted separately, with `duplicateRows` naming how
 * many extra products share an already-seen value.
 */
export function classifyBarcodeHealth(barcodes) {
  if (!Array.isArray(barcodes)) {
    throw new Error('barcode health needs an array of stored barcode strings. Nothing was read.');
  }

  const counts = new Map();
  let present = 0;
  let valid = 0;
  let invalid = 0;
  let notEan13 = 0;

  for (const value of barcodes) {
    if (typeof value !== 'string' || value === '') continue;
    present += 1;
    counts.set(value, (counts.get(value) ?? 0) + 1);

    if (!/^\d{13}$/.test(value)) {
      notEan13 += 1;
    } else if (isValidEan13(value)) {
      valid += 1;
    } else {
      invalid += 1;
    }
  }

  let duplicateValues = 0;
  let duplicateRows = 0;
  for (const count of counts.values()) {
    if (count > 1) {
      duplicateValues += 1;
      duplicateRows += count - 1;
    }
  }

  return { present, valid, invalid, notEan13, duplicateValues, duplicateRows };
}

/** The barcode-health line, printed beside the presence line on every account. */
export function formatBarcodeHealth(health) {
  const checkDigit = health.invalid === 1 ? 'check digit' : 'check digits';
  const duplicateValue = health.duplicateValues === 1 ? 'value' : 'values';
  return (
    `Barcodes : ${health.present.toLocaleString()} present — ` +
    `${health.valid.toLocaleString()} valid EAN-13, ` +
    `${health.invalid.toLocaleString()} invalid ${checkDigit}, ` +
    `${health.duplicateValues.toLocaleString()} duplicate ${duplicateValue}, ` +
    `${health.notEan13.toLocaleString()} non-EAN-13`
  );
}

/** The failure sentence for barcode defects, or null when the barcodes are healthy. */
export function barcodeHealthProblem(health) {
  if (!health) return null;
  const problems = [];

  if (health.invalid > 0) {
    const one = health.invalid === 1;
    problems.push(
      `${health.invalid.toLocaleString()} barcode${one ? '' : 's'} ` +
        `${one ? 'carries' : 'carry'} an invalid EAN-13 check digit`,
    );
  }
  if (health.duplicateValues > 0) {
    const one = health.duplicateValues === 1;
    problems.push(
      `${health.duplicateValues.toLocaleString()} barcode value${one ? '' : 's'} ` +
        `${one ? 'is' : 'are'} shared by ${health.duplicateRows.toLocaleString()} extra ` +
        `product row${health.duplicateRows === 1 ? '' : 's'}`,
    );
  }

  return problems.length ? problems.join('; ') : null;
}

/** Null when the observed mode is the expected one, or when no mode was named. */
export function codeCoverageProblem(coverage, expectedMode) {
  if (!expectedMode || coverage.total === 0 || coverage.mode === expectedMode) return null;
  return (
    `code coverage is ${codeModeLabel(coverage.mode)}, expected ${codeModeLabel(expectedMode)} — ` +
    `${coverage.total.toLocaleString()} products: ` +
    `${coverage.both.toLocaleString()} both, ` +
    `${coverage.skuOnly.toLocaleString()} SKU only, ` +
    `${coverage.barcodeOnly.toLocaleString()} barcode only, ` +
    `${coverage.neither.toLocaleString()} neither`
  );
}

/**
 * `address[:products][:codes=both|none|sku|barcode],…` for one `verify:demo` run.
 *
 * The size and the code mode are optional per entry. `defaultExpectedProducts` and
 * `defaultExpectedCodes` fill what an entry omits; an entry's own value wins. Either optional
 * field may be omitted, so `address:codes=both` checks the mode without asserting a size. The
 * address is not validated here — the CLI owns `normaliseEmail` / `isEmailAddress`, and this pure
 * function stays importable without a database or Firebase configuration.
 */
export function parseVerificationAccounts(
  raw,
  defaultExpectedProducts = null,
  defaultExpectedCodes = null,
) {
  const entries = String(raw ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (!entries.length) {
    throw new Error('--accounts names no addresses. Nothing was read.');
  }

  return entries.map((entry) => {
    const parts = entry.split(':').map((part) => part.trim());
    if (parts.length < 1 || parts.length > 3 || !parts[0]) {
      throw new Error(
        `--accounts entry "${entry}" must be address[:products][:codes=both|none|sku|barcode]. Nothing was read.`,
      );
    }

    let expectedProducts = defaultExpectedProducts;
    let expectedCodes = defaultExpectedCodes;
    let sizeSeen = false;
    let codesSeen = false;

    for (const part of parts.slice(1)) {
      const codeMatch = /^codes=(.*)$/i.exec(part);
      if (codeMatch) {
        if (codesSeen) {
          throw new Error(`--accounts entry "${entry}" carries more than one codes= field. Nothing was read.`);
        }
        expectedCodes = parseExpectedCodeMode(codeMatch[1]);
        codesSeen = true;
        continue;
      }

      if (sizeSeen) {
        throw new Error(
          `--accounts entry "${entry}" must be address[:products][:codes=both|none|sku|barcode]. Nothing was read.`,
        );
      }
      if (!/^\d+$/.test(part) && part !== '') {
        throw new Error(
          `--accounts entry "${entry}" must be address[:products][:codes=both|none|sku|barcode]. Nothing was read.`,
        );
      }
      expectedProducts = parseExpectedProducts(part);
      sizeSeen = true;
    }

    return { email: parts[0], expectedProducts, expectedCodes };
  });
}
