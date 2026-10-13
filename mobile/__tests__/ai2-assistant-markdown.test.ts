/**
 * AI-2 — the assistant's answer reaches the screen without visible Markdown.
 *
 * THE DEFECT (ISS-23, seen on the device on 2026-10-12). The chat bubble renders
 * inside a React Native `<Text>`, which is not an HTML or Markdown renderer, so a
 * model that formats its answer the way models do was shown formatting the member
 * was never meant to see. The exact observation, §27BE sample 4:
 *
 *     **no products that need restocking**
 *
 * rendered with both sets of asterisks on the screen.
 *
 * The fix is deliberately NOT a Markdown renderer: adding one would be a new
 * dependency, and the assistant's answers are inventory prose where the markers are
 * noise rather than structure. `stripMarkdown` removes only the markers that are
 * meaningless as plain text and leaves everything else — including list bullets,
 * which already read correctly — exactly as it is.
 *
 * THE TEST THAT MATTERS MOST HERE is the one about underscores. This app is full of
 * identifiers that contain them (SKU_123, product codes, snake_case field names), so
 * a naive `_emphasis_` rule would silently corrupt the very data the assistant
 * exists to report. Emphasis on underscores is therefore only honoured when paired
 * and doubled, and this suite fails if that ever loosens.
 */

// AI-4 moved `stripMarkdown` from `components/AiChat` into `lib/assistantMarkdown`,
// where it is now the residual pass of the structure parser. The assertions below
// are unchanged: the function and its guarantees did not move, only its address.
// It also gained a word boundary (pinned in the AI-4 suite), which is why two
// cases were added there rather than by loosening anything here.
import { stripMarkdown } from '../lib/assistantMarkdown';

describe('AI-2 — Markdown markers are removed from the assistant bubble', () => {
  it('removes bold asterisks — the exact shape seen on the device', () => {
    expect(stripMarkdown('**no products that need restocking**')).toBe(
      'no products that need restocking',
    );
  });

  it('removes bold in the middle of a sentence', () => {
    expect(stripMarkdown('There are **3** products low on stock.')).toBe(
      'There are 3 products low on stock.',
    );
  });

  it('removes doubled-underscore bold', () => {
    expect(stripMarkdown('__Widget A__ is out of stock.')).toBe('Widget A is out of stock.');
  });

  it('removes single-asterisk emphasis', () => {
    expect(stripMarkdown('That item is *critical* now.')).toBe('That item is critical now.');
  });

  it('removes inline code backticks', () => {
    expect(stripMarkdown('The SKU `WID-001` has 4 left.')).toBe('The SKU WID-001 has 4 left.');
  });

  it('keeps fenced code content but drops the fence', () => {
    expect(stripMarkdown('```\nWID-001  4\n```')).toBe('WID-001  4');
  });

  it('drops heading hashes', () => {
    expect(stripMarkdown('### Low stock\n3 products')).toBe('Low stock\n3 products');
  });
});

describe('AI-2 — everything that is not a marker is left alone', () => {
  it('leaves plain prose untouched', () => {
    const prose = 'You have 12 units of Widget A at Main Warehouse, 3 of them reserved.';
    expect(stripMarkdown(prose)).toBe(prose);
  });

  it('never mangles identifiers that contain underscores', () => {
    // The regression this rule exists for: these are real data, not emphasis.
    const codes = 'SKU_123_AB, product_code, snake_case and MIN_STOCK_LEVEL';
    expect(stripMarkdown(codes)).toBe(codes);
  });

  it('leaves multiplication alone, because a lone asterisk is not always emphasis', () => {
    expect(stripMarkdown('12 * 3 = 36 units in total')).toBe('12 * 3 = 36 units in total');
  });

  it('leaves list bullets alone — they already read correctly as text', () => {
    expect(stripMarkdown('- Widget A: 3\n- Widget B: 0')).toBe('- Widget A: 3\n- Widget B: 0');
  });

  it('leaves a hash that is not a heading', () => {
    expect(stripMarkdown('#1 selling product')).toBe('#1 selling product');
  });

  it('handles an empty answer without inventing one', () => {
    expect(stripMarkdown('')).toBe('');
  });
});
