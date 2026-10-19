import { fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { MessageBubble, restockPathForTools, toRow } from '../components/AiChat';
import type { ChatRow } from '../components/AiChat';
import { ThemeProvider } from '../lib/theme-context';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

/**
 * AI-8 — a truncated answer is labelled, not silently passed off as complete.
 *
 * THE DEFECT (ISS-29). An answer cut off by `AI_MAX_OUTPUT_TOKENS` was stored and
 * rendered as a finished one: seen on the device 2026-10-14 with `out=800` exactly at
 * the cap and the body ending mid-list at `3. Ultra Sponge 18982 - available 2`. The
 * member had no way to tell that answer from a complete one.
 *
 * WHY THE SERVER CANNOT DO THIS ALONE. The partial answer is a real answer — the first
 * rows are what was asked for — so the fix keeps it and marks the turn. The mark is a
 * machine-readable reason (`degraded: 'OUTPUT_LIMIT'`); this surface owns the sentence,
 * exactly as it owns the other UI copy. Two properties matter and are pinned here:
 * **the answer is still there**, and **only a truncated answer gets the note** — the
 * canned reasons already say the turn failed, so a second warning under them would be
 * noise on top of an apology.
 *
 * `toRow` is exercised directly as well as through the bubble, because it is the ONE
 * place a server message becomes a row: the live reply and a reloaded thread both go
 * through it, so a field dropped here would be dropped on the screen that produced it
 * and present on the thread reopened later (or the reverse) — the drift this suite exists
 * to prevent.
 */

const withTheme = (node: ReactNode) => render(<ThemeProvider>{node}</ThemeProvider>);

const INCOMPLETE = /hit the length limit/i;

const row = (over: Partial<ChatRow> = {}): ChatRow => ({
  key: 'm1',
  role: 'assistant',
  content: '1. Everyday Towel 60624 - available 416',
  ...over,
});

describe('AI-8 an incomplete answer is labelled', () => {
  it('★ shows the note on a truncated answer', async () => {
    const { getByTestId, getByText } = await withTheme(
      <MessageBubble item={row({ degraded: 'OUTPUT_LIMIT' })} />,
    );

    expect(getByText(INCOMPLETE)).toBeTruthy();
    // The whole point of keeping the text: it must still be on screen beside the note.
    // Matched as a substring because the answer is RENDERED (AI-4) — the list marker is
    // its own node — which is also why the truncated answer is a realistic fixture rather
    // than plain prose.
    expect(getByText(/Everyday Towel 60624/)).toBeTruthy();
    expect(getByTestId('chat-incomplete-note')).toBeTruthy();
  });

  it('leaves a complete answer unlabelled', async () => {
    const { queryByTestId } = await withTheme(<MessageBubble item={row()} />);
    expect(queryByTestId('chat-incomplete-note')).toBeNull();
  });

  it('never labels the member’s own message, whatever the server said', async () => {
    // A user row is the member's own words; there is nothing to be incomplete about.
    const { queryByTestId } = await withTheme(
      <MessageBubble item={row({ role: 'user', degraded: 'OUTPUT_LIMIT' })} />,
    );
    expect(queryByTestId('chat-incomplete-note')).toBeNull();
  });

  it('does not add a second warning to the canned reasons', async () => {
    // `EMPTY_COMPLETION` and `ITERATION_LIMIT` replace the answer with a sentence that
    // already says the turn did not produce one. Stacking "may be incomplete" under an
    // apology is noise, and worse, it would suggest part of an answer was available.
    const empty = await withTheme(
      <MessageBubble
        item={row({
          content: 'I could not generate a response right now. Please try again.',
          degraded: 'EMPTY_COMPLETION',
        })}
      />,
    );
    expect(empty.queryByTestId('chat-incomplete-note')).toBeNull();

    const steps = await withTheme(
      <MessageBubble
        item={row({
          content: 'I could not finish that request within the allowed number of steps. Please try a more specific question.',
          degraded: 'ITERATION_LIMIT',
        })}
      />,
    );
    expect(steps.queryByTestId('chat-incomplete-note')).toBeNull();
  });
});

describe('AI-8 the note leads somewhere a long list can be read (§27CR)', () => {
  it('offers the restock list when the truncated answer came from a restock tool', async () => {
    const { getByTestId } = await withTheme(
      <MessageBubble item={row({ degraded: 'OUTPUT_LIMIT', toolsUsed: ['getReorderNeededProducts'] })} />,
    );

    const link = getByTestId('chat-restock-link');
    fireEvent.press(link);

    expect(router.push).toHaveBeenCalledWith('/restock');
  });

  it('offers nothing when the truncation was not a stock list', async () => {
    // The sentence stays; only a link that would genuinely show the rest is added, so a
    // truncated prose answer is never pointed at an unrelated screen.
    const { getByTestId, getByText, queryByTestId } = await withTheme(
      <MessageBubble item={row({ degraded: 'OUTPUT_LIMIT', toolsUsed: ['getInventorySummary'] })} />,
    );

    expect(getByTestId('chat-incomplete-note')).toBeTruthy();
    expect(queryByTestId('chat-restock-link')).toBeNull();
    // With nowhere to send them, the advice to narrow the question is the only remedy
    // there is — and it must still be there.
    expect(getByText(/ask a narrower question/i)).toBeTruthy();
  });

  it('stops telling a member to narrow the question when the full list is one tap away', async () => {
    const { getByTestId, queryByText } = await withTheme(
      <MessageBubble item={row({ degraded: 'OUTPUT_LIMIT', toolsUsed: ['getLowStockProducts'] })} />,
    );

    expect(getByTestId('chat-restock-link')).toBeTruthy();
    expect(queryByText(/ask a narrower question/i)).toBeNull();
  });

  it('maps only the three stock-list tools, and needs no tool list to answer', () => {
    expect(restockPathForTools(['getLowStockProducts'])).toBe('/restock');
    expect(restockPathForTools(['getOutOfStockProducts'])).toBe('/restock');
    expect(restockPathForTools(['searchProducts', 'getReorderNeededProducts'])).toBe('/restock');
    expect(restockPathForTools(['getInventoryHistory'])).toBeNull();
    expect(restockPathForTools(undefined)).toBeNull();
    expect(restockPathForTools([])).toBeNull();
  });
});

describe('AI-8 the mark survives the row mapping', () => {
  it('carries the reason from a server message into the row', () => {
    const mapped = toRow({ id: 'm9', role: 'ASSISTANT', content: 'partial', degraded: 'OUTPUT_LIMIT' });
    expect(mapped).toMatchObject({ key: 'm9', role: 'assistant', content: 'partial', degraded: 'OUTPUT_LIMIT' });
  });

  it('omits it when the server sent none, so nothing can label a complete answer', () => {
    const mapped = toRow({ id: 'm9', role: 'ASSISTANT', content: 'complete' });
    expect(mapped.degraded).toBeUndefined();
  });
});
