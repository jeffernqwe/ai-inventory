/**
 * Internal (business-issued) EAN-13 barcodes — Phase 12D.
 *
 * A product that has no manufacturer barcode receives one of these on the
 * existing Product.barcode field so the Phase 12A lookup and Phase 12B/C
 * scanner can treat it exactly like any other barcode. No separate barcode
 * model — the code is just an EAN-13 value the business generated itself.
 *
 * Format: GS1 "restricted distribution" prefix 2, i.e. 2000000000000 …
 * 2999999999999 — the standard range for internally issued item numbers.
 * 12 payload digits + the standard mod-10 EAN check digit = 13 digits, which
 * EAN-13 readers (including the Phase 12B scanner) decode natively.
 *
 * The payload is derived deterministically from the product's ObjectId (hex →
 * BigInt mod 10^11, zero-padded after the prefix), so the same product always
 * maps to the same base code. When that code is already taken within the
 * business the candidate steps +1 — still deterministic, bounded — and the
 * partial unique (businessId, barcode) index remains the final authority. These
 * helpers are pure (no models); the caller owns uniqueness checks.
 */

const INTERNAL_PREFIX = '2'; // GS1 restricted-distribution prefix
const PAYLOAD_DIGITS = 11; // digits after the prefix (12-digit payload total)
const PAYLOAD_RANGE = 10n ** 11n; // 11 digits of numeric space
/** How many consecutive taken candidates to try before giving up. */
export const MAX_BARCODE_ATTEMPTS = 64;

/**
 * Standard EAN-13/UPC check digit for a 12-digit payload: weight 3/1 starting
 * with weight 3 on the rightmost payload digit, then the check is the amount
 * that makes the total a multiple of ten.
 */
export function ean13CheckDigit(payload12: string) {
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    const weight = (11 - i) % 2 === 0 ? 3 : 1; // rightmost (i=11) is weight 3
    sum += Number(payload12[i]) * weight;
  }
  return (10 - (sum % 10)) % 10;
}

/** Full 13-digit EAN-13 value for a 12-digit payload (check digit appended). */
export function ean13Value(payload12: string) {
  return `${payload12}${ean13CheckDigit(payload12)}`;
}

/** Whether a stored barcode is one this system issues (prefix 2 + valid check). */
export function isInternalEan13(value: unknown) {
  if (typeof value !== 'string' || !/^2\d{12}$/.test(value)) return false;
  return ean13CheckDigit(value.slice(0, 12)) === Number(value[12]);
}

/**
 * Deterministic EAN-13 candidates for a product (given its ObjectId hex):
 * base payload from the id, then +1 for each collision. Yields 13-digit codes.
 */
export function* internalEan13Candidates(productIdHex: string) {
  let seed = BigInt(`0x${productIdHex}`) % PAYLOAD_RANGE;
  for (let i = 0; i < MAX_BARCODE_ATTEMPTS; i += 1) {
    const payload = INTERNAL_PREFIX + seed.toString().padStart(PAYLOAD_DIGITS, '0');
    yield ean13Value(payload);
    seed = (seed + 1n) % PAYLOAD_RANGE;
  }
}

export default {
  ean13CheckDigit,
  ean13Value,
  isInternalEan13,
  internalEan13Candidates,
  MAX_BARCODE_ATTEMPTS,
};
