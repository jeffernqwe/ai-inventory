import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { resetPassword } from '../lib/api';
import { useSession } from '../lib/auth';
import { ThemeProvider } from '../lib/theme-context';

import ResetPasswordScreen from '../app/reset-password';

/**
 * MOD-10A — a second reset link supersedes the first, and the screen must be
 * indistinguishable from a freshly opened one when it does.
 *
 * Phase 27 built that as a `useEffect(..., [token])` that synchronously cleared
 * every piece of form state. That effect is what MOD-09 flagged as
 * `react-hooks/set-state-in-effect`; MOD-10A replaces it with component identity
 * (`key={token}`), which resets the same six values by remounting the form.
 *
 * These cases pin the *behaviour* rather than the mechanism, so they hold the
 * line across that rewrite: a link carrying a different token must leave nothing
 * of the previous attempt behind — not typed passwords, not a validation error,
 * and not a success state, which a fresh attempt must never inherit.
 *
 * Only the module boundaries are mocked (`expo-router` for the route params,
 * `lib/auth` for the session, `lib/api` for the network). The screen itself, its
 * validation, and `AuthLayout`/`Input`/`Button` are the real ones.
 *
 * RNTL v14 renders and dispatches asynchronously, so `render`/`rerender` and
 * every `fireEvent` are awaited; an un-awaited one leaves the tree mid-update.
 */

const mockParams: { token?: unknown } = { token: 'token-a' };

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => mockParams,
  Link: ({ children }: { children?: ReactNode }) => children,
}));

jest.mock('../lib/auth', () => ({
  useSession: jest.fn(),
}));

jest.mock('../lib/api', () => ({
  resetPassword: jest.fn(),
}));

const mockedUseSession = useSession as jest.Mock;
const mockedResetPassword = resetPassword as jest.Mock;

const clearSession = jest.fn(async () => {});

const PASSWORD_FIELD = 'At least 8 characters';
const CONFIRM_FIELD = 'Repeat your new password';
const RESET_COMPLETED = 'Password changed. Please sign in again.';
const VALIDATION_ERROR = 'Passwords do not match';

/** RNTL v14 renders asynchronously, so a mounted view is what `render` resolves to. */
type View = Awaited<ReturnType<typeof render>>;

const mount = (): Promise<View> =>
  render(
    <ThemeProvider>
      <ResetPasswordScreen />
    </ThemeProvider>
  );

const remount = (view: View): Promise<void> =>
  view.rerender(
    <ThemeProvider>
      <ResetPasswordScreen />
    </ThemeProvider>
  );

/** The text the user sees in a field is the `value` its TextInput is given. */
const shownIn = (view: View, placeholder: string): string | undefined =>
  view.getByPlaceholderText(placeholder).props.value;

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.token = 'token-a';
  mockedUseSession.mockReturnValue({ clearSession });
  mockedResetPassword.mockResolvedValue({});
});

describe('reset-password — the rules a new password must satisfy', () => {
  /**
   * This screen CHOOSES a password, so its length rule matters here in a way it never
   * does at sign-in (where a minimum would be a guess about an existing account). The
   * minimum was checked all along; the 72-character ceiling was the server's alone, so
   * an over-long password travelled there and came back under the input as "password
   * must be at most 72 characters" — a sentence written for a developer.
   */
  it('★ refuses an over-long password without spending the reset link', async () => {
    const view = await mount();
    const tooLong = 'a'.repeat(73);
    await fireEvent.changeText(view.getByPlaceholderText(PASSWORD_FIELD), tooLong);
    await fireEvent.changeText(view.getByPlaceholderText(CONFIRM_FIELD), tooLong);
    await fireEvent.press(view.getByRole('button', { name: 'Set new password' }));

    expect(view.getByText('Password must be at most 72 characters')).toBeTruthy();
    // Load-bearing: a token is single-use, so spending it on a request the server will
    // refuse is a link burned for nothing.
    expect(mockedResetPassword).not.toHaveBeenCalled();
  });

  it('still reports a short password in the sentence it always used', async () => {
    const view = await mount();
    await fireEvent.changeText(view.getByPlaceholderText(PASSWORD_FIELD), 'short1');
    await fireEvent.changeText(view.getByPlaceholderText(CONFIRM_FIELD), 'short1');
    await fireEvent.press(view.getByRole('button', { name: 'Set new password' }));

    expect(view.getByText('Password must be at least 8 characters')).toBeTruthy();
    expect(mockedResetPassword).not.toHaveBeenCalled();
  });

  it('★ reports an UNTOUCHED confirmation as missing, not as a mismatch', async () => {
    // "Passwords do not match" under a field nobody has typed in names the wrong
    // problem, and reads as though something had been compared.
    const view = await mount();
    await fireEvent.changeText(view.getByPlaceholderText(PASSWORD_FIELD), 'newpassword1');
    await fireEvent.press(view.getByRole('button', { name: 'Set new password' }));

    expect(view.getByText('Confirm password is required')).toBeTruthy();
    expect(view.queryByText(VALIDATION_ERROR)).toBeNull();
    expect(mockedResetPassword).not.toHaveBeenCalled();
  });

  it('still reports a non-empty confirmation that differs as a mismatch', async () => {
    const view = await mount();
    await fireEvent.changeText(view.getByPlaceholderText(PASSWORD_FIELD), 'newpassword1');
    await fireEvent.changeText(view.getByPlaceholderText(CONFIRM_FIELD), 'differentpassword');
    await fireEvent.press(view.getByRole('button', { name: 'Set new password' }));

    expect(view.getByText(VALIDATION_ERROR)).toBeTruthy();
    expect(mockedResetPassword).not.toHaveBeenCalled();
  });
});

describe('reset-password — a new link starts a clean attempt', () => {
  it('keeps what the user typed while the link is unchanged', async () => {
    const view = await mount();
    await fireEvent.changeText(view.getByPlaceholderText(PASSWORD_FIELD), 'firstpassword');
    expect(shownIn(view, PASSWORD_FIELD)).toBe('firstpassword');

    // A re-render that is not a new link — a theme change, a session refresh —
    // must not discard the form.
    await remount(view);

    expect(shownIn(view, PASSWORD_FIELD)).toBe('firstpassword');
  });

  it('clears the entered passwords and the validation error when a different token arrives', async () => {
    const view = await mount();
    await fireEvent.changeText(view.getByPlaceholderText(PASSWORD_FIELD), 'firstpassword');
    await fireEvent.changeText(view.getByPlaceholderText(CONFIRM_FIELD), 'secondpassword');
    await fireEvent.press(view.getByRole('button', { name: 'Set new password' }));

    expect(view.getByText(VALIDATION_ERROR)).toBeTruthy();
    expect(mockedResetPassword).not.toHaveBeenCalled();

    mockParams.token = 'token-b';
    await remount(view);

    expect(shownIn(view, PASSWORD_FIELD)).toBe('');
    expect(shownIn(view, CONFIRM_FIELD)).toBe('');
    expect(view.queryByText(VALIDATION_ERROR)).toBeNull();
  });

  it('clears a completed reset when a different token arrives', async () => {
    const view = await mount();
    await fireEvent.changeText(view.getByPlaceholderText(PASSWORD_FIELD), 'firstpassword');
    await fireEvent.changeText(view.getByPlaceholderText(CONFIRM_FIELD), 'firstpassword');
    await fireEvent.press(view.getByRole('button', { name: 'Set new password' }));

    await waitFor(() => expect(view.getByText(RESET_COMPLETED)).toBeTruthy());
    expect(mockedResetPassword).toHaveBeenCalledWith({
      token: 'token-a',
      newPassword: 'firstpassword',
      confirmPassword: 'firstpassword',
    });

    mockParams.token = 'token-b';
    await remount(view);

    expect(view.queryByText(RESET_COMPLETED)).toBeNull();
    expect(view.getByText('Set a new password')).toBeTruthy();
    expect(shownIn(view, PASSWORD_FIELD)).toBe('');
  });
});
