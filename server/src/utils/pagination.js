/**
 * Pagination parsing. Every list endpoint uses page/limit and returns a
 * consistent shape: { items, page, limit, total, totalPages }.
 */

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function toInt(value) {
  if (value === undefined || value === null || value === '') return NaN;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : NaN;
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
