/**
 * The assistant's Markdown pipeline — the word-boundary rule, and the invariant a weaker guard
 * could not see.
 *
 * WHY THIS EXISTS. AI-4 found a real defect in shipped code: `stripMarkdown` had **no word boundary
 * at all**, so it silently rewrote `4*5*6` as `456` and `A*B*C` as `ABC` — a shortened
 * multiplication still reads as an answer, which is the worst class of bug in an assistant that
 * reports quantities. The fix shipped, and AI-4 explicitly *left one residual in place and recorded
 * it rather than fixing it* (`4**5**6` → `4*5*6`, where the operators survive so no quantity is
 * altered). Neither the fix nor the residual has a guard: the AI-2 and AI-4 suites pin the two named
 * invariants (`SKU_123_AB`; `12 * 3 = 36`), not the rule that produces them.
 *
 * THE FIRST GUARD DRAFTED HERE WAS WRONG, AND THE WAY IT WAS WRONG IS WHY THIS FILE LOOKS LIKE THIS.
 * It compared **alphanumeric content** before and after, and it passed while the defect was present
 * — `4*5*6` → `456` keeps the same digits in the same order, so the comparison is blind to exactly
 * the bug it was written for. That was measured by reintroducing the defect and watching it pass.
 * This file therefore compares **runs**, not characters: removing a marker between two word/number
 * runs **fuses** them, and fusion is visible.
 *
 * WHY NOT "NOTHING MAY CHANGE". The model legitimately writes Markdown and the parser legitimately
 * consumes markers — that is the whole point of the pipeline — so "nothing may change" is false by
 * design. The property is narrower and checkable: the pipeline may **style** alphanumeric runs, but
 * it may not **fuse** them.
 *
 * THE RULE, AND WHY IT IS SCOPED. Over the no-backtick corpus (every string to depth 6 over
 * `* _ # 4 a` — 19,530 inputs) a run may never be fused, by `stripMarkdown` or by the rendered span
 * list. With backticks included a run boundary **can** be fused, and every such case is a code span
 * or a styled span sitting next to a run; removing backticks from the corpus removes all 1,492 of
 * them, so the exemption is exact rather than a convenience. The reason is that the styling itself
 * carries the separation: `` `4`4 `` yields `[code "4", plain "4"]`, two spans, boundary preserved
 * in structure. This file ships the general form of that observation — **a run boundary may
 * disappear only where a styled span carries it** — which holds over both corpora on the shipped
 * code and produced **2,412 violations** once the boundary rule was removed.
 *
 * PROVED ABLE TO FAIL, IN BOTH DIRECTIONS. The word-boundary rule was removed from its two code
 * sites in `stripMarkdown` and the suite was re-run: **1,976** strict and **2,412** styled
 * violations, where the clean tree reports **0**. The mutation was asserted to have landed by file
 * hash before the run, and the file was restored byte-identical afterwards. A guard that cannot
 * fail is decoration.
 *
 * WHAT IT IS NOT. A property over *generated* inputs, not a proof: the alphabet is small and the
 * depth is 6, so it cannot see a defect that needs a longer or more exotic string. The
 * styled-span exemption is a proxy — it asserts that styling is present at the fusion, not that the
 * specific boundary is the styled one (on the measured corpus the two coincide). And it says
 * nothing about how an answer reads on a screen, which only a device can settle.
 */

import { parseInline, stripMarkdown } from '../lib/assistantMarkdown';

type Span = { text: string; bold?: boolean; italic?: boolean; code?: boolean };

/** Alphanumeric content only — the comparison this file **rejects**, kept to document why. */
const alnum = (s: string): string => (s.match(/[A-Za-z0-9]/g) ?? []).join('');

/** Alphanumeric **runs**, in order. A marker removed between two runs merges them. */
const runs = (s: string): string => (s.match(/[A-Za-z0-9]+/g) ?? []).join('|');

const carriesBoundary = (spans: Span[]): boolean =>
  spans.some((s) => Boolean(s.bold || s.italic || s.code));

const joined = (spans: Span[]): string => spans.map((s) => s.text).join('');

/** The generated corpus: every non-empty string to `depth` over `alphabet`. */
function corpus(alphabet: string[], depth: number): string[] {
  const out: string[] = [];
  const walk = (prefix: string, remaining: number): void => {
    if (prefix) out.push(prefix);
    if (remaining === 0) return;
    for (const char of alphabet) walk(prefix + char, remaining - 1);
  };
  walk('', depth);
  return out;
}

const NO_BACKTICK = corpus(['*', '_', '#', '4', 'a'], 6);
const WITH_BACKTICK = corpus(['*', '_', '`', '#', '4', 'a'], 6);

describe('assistant Markdown — the word-boundary invariant', () => {
  it('measures fusion, not content — the metric that silently passed the defect', () => {
    // The rejected metric cannot tell these apart, which is exactly why it passed while
    // `4*5*6` was being rewritten as `456`.
    expect(alnum('4*5*6')).toBe(alnum('456'));
    expect(alnum('A*B*C')).toBe(alnum('ABC'));

    // The shipped metric can, and does.
    expect(runs('4*5*6')).not.toBe(runs('456'));
    expect(runs('A*B*C')).not.toBe(runs('ABC'));
    expect(runs('4*5*6')).toBe('4|5|6');
  });

  it('treats a marker that does not stand apart from a word as data', () => {
    // The class AI-4 fixed. Each of these was rewritten before the fix.
    const cases: Record<string, string> = {
      '4*5*6': '4*5*6',
      'A*B*C': 'A*B*C',
      '4*5': '4*5',
      'a*b': 'a*b',
      'item*2': 'item*2',
      'SKU_123_AB': 'SKU_123_AB',
      '12 * 3 = 36': '12 * 3 = 36',
    };
    for (const [input, expected] of Object.entries(cases)) {
      expect([input, stripMarkdown(input)]).toEqual([input, expected]);
    }
  });

  it('pins the residual AI-4 accepted deliberately, so it cannot drift either way', () => {
    // `**` between two numbers is still consumed — but the operators survive, so unlike the
    // `4*5*6` case no quantity is altered. Accepted and recorded, not fixed. If someone
    // decides to fix it, this case fails and asks to be updated on purpose.
    expect(stripMarkdown('4**5**6')).toBe('4*5*6');
    expect(runs(stripMarkdown('4**5**6'))).toBe(runs('4**5**6'));
  });

  it('never fuses two runs through stripMarkdown (no backticks in the corpus)', () => {
    expect(NO_BACKTICK).toHaveLength(19530); // guards against a silently shrunken corpus
    const violations = NO_BACKTICK.filter((input) => runs(stripMarkdown(input)) !== runs(input));
    expect(violations).toEqual([]);
  });

  it('lets a run boundary disappear only where a styled span carries it', () => {
    // The general rule, over both corpora. Fusion with nothing styled behind it is the defect.
    expect(WITH_BACKTICK).toHaveLength(55986);
    const violations = [...NO_BACKTICK, ...WITH_BACKTICK].filter((input) => {
      const spans = parseInline(input) as Span[];
      return runs(joined(spans)) !== runs(input) && !carriesBoundary(spans);
    });
    expect(violations).toEqual([]);
  });

  it('stays linear enough that a rewritten rule cannot quietly hang the suite', () => {
    const started = Date.now();
    for (const input of NO_BACKTICK) {
      parseInline(input);
      stripMarkdown(input);
    }
    // Measured at ~0.3 s for both corpora locally; this bound is ~30x that and exists only to
    // catch a complexity explosion, not to grade performance.
    expect(Date.now() - started).toBeLessThan(10000);
  });
});
