import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { MessageBubble } from '../components/AiChat';
import type { ChatRow } from '../components/AiChat';
import { ThemeProvider } from '../lib/theme-context';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

/**
 * AI-17 — the numbers in the corner of every reply read as a time on sight.
 *
 * THE DEFECT, seen on the device 2026-10-19. Each bubble ended with a bare `02:33` drawn
 * small and grey in the bottom-right corner. Nobody reading an answer could tell whether
 * that was when the message was written, how long the answer took, or a token count — the
 * owner asked whether it was a response time, which is the only evidence needed that the
 * format failed. It was `formatTime(createdAt)`: the message's own clock time, in 24-hour
 * notation, unlabelled.
 *
 * WHAT THIS SUITE PINS. The value is unchanged (it is not a duration, and inventing one
 * from the client's clock would not be the same number the server measures); what changed is
 * the format — 12-hour with an AM/PM suffix, which cannot be read as a metric. A
 * "Sent"/"Answered" prefix was tried on the device first and the owner rejected it as
 * clutter, so the assertion that matters here is that the bare 24-hour form never comes
 * back. The assertions build the date from LOCAL calendar parts, so they hold whatever
 * timezone the runner is in.
 */

const withTheme = (node: ReactNode) => render(<ThemeProvider>{node}</ThemeProvider>);

const at = (hours: number, minutes: number) => new Date(2026, 9, 19, hours, minutes).toISOString();

const row = (over: Partial<ChatRow> = {}): ChatRow => ({
  key: 'm1',
  role: 'assistant',
  content: 'Main Warehouse holds 203 product-location rows.',
  ...over,
});

describe('AI-17 a message footer reads as a clock time', () => {
  it('★ renders the assistant’s time as a 12-hour clock, with no label', async () => {
    const { getByTestId, getByText, queryByText } = await withTheme(
      <MessageBubble item={row({ createdAt: at(14, 5) })} />,
    );

    const footer = getByTestId('chat-time-assistant');
    expect(footer).toBeTruthy();
    expect(getByText('2:05 PM')).toBeTruthy();
    // The owner's call, 2026-10-19: the prefix words cluttered the bubble.
    expect(queryByText(/Answered/)).toBeNull();
    expect(queryByText(/Sent/)).toBeNull();
    // The old output was exactly this string; seeing it again means the ambiguity is back.
    expect(footer.props.children).not.toBe('14:05');
  });

  it('★ renders the member’s own message the same way', async () => {
    const { getByTestId, getByText } = await withTheme(
      <MessageBubble item={row({ role: 'user', content: 'Show me the inventory in Main Warehouse.', createdAt: at(9, 7) })} />,
    );

    expect(getByTestId('chat-time-user')).toBeTruthy();
    expect(getByText('9:07 AM')).toBeTruthy();
  });

  it('renders no footer at all when the server sent no timestamp', async () => {
    const { queryByTestId } = await withTheme(<MessageBubble item={row()} />);
    expect(queryByTestId('chat-time-assistant')).toBeNull();
    expect(queryByTestId('chat-time-user')).toBeNull();
  });

  it('never prints the raw 24-hour form on either bubble', async () => {
    // The regression guard: whatever else changes, a four-digit 24-hour time must not
    // reappear in the corner, or the meaning is ambiguous again.
    const assistant = await withTheme(<MessageBubble item={row({ createdAt: at(22, 45) })} />);
    expect(assistant.queryByText('22:45')).toBeNull();
    expect(assistant.getByText('10:45 PM')).toBeTruthy();

    const member = await withTheme(
      <MessageBubble item={row({ role: 'user', createdAt: at(0, 30) })} />,
    );
    expect(member.queryByText('00:30')).toBeNull();
    expect(member.getByText('12:30 AM')).toBeTruthy();
  });
});
