import { fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { MessageBubble } from '../components/AiChat';
import type { ChatRow } from '../components/AiChat';
import { ThemeProvider } from '../lib/theme-context';
import { toolLabel } from '../lib/toolLabels';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

/**
 * AI-26 — the restock link is an affordance, not a consolation prize for a truncated answer.
 *
 * THE DEFECT, found while verifying the link on the phone (2026-10-19). The link existed only
 * inside the `degraded === 'OUTPUT_LIMIT'` branch, so the ONE answer that most needs it — a
 * complete answer that showed five of 8,976 and said "the full list is on the matching screen
 * in the app" — offered no way to get there. It worked only when the model happened to run
 * out of output tokens, which is a page-size accident, not the member's situation.
 *
 * WHY THE CONDITION IS `toolsUsed`, NOT `degraded`. The screen that can show the whole list is
 * decided by which tool produced the answer (the three stock-list reads share the reorder
 * endpoint), and the stored message already carries that list for the provenance chip. So this
 * adds no field, no request and no server change — and it cannot point a prose answer at an
 * unrelated screen, which is the mistake the original condition existed to avoid.
 */

const withTheme = (node: ReactNode) => render(<ThemeProvider>{node}</ThemeProvider>);

const row = (over: Partial<ChatRow> = {}): ChatRow => ({
  key: 'm1',
  role: 'assistant',
  content: 'You have 8,976 products that need restocking. Here are the first five…',
  ...over,
});

describe('AI-26 a stock-list answer can be opened in full', () => {
  it('★ offers the link on a COMPLETE restock answer', async () => {
    const { getByTestId, queryByTestId } = await withTheme(
      <MessageBubble item={row({ toolsUsed: ['getReorderNeededProducts'] })} />,
    );

    // It is a complete answer: no truncation note, and the link all the same.
    expect(queryByTestId('chat-incomplete-note')).toBeNull();
    fireEvent.press(getByTestId('chat-restock-link'));
    expect(router.push).toHaveBeenCalledWith('/restock');
  });

  it('offers it for every stock-list tool', async () => {
    for (const tool of ['getReorderNeededProducts', 'getLowStockProducts', 'getOutOfStockProducts']) {
      const { getByTestId } = await withTheme(<MessageBubble item={row({ toolsUsed: [tool] })} />);
      expect(getByTestId('chat-restock-link')).toBeTruthy();
    }
  });

  it('offers nothing for an answer that is not a stock list', async () => {
    const { queryByTestId } = await withTheme(
      <MessageBubble item={row({ toolsUsed: ['getInventorySummary'] })} />,
    );
    expect(queryByTestId('chat-restock-link')).toBeNull();
  });

  it('offers nothing on the member’s own message', async () => {
    const { queryByTestId } = await withTheme(
      <MessageBubble item={row({ role: 'user', toolsUsed: ['getReorderNeededProducts'] })} />,
    );
    expect(queryByTestId('chat-restock-link')).toBeNull();
  });

  it('still shows the truncation note without a link when the answer was prose', async () => {
    const { getByTestId, queryByTestId } = await withTheme(
      <MessageBubble item={row({ degraded: 'OUTPUT_LIMIT', toolsUsed: ['getInventoryHistory'] })} />,
    );
    expect(getByTestId('chat-incomplete-note')).toBeTruthy();
    expect(queryByTestId('chat-restock-link')).toBeNull();
  });

  it('labels the AI-23 location read instead of falling back to a humanised name', () => {
    // The fallback would read "Location breakdown"; the label is a deliberate word, and the
    // point of the assertion is that the decision was made rather than inherited.
    expect(toolLabel('getLocationBreakdown')).toBe('Stock by location');
  });
});
