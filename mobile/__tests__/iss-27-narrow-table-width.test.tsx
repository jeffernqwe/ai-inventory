/**
 * ISS-27 — a narrow table needs a width to fill, or it collapses.
 *
 * FOUND ON THE DEVICE 2026-10-14, immediately after §27BS verified the opposite case.
 * The assistant was asked for a **two-column** table. The answer was stored correctly,
 * the API returned it, and on the phone the message area looked **empty**: the answer's
 * cells measured **48 px wide and up to 1 452 px tall** in the accessibility tree, with
 * the whole answer squeezed into a ~200 px column and the question pushed off the top of
 * the screen.
 *
 * WHY THE 4-COLUMN CASE DID NOT SHOW IT. AI-4 renders a table with more than three
 * columns as one card per row, and those cards looked right on the device — but only
 * because a card's *title* is long enough ("Heavy Duty Detergent 10057") to give the
 * bubble a wide intrinsic width. A grid of two short columns has nothing to give it one:
 * a `flexDirection: 'row'` grid inside a shrink-wrapped bubble has no width to share, so
 * its `flex: 1` cells fall back to their minimum, every value wraps to a character or two
 * per line, and the height explodes. The card path's escape was luck, so this fix covers
 * **both** paths rather than only the one the screenshot showed.
 *
 * WHAT THIS SUITE CAN AND CANNOT PIN. Jest does not do layout, so no test here can catch
 * a 48 px column — that is exactly why the defect needed a phone. What it pins is the
 * **wiring**: a table answer asks for the wide bubble, a prose answer does not, a user
 * bubble never does, and the table's structure and values survive the change. The layout
 * itself is verified by rendering the same stored answer on the device.
 */

import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { MessageBubble } from '../components/AiChat';
import { ThemeProvider } from '../lib/theme-context';

const withTheme = (node: ReactNode) => render(<ThemeProvider>{node}</ThemeProvider>);

interface Rendered {
  toJSON: () => unknown;
  getByTestId: (t: string) => { props: Record<string, unknown> };
  queryByTestId: (t: string) => unknown;
  getByText: (t: string) => { props: Record<string, unknown> };
}

/** Flatten a style prop (which may be an array) into a single object. */
function flattenStyle(style: unknown): Record<string, unknown> {
  if (!style) return {};
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flattenStyle));
  return style as Record<string, unknown>;
}

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

/** The real stored answer, verbatim: two columns, five rows, no trailing prose. */
const TWO_COLUMN_TABLE = [
  '| Product Name | Quantity |',
  '|--------------|----------|',
  '| Mini Sponge 10074 | 0 |',
  '| Premium Tape 10069 | 0 |',
  '| Heavy Duty Detergent 10057 | 0 |',
  '| Professional Battery 10051 | 0 |',
  '| Heavy Duty Cable 10045 | 0 |',
].join('\n');

const assistant = (content: string) => ({ key: 'k', role: 'assistant' as const, content });
const user = (content: string) => ({ key: 'k', role: 'user' as const, content });

describe('ISS-27 — a table answer asks for the full bubble width', () => {
  it('★ a two-column table gets the wide bubble, because 48 px columns are not a table', async () => {
    const view = (await withTheme(<MessageBubble item={assistant(TWO_COLUMN_TABLE)} />)) as unknown as Rendered;
    const style = flattenStyle(view.getByTestId('chat-bubble-assistant').props.style);
    // The single fact the layout depends on: a definite width to share.
    expect(style.flex).toBe(1);
  });

  it('leaves a prose answer with its natural bubble', async () => {
    const view = (await withTheme(
      <MessageBubble item={assistant('Nothing is out of stock right now.')} />,
    )) as unknown as Rendered;
    const style = flattenStyle(view.getByTestId('chat-bubble-assistant').props.style);
    expect(style.flex).toBeUndefined();
  });

  it('leaves a heading-and-list answer alone too — only a table needs the width', async () => {
    const answer = ['## Out of Stock', '- Pro Cable 1000', '- Everyday Battery 1001'].join('\n');
    const view = (await withTheme(<MessageBubble item={assistant(answer)} />)) as unknown as Rendered;
    const style = flattenStyle(view.getByTestId('chat-bubble-assistant').props.style);
    expect(style.flex).toBeUndefined();
  });

  it('never widens the member’s own bubble, even when they type a pipe', async () => {
    const view = (await withTheme(<MessageBubble item={user('name | quantity')} />)) as unknown as Rendered;
    const style = flattenStyle(view.getByTestId('chat-bubble-user').props.style);
    expect(style.flex).toBeUndefined();
    expect(view.queryByTestId('chat-bubble-assistant')).toBeNull();
  });
});

describe('ISS-27 — the wide bubble does not change what the table renders', () => {
  it('still renders the two-column table as a grid, with every value', async () => {
    const view = (await withTheme(<MessageBubble item={assistant(TWO_COLUMN_TABLE)} />)) as unknown as Rendered;
    expect(view.getByTestId('assistant-md-table-grid')).toBeTruthy();
    const text = collectText(view.toJSON());
    // Header labels and all five rows, values included — the `0`s are the ones a
    // collapsed column hides first, and the ones §27BS had to measure in pixels.
    expect(text).toContain('Product Name');
    expect(text).toContain('Quantity');
    for (const name of [
      'Mini Sponge 10074',
      'Premium Tape 10069',
      'Heavy Duty Detergent 10057',
      'Professional Battery 10051',
      'Heavy Duty Cable 10045',
    ]) {
      expect(text).toContain(name);
    }
    expect(text.filter((t) => t === '0')).toHaveLength(5);
    // And no marker reaches the screen, wide bubble or not.
    expect(text.join('')).not.toContain('|');
  });
});
