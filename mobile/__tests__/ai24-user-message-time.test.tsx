import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import AiChat, { MessageBubble, toRow } from '../components/AiChat';
import type { ChatRow } from '../components/AiChat';
import { aiApi } from '../lib/api';
import { useSession } from '../lib/auth';
import { ApiError } from '../lib/client';
import { ThemeProvider } from '../lib/theme-context';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

jest.mock('../lib/auth', () => ({
  useSession: jest.fn(),
  isSessionError: () => false,
}));

jest.mock('../lib/api', () => ({
  aiApi: { chat: jest.fn(), chatStream: jest.fn(), messages: jest.fn() },
}));

const chat = aiApi.chat as jest.Mock;
const chatStream = aiApi.chatStream as jest.Mock;
const messages = aiApi.messages as jest.Mock;
const mockedUseSession = useSession as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  // AI-40 — this suite is about the STORED turn's clock (AI-24), which is the same on both
  // transports. The stream is made unavailable so the existing cases keep exercising the
  // ordinary route they were written for, with one less moving part.
  chatStream.mockRejectedValue(new ApiError(404, null, 'Not found'));
  messages.mockResolvedValue({ items: [], total: 0 });
  mockedUseSession.mockReturnValue({
    user: { id: 'u1', name: 'Test Member' },
    token: 'token-u1',
    signOut: jest.fn(),
  });
});

/**
 * AI-24 — a SENT message carries its time, not just the answer.
 *
 * THE GAP, found in the source rather than on a screenshot. `MessageBubble` has always been
 * able to draw a footer on a user bubble (`styles.timeUser`, `testID="chat-time-user"`), but
 * the value it receives was never supplied: the optimistic row the screen appends while a
 * turn is in flight is built by hand with `{ key, role, content }` and no `createdAt`. So the
 * member's own message had no time at all, while the answer beside it did, and there was
 * nothing on screen to compare the answer's clock against.
 *
 * WHY THE OPTIMISTIC TIME IS THE RIGHT TIME. The server persists the USER message once the
 * model has answered (Phase 07E / M7: nothing is written until a provider succeeds), so its
 * stored `createdAt` is the moment the turn COMPLETED, not the moment it was asked. Showing
 * that on the question would label the question with the answer's clock and hide the very
 * interval the owner wants to read. The send time is therefore taken on the client, at the
 * instant the request leaves — the one honest timestamp available for this event.
 *
 * It must also SURVIVE the reload: `toRow` is the single mapping used by both the live reply
 * and a thread loaded from the server, and the server returns `userMessage` on every turn, so
 * a reopened conversation shows the stored times for both sides.
 */

const withTheme = (node: ReactNode) => render(<ThemeProvider>{node}</ThemeProvider>);

const at = (hours: number, minutes: number) => new Date(2026, 9, 19, hours, minutes).toISOString();

const row = (over: Partial<ChatRow> = {}): ChatRow => ({
  key: 'm1',
  role: 'user',
  content: 'How many products does each of my locations hold?',
  ...over,
});

describe('AI-24 the member’s message shows its own time', () => {
  it('★ a user bubble with a time renders it', async () => {
    const { getByTestId } = await withTheme(<MessageBubble item={row({ createdAt: at(9, 7) })} />);
    expect(getByTestId('chat-time-user')).toBeTruthy();
  });

  it('★ it renders in the same 12-hour form as the answer beside it', async () => {
    // The point is comparison: two times a member can subtract by eye. A 12-hour user time
    // beside a 12-hour assistant time is comparable; a 24-hour one beside it is arithmetic.
    const user = await withTheme(<MessageBubble item={row({ createdAt: at(9, 7) })} />);
    const userText = user.getByTestId('chat-time-user').props.children;

    const assistant = await withTheme(
      <MessageBubble item={row({ role: 'assistant', createdAt: at(9, 8) })} />,
    );
    const assistantText = assistant.getByTestId('chat-time-assistant').props.children;

    expect(userText).toBe('9:07 AM');
    expect(assistantText).toBe('9:08 AM');
    // Same shape: a 12-hour clock with a suffix, no bare "09:07".
    expect(String(userText)).toMatch(/^(1[0-2]|[1-9]):[0-5]\d\s(AM|PM)$/);
  });

  it('a user bubble without a time renders no footer rather than an empty one', async () => {
    const { queryByTestId } = await withTheme(<MessageBubble item={row()} />);
    expect(queryByTestId('chat-time-user')).toBeNull();
  });

  it('★ the message the member sends carries the time it was sent', async () => {
    // The real screen path, not a hand-built row: the optimistic bubble is created inside
    // `send()`, and that is the only place the send time can honestly be taken. The turn is
    // held open so the in-flight bubble is what is measured.
    let release: (value: unknown) => void = () => {};
    chat.mockImplementation(() => new Promise((resolve) => {
      release = resolve;
    }));

    const view = await withTheme(<AiChat />);
    await waitFor(() => expect(view.getByText('Ask about your inventory')).toBeTruthy());
    await fireEvent.changeText(view.getByPlaceholderText('Ask about your stock…'), 'Where is my stock?');
    void fireEvent.press(view.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(view.getByTestId('chat-time-user')).toBeTruthy());
    const shown = view.getByTestId('chat-time-user').props.children;
    expect(String(shown)).toMatch(/^(1[0-2]|[1-9]):[0-5]\d\s(AM|PM)$/);

    // Finish the turn so the component is not left with a pending update.
    release({ conversation: { id: 'c1' }, assistantMessage: { id: 'a1', content: 'ok', role: 'ASSISTANT' } });
    await waitFor(() => expect(view.getByText('ok')).toBeTruthy());
  });

  it('★ the live turn is replaced by the stored copy, so a reload shows the same rows', async () => {
    // The reply carries `userMessage` — the exact row a reopened thread reads. Merging it in
    // place of the optimistic bubble is what makes the two paths agree; without it the live
    // screen would hold a hand-built row and the reloaded one a server row, and the two could
    // drift (this is the same single-mapping rule AI-8 applied to the answer).
    chat.mockResolvedValue({
      conversation: { id: 'c1' },
      userMessage: {
        id: 'u1',
        conversationId: 'c1',
        role: 'USER',
        content: 'Where is my stock?',
        createdAt: at(11, 30),
      },
      assistantMessage: { id: 'a1', conversationId: 'c1', role: 'ASSISTANT', content: 'Main Warehouse.', createdAt: at(11, 31) },
    });

    const view = await withTheme(<AiChat />);
    await waitFor(() => expect(view.getByText('Ask about your inventory')).toBeTruthy());
    await fireEvent.changeText(view.getByPlaceholderText('Ask about your stock…'), 'Where is my stock?');
    await fireEvent.press(view.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(view.getByText('Main Warehouse.')).toBeTruthy());
    // Exactly one question bubble: the stored copy REPLACED the optimistic one rather than
    // being appended beside it, which is the failure mode a naive merge produces.
    expect(view.getAllByTestId('chat-bubble-user')).toHaveLength(1);
    // And both sides now show the server's times, one minute apart.
    expect(String(view.getByTestId('chat-time-user').props.children)).toBe('11:30 AM');
    expect(String(view.getByTestId('chat-time-assistant').props.children)).toBe('11:31 AM');
  });

  it('★ a failed send removes its bubble and gives the text back', async () => {
    // M7: a failed turn stores nothing. Leaving the bubble on screen made the member's own
    // message look delivered, and each retry stacked another copy — on the device, four
    // identical questions after a run of 503s.
    chat.mockRejectedValue(new Error('The AI service is temporarily unavailable.'));

    const view = await withTheme(<AiChat />);
    await waitFor(() => expect(view.getByText('Ask about your inventory')).toBeTruthy());
    await fireEvent.changeText(view.getByPlaceholderText('Ask about your stock…'), 'Which products are out of stock?');
    await fireEvent.press(view.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(view.queryAllByTestId('chat-bubble-user')).toHaveLength(0));
    expect(view.getByPlaceholderText('Ask about your stock…').props.value).toBe(
      'Which products are out of stock?',
    );
  });

  it('★ three failed sends leave no bubbles instead of three copies', async () => {
    // The measured shape: a database blip made every retry fail, and each failed attempt left
    // a bubble. After the recovery the answer could not be matched to any of them, so the
    // member saw their question four times.
    chat.mockRejectedValue(new Error('The AI service is temporarily unavailable.'));

    const view = await withTheme(<AiChat />);
    await waitFor(() => expect(view.getByText('Ask about your inventory')).toBeTruthy());
    for (let i = 0; i < 3; i += 1) {
      await fireEvent.press(view.getByRole('button', { name: 'Send' }));
      await waitFor(() => expect(view.queryAllByTestId('chat-bubble-user')).toHaveLength(0));
    }
    expect(view.queryAllByTestId('chat-bubble-user')).toHaveLength(0);
  });

  it('★ a stored user message maps its time through the same function as the answer', async () => {
    // `toRow` is what a reloaded thread uses. The server returns `userMessage` on every turn,
    // so the question's stored time must arrive through this mapping — otherwise the time
    // exists only until the screen is reopened.
    const mapped = toRow({
      id: 'u1',
      conversationId: 'c1',
      role: 'USER',
      content: 'Compare my two locations, how many products are in each?',
      createdAt: at(14, 5),
    } as never);
    expect(mapped.role).toBe('user');
    expect(mapped.createdAt).toBe(at(14, 5));
  });
});
