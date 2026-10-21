/**
 * AI-33 — a fact check that cannot manufacture a false failure.
 *
 * WHY THIS EXISTS. `perf:turns` is the instrument that decides whether a model's answer is
 * grounded in the tenant's real numbers. Its first check was
 * `normalizedAnswer.includes(normalizedFact)`, which fails in both directions:
 *
 *   * a CORRECT answer that says "none are out of stock" contains no literal `0`, so the
 *     expected `0` was reported MISSING (measured 2026-10-21 on Lightning, question 1);
 *   * an expected `2` matched any `2` inside `1281`, `12` or `24`, so a wrong answer could
 *     be reported grounded.
 *
 * The second is worse than the first: a false PASS hides a defect, while a false FAIL
 * spends a person's afternoon re-reading a good answer. Both are fixed by comparing numbers
 * as whole numbers and by accepting the words a person actually uses for zero.
 *
 * This module is deliberately tiny and pure, so the check itself is testable without a
 * database, a model, or a network.
 */

/** Commas, whitespace and non-breaking spaces are formatting, not value. */
export function normalizeFact(value) {
  return String(value ?? '')
    .replace(/[,\s\u00a0]/g, '')
    .toLowerCase();
}

/** A whole token in the normalized answer: not the prefix of a longer number. */
function numberPattern(number) {
  const escaped = String(number).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\d.])${escaped}(?![\\d.])`);
}

/**
 * The words an answer uses for "zero". A count of zero is not always written as a digit:
 * "none", "nothing" and "no products are out of stock" are all exact answers.
 */
const ZERO_WORDS =
  /\b(?:none|zero|nothing)\b|\bno\s+(?:[\w-]+\s+){0,2}(?:products?|items?|units?|stock)\b/i;

/**
 * Is `fact` present in `answer` as the thing it is, rather than as a coincidental substring?
 *
 * Numbers are compared as whole numbers (thousands separators removed), so `2` does not
 * match `1281` and `6` does not match `64`. A zero count also accepts its ordinary words.
 * Text facts are compared after whitespace/case normalization, because a product name may be
 * wrapped across a line.
 */
export function factPresent(answer, fact) {
  const text = String(answer ?? '');

  if (typeof fact === 'number' && Number.isFinite(fact)) {
    if (fact === 0) return numberPattern(0).test(normalizeFact(text)) || ZERO_WORDS.test(text);
    return numberPattern(fact).test(normalizeFact(text));
  }

  const expected = normalizeFact(fact);
  return expected !== '' && normalizeFact(text).includes(expected);
}

export default { normalizeFact, factPresent };
