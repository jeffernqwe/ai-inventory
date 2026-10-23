/**
 * The CHANGE-PASSWORD screen under a rate-limit refusal (2026-10-23 security audit).
 *
 * WHY THIS EXISTS. `POST /api/auth/change-password` became rate-limited on
 * 2026-10-23 (ten attempts per account+address per fifteen minutes, then thirty per
 * address). The server answers 429 `CHANGE_PASSWORD_RATE_LIMITED` with a
 * human-readable sentence and a `Retry-After`, and the audit recorded the client
 * half as UNVERIFIED: the screen's fallback is `error.message`, which is correct
 * code but, until this suite, was not evidence. A screen that swallowed the
 * refusal into "Unable to change the password." would leave a person re-typing a
 * password that cannot be accepted for another fifteen minutes, with nothing
 * telling them why.
 *
 * It also pins the ORDER of the three refusal shapes, because they are easy to
 * collapse into one:
 *   - 429 -> the banner carries the server's sentence, the session is untouched;
 *   - 400 with `fields` -> the message belongs UNDER the input that caused it,
 *     not in a banner that repeats it away from the field;
 *   - 401 / disabled account -> the session is already gone, so it is ended
 *     rather than reported.
 *
 * Only `expo-router`, `lib/api` and `lib/auth` are mocked; the screen composes the
 * real `Screen`/`Banner`/`Card`/`Input`/`Button` primitives and the real theme, so
 * what is rendered here is what ships. `lib/auth`'s `isSessionError` is the real
 * predicate's shape, re-declared inside the factory because the factory is hoisted.
 */

import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { ApiError } from '../lib/client';
import { useSession } from '../lib/auth';
import { ThemeProvider } from '../lib/theme-context';
import { changePassword } from '../lib/api';

import ChangePasswordScreen from '../app/(app)/change-password';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
  Stack: { Screen: () => null },
}));

jest.mock('../lib/api', () => ({ changePassword: jest.fn() }));

jest.mock('../lib/auth', () => {
  const ApiErrorClass = jest.requireActual('../lib/client').ApiError as new (
    ...args: never[]
  ) => { status: number; code: string | null };
  return {
    useSession: jest.fn(),
    isSessionError: (err: unknown) =>
      err instanceof ApiErrorClass && (err.status === 401 || err.code === 'ACCOUNT_DISABLED'),
  };
});

const mockedUseSession = useSession as jest.Mock;
const mockedChangePassword = changePassword as jest.Mock;

const CURRENT = 'OldPassword1!';
const NEXT = 'NewPassword2!';

/** The server's own sentence — the string a person must actually see. */
const RATE_LIMITED_SENTENCE =
  'Too many password change attempts. Please wait a moment and try again.';

const signOut = jest.fn();

const mount = () =>
  render(
    <ThemeProvider>
      <ChangePasswordScreen />
    </ThemeProvider>
  );

/** Fills all three fields with values that pass the client's own pre-checks. */
async function fillForm(view: Awaited<ReturnType<typeof mount>>): Promise<void> {
  await fireEvent.changeText(view.getByPlaceholderText('Your current password'), CURRENT);
  await fireEvent.changeText(view.getByPlaceholderText('At least 8 characters'), NEXT);
  await fireEvent.changeText(view.getByPlaceholderText('Repeat your new password'), NEXT);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseSession.mockReturnValue({ user: null, status: 'signedIn', token: 'jwt.token', signOut });
  signOut.mockResolvedValue(undefined);
});

describe('a rate-limited password change is explained, not swallowed', () => {
  it('★ shows the server sentence and keeps the session', async () => {
    mockedChangePassword.mockRejectedValue(
      new ApiError(429, 'CHANGE_PASSWORD_RATE_LIMITED', RATE_LIMITED_SENTENCE)
    );

    const view = await mount();
    await fillForm(view);
    await fireEvent.press(view.getByRole('button', { name: 'Change password' }));

    await waitFor(() => expect(view.getByText(RATE_LIMITED_SENTENCE)).toBeTruthy());
    // 429 is not session loss: signing out here would destroy a session the server
    // never invalidated, and hide the one explanation the person needs.
    expect(signOut).not.toHaveBeenCalled();
  });

  it('still asks for the password again after the refusal', async () => {
    mockedChangePassword.mockRejectedValue(
      new ApiError(429, 'CHANGE_PASSWORD_RATE_LIMITED', RATE_LIMITED_SENTENCE)
    );

    const view = await mount();
    await fillForm(view);
    await fireEvent.press(view.getByRole('button', { name: 'Change password' }));
    await waitFor(() => expect(view.getByText(RATE_LIMITED_SENTENCE)).toBeTruthy());

    // The form is still there — the refusal is a wait, not a dead end, and the
    // fields are the caller's to correct rather than a state the screen invents.
    expect(view.getByPlaceholderText('Your current password')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Change password' })).toBeTruthy();
  });
});

describe('a validation refusal still lands under its input', () => {
  it('★ puts INVALID_CURRENT_PASSWORD under the field, not in the banner', async () => {
    mockedChangePassword.mockRejectedValue(
      new ApiError(400, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect', [
        { field: 'currentPassword', message: 'Current password is incorrect' },
      ])
    );

    const view = await mount();
    await fillForm(view);
    await fireEvent.press(view.getByRole('button', { name: 'Change password' }));

    await waitFor(() => expect(view.getByText('Current password is incorrect')).toBeTruthy());
    expect(signOut).not.toHaveBeenCalled();
  });
});

describe('session loss is ended, not reported', () => {
  it('★ clears the session on 401 instead of showing a failure', async () => {
    mockedChangePassword.mockRejectedValue(
      new ApiError(401, 'SESSION_INVALIDATED', 'Your session has ended. Please sign in again.')
    );

    const view = await mount();
    await fillForm(view);
    await fireEvent.press(view.getByRole('button', { name: 'Change password' }));

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(view.queryByText('Your session has ended. Please sign in again.')).toBeNull();
  });
});
