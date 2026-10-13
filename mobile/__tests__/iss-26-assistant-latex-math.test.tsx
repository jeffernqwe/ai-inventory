/**
 * ISS-26 — the assistant's LaTeX maths reached the screen as source.
 *
 * HOW IT WAS FOUND. On 2026-10-13 the assistant was re-run against the 10 000-product
 * `seed:perf` tenant and the question that had previously timed out was answered in
 * 10.0 s. Its answer showed a percentage *as a formula*:
 *
 *   \( \frac{620}{10,000} \times 100 = \mathbf{6.2\%} \)
 *
 * That string is stored verbatim (`ai_messages.content`, confirmed by code point) and
 * the bubble renders the stored message, so the member reads backslashes and braces
 * instead of an answer. It is the same class of defect as ISS-25 — markup reaching the
 * screen — for a marker family AI-4 never had to handle: its census of every stored
 * answer counted tables, headings, bullet lists and numbered steps, and **no maths**,
 * because the model had not yet reached for a formula.
 *
 * WHY IT IS A CLIENT FIX AND NOT A PROMPT CHANGE. AI-4 already rejected a formatting
 * instruction in the system prompt: it would be paid for in tokens on every turn
 * forever, and it would not fix a single one of the answers already stored. Decoding
 * is free, runs once per rendered bubble, and repairs history as well as new replies —
 * this suite asserts both, since one of its fixtures is the real stored answer.
 *
 * WHERE IT LIVES. `stripMarkdown` is the residual pass: it is applied to exactly the
 * text the block parser does not model, which is where LaTeX arrives. Teaching it this
 * marker family is the same move AI-2 made for bold and backticks and AI-4 made for
 * tables, and it keeps the guarantee in one place — a marker nobody modelled still
 * cannot reach the screen.
 *
 * WHAT IS DELIBERATELY NOT DONE, recorded rather than glossed:
 *
 *  * Single-dollar `$…$` is NOT treated as maths. A dollar sign is currency far more
 *    often than it is a delimiter here, and turning `$1,200` into `1,200` would be a
 *    data-corrupting bug of exactly the kind the underscore rule exists to prevent.
 *    Only the unambiguous forms — `\(…\)`, `\[…\]`, `$$…$$` — are stripped.
 *  * An UNRECOGNISED command is left as it is. Dropping stray backslashes would eat
 *    the separator out of `C:\Users\…`, so nothing is removed that is not recognised.
 *  * This is a DECODER, not a renderer: `\frac{a}{b}` becomes `a/b`, not a stacked
 *    fraction. A real maths layout would be a dependency, and the measured need is a
 *    readable percentage, not typesetting.
 */

import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import AssistantMarkdown from '../components/AssistantMarkdown';
import { parseAssistantMarkdown, stripMarkdown } from '../lib/assistantMarkdown';
import { ThemeProvider } from '../lib/theme-context';

const withTheme = (node: ReactNode) => render(<ThemeProvider>{node}</ThemeProvider>);

function collectText(node: unknown, out: string[] = []): string[] {
  if (node == null) return out;
  if (typeof node === 'string') {
    out.push(node);
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((n) => collectText(n, out));
    return out;
  }
  const children = (node as { children?: unknown }).children;
  if (children !== undefined) collectText(children, out);
  return out;
}

interface Rendered {
  toJSON: () => unknown;
  getByText: (t: string) => { props: Record<string, unknown> };
}

/** The rendered text, concatenated with nothing between nodes. */
const flatText = (view: Rendered): string => collectText(view.toJSON()).join('');

/**
 * REAL stored output, verbatim from the 2026-10-13 re-run — code points read out of
 * `ai_messages` so the string in this file is the string on the wire (single
 * backslashes, six in total, no doubled `\\`). The two trailing spaces before the
 * formula are the model's hard line break, which is why a `\n` sits in front of it.
 */
const REAL_LATEX_ANSWER =
  'Based on the latest inventory health snapshot:\n\n' +
  '- **Total active products:** 10,000  \n' +
  '- **Completely out of stock:** 620  \n\n' +
  '**Percentage of active catalogue out of stock:**  \n' +
  '\\( \\frac{620}{10,000} \\times 100 = \\mathbf{6.2\\%} \\)\n\n' +
  'So 620 products (6.2% of your active catalogue) currently have zero available stock across all locations.';

describe('ISS-26 — LaTeX maths is decoded, not shown', () => {
  it('decodes the real formula into what a member can read', () => {
    expect(stripMarkdown('\\( \\frac{620}{10,000} \\times 100 = \\mathbf{6.2\\%} \\)')).toBe(
      '620/10,000 × 100 = 6.2%',
    );
  });

  it('decodes each command family the model uses', () => {
    expect(stripMarkdown('\\frac{1}{2}')).toBe('1/2');
    expect(stripMarkdown('3 \\times 4')).toBe('3 × 4');
    expect(stripMarkdown('\\mathbf{Bold}')).toBe('Bold');
    expect(stripMarkdown('\\text{plain}')).toBe('plain');
    expect(stripMarkdown('a \\leq b \\geq c \\neq d')).toBe('a ≤ b ≥ c ≠ d');
    expect(stripMarkdown('100\\%')).toBe('100%');
  });

  it('decodes a wrapped multiplication percentage, in any order the model picks', () => {
    expect(stripMarkdown('\\(\\frac{620}{10,000} \\times 100 = 6.2\\%\\)')).toBe(
      '620/10,000 × 100 = 6.2%',
    );
  });

  it('renders the real stored answer with no maths source left on screen', async () => {
    const view = (await withTheme(
      <AssistantMarkdown content={REAL_LATEX_ANSWER} />,
    )) as unknown as Rendered;
    const text = flatText(view);

    expect(text).not.toContain('\\frac');
    expect(text).not.toContain('\\mathbf');
    expect(text).not.toContain('\\(');
    expect(text).not.toContain('\\)');
    expect(text).not.toContain('{');
    // The member reads the answer, and the statistics that surround it survive.
    expect(text).toContain('620/10,000 × 100 = 6.2%');
    expect(text).toContain('Completely out of stock:');
    expect(text).toContain('620');
    expect(text).toContain('6.2%');
  });

  it('keeps the plain-prose answer beside it intact', async () => {
    const view = (await withTheme(
      <AssistantMarkdown content={REAL_LATEX_ANSWER} />,
    )) as unknown as Rendered;
    expect(flatText(view)).toContain('zero available stock across all locations');
  });

  it('still reads the formula as one paragraph, not as a broken run of lines', () => {
    const blocks = parseAssistantMarkdown(REAL_LATEX_ANSWER);
    const joined = blocks
      .filter((b) => b.kind === 'paragraph')
      .map((b) => (b as { spans: { text: string }[] }).spans.map((s) => s.text).join(''))
      .join('|');
    expect(joined).toContain('620/10,000 × 100 = 6.2%');
  });
});

describe('ISS-26 — the boundaries, so the decoder cannot corrupt data', () => {
  /**
   * THE RULE THAT MATTERS MOST. A dollar sign is currency in this product's answers
   * far more often than it is a delimiter — turning `$1,200` into `1,200` would be
   * silently wrong, which is the one failure mode worse than an ugly marker.
   */
  it('leaves a currency amount alone', () => {
    expect(stripMarkdown('Total value: $1,200.50')).toBe('Total value: $1,200.50');
    expect(stripMarkdown('Two items at $5 and $9')).toBe('Two items at $5 and $9');
  });

  it('leaves an unrecognised backslash sequence alone', () => {
    expect(stripMarkdown('saved in C:\\Users\\jeffe\\reports')).toBe(
      'saved in C:\\Users\\jeffe\\reports',
    );
  });

  it('does not touch the two AI-2 invariants while doing any of this', () => {
    expect(stripMarkdown('SKU_123_AB and MIN_STOCK_LEVEL')).toBe('SKU_123_AB and MIN_STOCK_LEVEL');
    expect(stripMarkdown('12 * 3 = 36')).toBe('12 * 3 = 36');
    expect(stripMarkdown('4*5*6')).toBe('4*5*6');
  });

  it('still removes the markers it always removed', () => {
    expect(stripMarkdown('**bold** and `code`')).toBe('bold and code');
    // The heading rule is line-anchored, so a heading is a line of its own.
    expect(stripMarkdown('## Heading')).toBe('Heading');
  });
});
