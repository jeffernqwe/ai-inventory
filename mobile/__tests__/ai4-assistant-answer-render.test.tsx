/**
 * AI-4 — the assistant's answer is RENDERED, not de-marked-up.
 *
 * WHAT WENT WRONG (ISS-25, seen on the device 2026-10-13, §27BG). AI-2's
 * `stripMarkdown` removed inline markers — bold, backticks, heading hashes — and
 * deliberately did nothing else, because at the time the answers were prose. At
 * 10 000 products the model reaches for a **table**, and a table is the one
 * structure whose markers are not decodable as plain text: the pipe characters
 * are load-bearing, so stripping them would destroy the row/column relationship,
 * and leaving them (what shipped) puts `| Product | SKU | … |` on the screen
 * with its `|---|---|` separator. All three successful answers of that run were
 * tables, so this was every answer, not an edge case.
 *
 * WHAT THIS INCREMENT CHANGES. Structure is now parsed and rendered with real
 * React Native views: headings become headings, list items become rows with
 * markers, and tables become either a grid or — because five to seven columns
 * cannot fit a phone's width, which is exactly what made the device output
 * unreadable — one card per row with its attributes listed under the row's own
 * name. Nothing about the server, the prompt, or the model changes, so the
 * answer's token cost and latency are untouched by construction.
 *
 * THE TWO INVARIANTS AI-2 ESTABLISHED ARE CARRIED FORWARD, and this suite keeps
 * failing if either loosens:
 *
 *  * Identifiers containing underscores (`SKU_123_AB`, `MIN_STOCK_LEVEL`) are
 *    data, never emphasis. A `_emphasis_` rule would corrupt the very thing the
 *    assistant exists to report.
 *  * A lone asterisk is emphasis only when a non-space follows it, so
 *    `12 * 3 = 36` stays arithmetic.
 *
 * AND ONE NEW GUARANTEE: no marker may reach the screen. `stripMarkdown` is
 * retained as the residual pass for markers the renderer does not model, so
 * this suite asserts over rendered output that no `|`, `**`, `__` or `---`
 * run survives — the check that would have caught ISS-25 on day one.
 */

import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import AssistantMarkdown from '../components/AssistantMarkdown';
import { parseAssistantMarkdown, stripMarkdown } from '../lib/assistantMarkdown';
import { ThemeProvider } from '../lib/theme-context';

const withTheme = (node: ReactNode) => render(<ThemeProvider>{node}</ThemeProvider>);

/** Every string in the rendered tree, joined — the screen, as text. */
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
  queryByTestId: (t: string) => unknown;
  getAllByTestId: (t: string) => { props: Record<string, unknown> }[];
}

const screenText = (view: Rendered): string => collectText(view.toJSON()).join('\n');

/** The rendered text, concatenated with NOTHING between nodes — so a break that
 * is actually present in the tree shows up as a `\n` character in the string. */
const flatText = (view: Rendered): string => collectText(view.toJSON()).join('');

/** Flatten a style prop (which may be an array) into a single object. */
function flattenStyle(style: unknown): Record<string, unknown> {
  if (!style) return {};
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flattenStyle));
  return style as Record<string, unknown>;
}

/**
 * Real model output, verbatim from the 2026-10-13 device run (§27BG): the answer
 * that produced the screenshot the owner sent. The data is the synthetic
 * `seed:perf` tenant, so there is nothing personal in it.
 */
const REAL_TABLE_ANSWER = `I found **1,492 products** that are at or below their minimum stock level. Here are the first 20 (most recent page):

## Out of Stock (available = 0)
| Product | SKU | Category | Min Stock | Available |
|---------|-----|----------|-----------|-----------|
| Deluxe Clips 10996 | SEEDSKU-9996 | Toys | 88 | 0 |
| Everyday Battery 10981 | SEEDSKU-9981 | Personal Care | 59 | 0 |

## Low Stock (available > 0 but ≤ minimum)
| Product | SKU | Category | Min Stock | Available |
|---------|-----|----------|-----------|-----------|
| Pro Cable 10985 | SEEDSKU-9985 | Electrical | 44 | 5 |`;

/** The 7-column movement table, also verbatim from that run. */
const REAL_MOVEMENTS_ANSWER = `Here are the **15 most recent stock movements** (all from today, 2026-10-12), newest first:

| Time (UTC) | Product | Location | Type | Qty Change | Prev → New | Reason / Reference |
|------------|---------|----------|------|------------|------------|---------------------|
| 19:04:30 | Value Mug 7728 | Shop Front | STOCK_IN | +19 | 391 → 410 | Seeded movement (SEED-6728-0) |
| 19:03:14 | Classic Sponge 5964 | Main Warehouse | STOCK_OUT | +50 | 313 → 363 | Seeded movement (SEED-4964-2) |`;

/**
 * REAL stored output, verbatim from the 2026-10-12 transcript — including its
 * TWO-SPACE line endings, which in Markdown are not trailing whitespace to be
 * tidied away but a **hard line break**: "put the next thing on a new line".
 *
 * The first version of AI-4 trimmed those spaces and joined the lines with a
 * space, so this answer reached the phone as one run-on sentence:
 *
 *   Product: Pro Cable 1000 SKU: SEEDSKU-0 Status: ACTIVE (low stock — …)
 *
 * That was a REGRESSION rather than a missing feature: before AI-4 the bubble
 * rendered the raw newlines (AI-2 removed markers but kept lines), so the fields
 * were already on separate lines. Measured over every stored answer: **4 hard
 * breaks in 2 of 16 answers**, both of them this field-per-line shape from
 * `getProduct` — the same answer the 2026-10-13 device run timed (§27BG, Q3).
 */
const HB = '  '; // two trailing spaces — Markdown's hard line break
const REAL_FIELD_BLOCK_ANSWER = [
  `**Product:** Pro Cable 1000${HB}`,
  `**SKU:** SEEDSKU-0${HB}`,
  '**Status:** ACTIVE (low stock — total available ≤ minimum of 65)',
  '',
  '### Total Available (all locations): **64 units**',
].join('\n');

describe('AI-4 — a hard break stays a break; only a soft break becomes a space', () => {
  it('keeps a hard-broken paragraph as separate lines', () => {
    const blocks = parseAssistantMarkdown(REAL_FIELD_BLOCK_ANSWER);
    const paragraph = blocks[0] as { kind: string; spans: { text: string }[] };
    expect(paragraph.kind).toBe('paragraph');
    expect(paragraph.spans.map((span) => span.text).join('')).toBe(
      'Product: Pro Cable 1000\nSKU: SEEDSKU-0\nStatus: ACTIVE (low stock — total available ≤ minimum of 65)',
    );
  });

  it('still joins a SOFT break (a line with no trailing spaces) with a space', () => {
    const blocks = parseAssistantMarkdown('one line\nand its\nother half');
    const spans = (blocks[0] as { spans: { text: string }[] }).spans;
    expect(spans.map((span) => span.text).join('')).toBe('one line and its other half');
  });

  it('puts the break on the screen instead of a run-on line', async () => {
    const view = (await withTheme(
      <AssistantMarkdown content={REAL_FIELD_BLOCK_ANSWER} />,
    )) as unknown as Rendered;
    expect(flatText(view)).toContain('Pro Cable 1000\nSKU: SEEDSKU-0');
    // The collapsed form must not be what the member reads.
    expect(flatText(view)).not.toContain('SEEDSKU-0 Status: ACTIVE');
  });
});

describe('AI-4 — the parser produces structure, not a string', () => {
  it('reads a heading as a heading and drops the hashes', () => {
    const blocks = parseAssistantMarkdown('## Out of Stock (available = 0)');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: 'heading', level: 2 });
    expect(JSON.stringify(blocks[0])).not.toContain('#');
  });

  it('reads a pipe table into a header row and body rows, never the separator', () => {
    const blocks = parseAssistantMarkdown(
      ['| Product | SKU |', '|---------|-----|', '| Widget | W-1 |'].join('\n'),
    );
    expect(blocks).toHaveLength(1);
    const table = blocks[0] as { kind: string; header: unknown[]; rows: unknown[] };
    expect(table.kind).toBe('table');
    expect(table.header).toHaveLength(2);
    expect(table.rows).toHaveLength(1);
    // The `|---|---|` row is punctuation, not data: it must not be a row.
    expect(JSON.stringify(table)).not.toContain('---');
  });

  it('reads table rows that do not begin with a pipe', () => {
    const blocks = parseAssistantMarkdown(
      ['| A | B |', '|---|---|', 'x | y'].join('\n'),
    );
    const table = blocks[0] as { rows: unknown[] };
    expect(table.rows).toHaveLength(1);
    expect(JSON.stringify(table.rows[0])).toContain('x');
    expect(JSON.stringify(table.rows[0])).toContain('y');
  });

  it('reads bullet items as list items', () => {
    const blocks = parseAssistantMarkdown('- one\n- two\n- three');
    expect(blocks[0]).toMatchObject({ kind: 'list', ordered: false });
    expect((blocks[0] as { items: unknown[] }).items).toHaveLength(3);
  });

  it('reads numbered items as an ordered list and keeps their numbers', () => {
    const blocks = parseAssistantMarkdown('1. first\n2. second');
    expect(blocks[0]).toMatchObject({ kind: 'list', ordered: true });
    const items = (blocks[0] as { items: unknown[] }).items;
    expect(items).toHaveLength(2);
  });

  it('joins consecutive plain lines into one paragraph', () => {
    const blocks = parseAssistantMarkdown('one line\nand its\nother half');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('paragraph');
    expect(JSON.stringify(blocks[0])).toContain('one line and its other half');
  });

  it('marks bold and code spans as spans rather than deleting the markers', () => {
    const blocks = parseAssistantMarkdown('There are **3** products in `Main Warehouse`.');
    const json = JSON.stringify(blocks[0]);
    expect(json).toContain('"bold":true');
    expect(json).toContain('"code":true');
    expect(json).not.toContain('**');
  });

  it('splits a blank line into separate paragraphs', () => {
    const blocks = parseAssistantMarkdown('first idea\n\nsecond idea');
    expect(blocks).toHaveLength(2);
  });
});

describe('AI-4 — the renderer shows the answer, never its markup', () => {
  it('renders the real answer with no pipe or separator characters left on screen', async () => {
    const view = (await withTheme(<AssistantMarkdown content={REAL_TABLE_ANSWER} />)) as unknown as Rendered;
    const text = screenText(view);

    expect(text).not.toContain('|');
    expect(text).not.toContain('---');
    expect(text).not.toContain('##');
    expect(text).not.toContain('**');
  });

  it('renders the real answer\u2019s actual content', async () => {
    const view = (await withTheme(<AssistantMarkdown content={REAL_TABLE_ANSWER} />)) as unknown as Rendered;
    expect(view.getByText('Out of Stock (available = 0)')).toBeTruthy();
    expect(view.getByText('Deluxe Clips 10996')).toBeTruthy();
    expect(view.getByText('SEEDSKU-9996')).toBeTruthy();
    expect(view.getByText('Pro Cable 10985')).toBeTruthy();
  });

  it('renders the 7-column movement table with no pipes on screen', async () => {
    const view = (await withTheme(<AssistantMarkdown content={REAL_MOVEMENTS_ANSWER} />)) as unknown as Rendered;
    const text = screenText(view);
    expect(text).not.toContain('|');
    expect(text).toContain('Value Mug 7728');
    expect(text).toContain('391 → 410');
    expect(text).toContain('Seeded movement (SEED-6728-0)');
  });

  it('gives a wide table one card per row, so every datum stays readable', async () => {
    const view = (await withTheme(<AssistantMarkdown content={REAL_MOVEMENTS_ANSWER} />)) as unknown as Rendered;
    expect(view.queryByTestId('assistant-md-table-cards')).toBeTruthy();
    expect(view.getAllByTestId('assistant-md-row-card')).toHaveLength(2);
  });

  it('gives a narrow table a real grid', async () => {
    const view = (await withTheme(
      <AssistantMarkdown content={'| A | B |\n|---|---|\n| 1 | 2 |'} />,
    )) as unknown as Rendered;
    expect(view.queryByTestId('assistant-md-table-grid')).toBeTruthy();
  });

  it('★ gives a THREE-column table cards, because its header wrapped mid-word on the phone', async () => {
    // Observed 2026-10-19: "| Product | Available QTY | Stock status |" in a ~400 px
    // bubble drew the header as "Availabl / e QTY" — the 2:1:1 grid split leaves the
    // narrow columns under 80 px. The labels are the table's meaning, so the card layout
    // (name as title, the other two fields as whole lines) is the readable form.
    const view = (await withTheme(
      <AssistantMarkdown content={'| Product | Available QTY | Stock status |\n|---|---|---|\n| Classic Mug | 0 | Out of stock |'} />,
    )) as unknown as Rendered;
    expect(view.queryByTestId('assistant-md-table-cards')).toBeTruthy();
    expect(view.queryByTestId('assistant-md-table-grid')).toBeNull();
    const text = screenText(view);
    expect(text).toContain('Classic Mug');
    expect(text).toContain('Available QTY');
    expect(text).toContain('Out of stock');
  });

  it('renders list items as rows with their markers', async () => {
    const view = (await withTheme(
      <AssistantMarkdown content={'- Deluxe Clips 10996\n- Everyday Battery 10981'} />,
    )) as unknown as Rendered;
    expect(view.getByText('Deluxe Clips 10996')).toBeTruthy();
    expect(view.getByText('Everyday Battery 10981')).toBeTruthy();
  });

  it('keeps an ordered list\u2019s numbers visible', async () => {
    const view = (await withTheme(
      <AssistantMarkdown content={'1. Check the reorder screen\n2. Raise a purchase order'} />,
    )) as unknown as Rendered;
    expect(view.getByText('Check the reorder screen')).toBeTruthy();
    expect(screenText(view)).toContain('2.');
  });

  it('styles a bold run as bold instead of only removing its markers', async () => {
    const view = (await withTheme(<AssistantMarkdown content={'found **1,492 products** today'} />)) as unknown as Rendered;
    const node = view.getByText('1,492 products');
    expect(flattenStyle(node.props.style).fontWeight).toBe('700');
  });

  it('renders nothing, and does not crash, for an empty answer', async () => {
    const view = (await withTheme(<AssistantMarkdown content="" />)) as unknown as Rendered;
    expect(screenText(view).trim()).toBe('');
  });
});

describe('AI-4 — the AI-2 invariants still hold, now through the renderer', () => {
  it('never mangles identifiers that contain underscores', async () => {
    const view = (await withTheme(
      <AssistantMarkdown content={'SKU_123_AB, product_code, snake_case and MIN_STOCK_LEVEL'} />,
    )) as unknown as Rendered;
    expect(screenText(view)).toContain('SKU_123_AB');
    expect(screenText(view)).toContain('MIN_STOCK_LEVEL');
  });

  it('leaves multiplication alone, because a lone asterisk is not always emphasis', async () => {
    const view = (await withTheme(<AssistantMarkdown content={'12 * 3 = 36 units in total'} />)) as unknown as Rendered;
    expect(screenText(view)).toContain('12 * 3 = 36 units in total');
  });

  it('still de-markers text through stripMarkdown, unchanged', () => {
    expect(stripMarkdown('**no products that need restocking**')).toBe('no products that need restocking');
    expect(stripMarkdown('The SKU `WID-001` has 4 left.')).toBe('The SKU WID-001 has 4 left.');
  });

  /**
   * THE DEFECT THIS INCREMENT FIXED IN THE SHIPPED CODE. AI-2's asterisk rule had
   * no word boundary, so two asterisks around any non-space text were emphasis:
   * `4*5*6` became `456` and `A*B*C` became `ABC`. A silently shortened
   * multiplication still reads as an answer, which is what makes it dangerous —
   * the assistant exists to report quantities, so the rule now requires a marker
   * to stand apart from a word before it counts as markup.
   */
  it('does not delete characters from arithmetic that has no spaces', () => {
    expect(stripMarkdown('4*5*6')).toBe('4*5*6');
    expect(stripMarkdown('A*B*C')).toBe('A*B*C');
  });

  it('keeps that arithmetic intact all the way to the screen', async () => {
    const view = (await withTheme(<AssistantMarkdown content={'4*5*6 = 120 units'} />)) as unknown as Rendered;
    expect(screenText(view)).toContain('4*5*6 = 120 units');
  });
});

describe('AI-4 — no marker can reach the screen through any path', () => {
  // The ISS-25 guarantee, stated as one property over realistic inputs: whatever
  // the model writes, the screen shows words and structure only.
  const cases: [string, string][] = [
    ['the real table answer', REAL_TABLE_ANSWER],
    ['the real movement answer', REAL_MOVEMENTS_ANSWER],
    ['a heading', '### Low stock\n3 products'],
    ['fenced code', '```\nWID-001  4\n```'],
    ['bold and italics', 'That item is *critical* and __urgent__.'],
    ['a stray separator row', '| a |\n|---|\n| b |'],
    // ISS-26: the family the model reached for only once it was asked for a percentage.
    ['LaTeX maths', '\( \\frac{620}{10,000} \\times 100 = \\mathbf{6.2\\%} \)'],
  ];

  it.each(cases)('leaves no markup on screen: %s', async (_label, content) => {
    const view = (await withTheme(<AssistantMarkdown content={content} />)) as unknown as Rendered;
    const text = screenText(view);
    expect(text).not.toContain('|');
    expect(text).not.toMatch(/\*\*/);
    expect(text).not.toContain('__');
    expect(text).not.toMatch(/---/);
    expect(text).not.toMatch(/^#{1,6}\s/m);
    expect(text).not.toMatch(/\\[a-zA-Z]+/);
    expect(text).not.toContain('\\(');
  });
});

describe('AI-4 — parsing a large answer stays linear', () => {
  /**
   * A bound, not a benchmark: the real answers are ~1.5 KB and parse in well under
   * a millisecond, so this would only fire if the parser ever became quadratic in
   * the answer's length (a rescanning or backtracking implementation). The margin
   * is deliberately enormous so the test cannot flake on a loaded machine while
   * still catching the failure mode that would actually hurt a phone.
   */
  it('parses a 40-row table in far under the frame budget', () => {
    const header = '| Product | SKU | Category | Min | Available | Location | Note |';
    const sep = '|---|---|---|---|---|---|---|';
    const rows = Array.from(
      { length: 40 },
      (_v, i) => `| Product ${i} with a longer name | SEEDSKU-${i} | Household | ${i} | ${i * 2} | Main Warehouse | Seeded movement (SEED-${i}) |`,
    );
    const big = [header, sep, ...rows].join('\n');
    expect(big.length).toBeGreaterThan(4000);

    const started = Date.now();
    const blocks = parseAssistantMarkdown(big);
    const elapsed = Date.now() - started;

    expect(blocks).toHaveLength(1);
    expect((blocks[0] as { rows: unknown[] }).rows).toHaveLength(40);
    expect(elapsed).toBeLessThan(250);
  });
});
