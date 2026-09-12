/**
 * Pagination parsing. Every list endpoint uses page/limit and returns a
 * consistent shape: { items, page, limit, total, totalPages }.
 *
 * An unusable page/limit is COERCED, never rejected: `page` falls back to 1,
 * `limit` to DEFAULT_LIMIT, and `limit` is capped at MAX_LIMIT. That coercion is
 * the contract (pinned by phase20-pagination-contract.test.mjs) — pagination
 * values are coerced by design, where a malformed list *filter* is a 400.
 */

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * A page/limit value is usable only when the WHOLE value is an integer.
 *
 * `Number.parseInt` was the original parse here and it is a PREFIX parser: it
 * reads the longest leading integer and discards the rest, so `1e3` arrived as
 * `1` and `10.5` as `10`. `1e3` then passed both the `>= 1` guard and the cap
 * and was echoed back as `limit: 1` — a client that asked for a thousand rows
 * was answered with one, and nothing in the response looked wrong. Anything
 * that is not entirely digits now falls through to the same default an unusable
 * value has always received.
 *
 * Surrounding whitespace is trimmed, matching `toNumber` in validate.js, so
 * `?limit=+10` (decoded to `' 10'`) keeps working. Leading zeros are fine.
 */
function toInt(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? value : NaN;
  if (typeof value !== 'string') return NaN;
  const text = value.trim();
  return /^\d+$/.test(text) ? Number(text) : NaN;
}

export function parsePagination(query = {}) {
  const rawPage = toInt(query.page);
  const rawLimit = toInt(query.limit);

  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;
  const limitRaw = Number.isFinite(rawLimit) && rawLimit >= 1 ? rawLimit : DEFAULT_LIMIT;
  const limit = Math.min(limitRaw, MAX_LIMIT);

  return { page, limit, skip: (page - 1) * limit };
}

export function totalPages(total, limit) {
  return limit > 0 ? Math.ceil(total / limit) : 0;
}

/** Wraps an array + count into the standard list payload. */
export function pageResult(items, total, page, limit) {
  return {
    items,
    page,
    limit,
    total,
    totalPages: totalPages(total, limit),
  };
}

export default { parsePagination, pageResult, totalPages };
