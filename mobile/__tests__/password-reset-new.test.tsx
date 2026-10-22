/**
 * AUTH-06 (two-step recovery) — STEP TWO: choosing the new password.
 *
 * WHY THIS SUITE EXISTS. This screen is the only place in the recovery journey that writes a
 * credential, so the properties pinned here are the ones that stop it being reachable without a
 * verified code:
 *
 *   • With no verification in memory the screen renders the "verify first" state and no password
 *     field at all — the client half of "cannot bypass code verification".
 *   • The server half is the authorization itself: even if the form were reached, the request it
 *     sends carries no email and no code, only the credential the verify step minted.
 *   • A mistyped confirmation and a weak password are refused BEFORE the request, because the
 *     server refuses them before spending the authorization and the person should not have to
 *     discover that from an error.
 *   • A definitive refusal (an expired or already-used authorization) drops the form and sends the
 *     person back to the code, because retrying that form can only fail.
 *   • Success clears both the authorization and THIS device's session, then shows the honest next
 *     step: sign in with the new password.
 *
 * Only module boundaries are mocked (`expo-router`, `lib/api`, `lib/auth`); the real theme
 * provider, screen and components are used.
 */

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import ResetPasswordNewScreen from '../app/reset-password-new';
import { confirmPasswordResetCode } from '../lib/api';
import { useSession } from '../lib/auth';
import { ApiError } from '../lib/client';
import {
  beginVerifiedReset,
  clearVerifiedReset,
  readVerifiedReset,
} from '../lib/passwordResetSession';
import { ThemeProvider } from '../lib/theme-context';

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    replace: (...args: unknown[]) => mockReplace(...args),
    push: jest.fn(),
    back: jest.fn(),
  },
  useLocalSearchParams: () => ({}),
  Link: ({ children }: { children?: ReactNode }) => children,
}));

jest.mock('../lib/api', () => ({ confirmPasswordResetCode: jest.fn() }));

jest.mock('../lib/auth', () => ({ useSession: jest.fn() }));

const mockedConfirm = confirmPasswordResetCode as jest.Mock;
const mockedUseSession = useSession as jest.Mock;
const mockClearSession = jest.fn(async () => {});

const EMAIL = 'reset-me@example.com';
const RESET_TOKEN = 'authorization-value-abcdefghijklmnopqrstuvwxyz';
const PASSWORD_FIELD = 'At least 8 characters';
const CONFIRM_FIELD = 'Repeat your new password';
const SUBMIT = 'Set new password';
const RESET_COMPLETED = 'Password changed. Please sign in again.';
const EXPIRED_COPY =
  'That verification has expired. Verify your reset code again to continue.';

type View = Awaited<ReturnType<typeof render>>;

const mount = async (): Promise<View> =>
  render(
    <ThemeProvider>
      <ResetPasswordNewScreen />
    </ThemeProvider>
  );

/** Records a successful verification exactly as step one would. */
const verify = (expiresInSeconds = 900): void => {
  beginVerifiedReset({ email: EMAIL, resetToken: RESET_TOKEN, expiresInSeconds });
};

async function fillAndSubmit(
  view: View,
  {
    password = 'newpassword1',
    confirm = password,
  }: { password?: string; confirm?: string } = {}
): Promise<void> {
  if (password) await fireEvent.changeText(view.getByPlaceholderText(PASSWORD_FIELD), password);
  if (confirm) await fireEvent.changeText(view.getByPlaceholderText(CONFIRM_FIELD), confirm);
  await fireEvent.press(view.getByRole('button', { name: SUBMIT }));
}

beforeEach(() => {
  jest.clearAllMocks();
  clearVerifiedReset();
  mockedUseSession.mockReturnValue({ clearSession: mockClearSession });
  mockedConfirm.mockResolvedValue({ message: RESET_COMPLETED });
});

describe('AUTH-06 — the password step cannot be reached without a verification', () => {
  it('★ renders the verify-first state and no password field when nothing was verified', async () => {
    const view = await mount();

    expect(view.getByText('Verify your code first')).toBeTruthy();
    expect(view.getByText(EXPIRED_COPY)).toBeTruthy();
    expect(view.queryByPlaceholderText(PASSWORD_FIELD)).toBeNull();
    expect(view.queryByPlaceholderText(CONFIRM_FIELD)).toBeNull();
    expect(view.queryByRole('button', { name: SUBMIT })).toBeNull();

    await fireEvent.press(view.getByRole('button', { name: 'Start again' }));
    expect(mockReplace).toHaveBeenCalledWith('/forgot-password');
    expect(mockedConfirm).not.toHaveBeenCalled();
  });

  it('★ treats an authorization past its window as absent, before anything is typed', async () => {
    // The server would refuse it too; the screen refuses to show a form that can only fail.
    verify(0);

    const view = await mount();

    expect(view.getByText('Verify your code first')).toBeTruthy();
    expect(view.queryByPlaceholderText(PASSWORD_FIELD)).toBeNull();
    expect(readVerifiedReset()).toBeNull();
  });
});

describe('AUTH-06 — the client refuses what the server would refuse later', () => {
  it('asks for a password rather than sending an empty one', async () => {
    verify();
    const view = await mount();
    await fillAndSubmit(view, { password: '', confirm: '' });

    await waitFor(() => expect(view.getByText('New password is required')).toBeTruthy());
    expect(mockedConfirm).not.toHaveBeenCalled();
  });

  it('applies the shared password policy before the network', async () => {
    verify();
    const view = await mount();
    await fillAndSubmit(view, { password: 'short', confirm: 'short' });

    await waitFor(() =>
      expect(view.getByText('Password must be at least 8 characters')).toBeTruthy()
    );
    expect(mockedConfirm).not.toHaveBeenCalled();
  });

  it('★ refuses a mismatched confirmation BEFORE the authorization is spent', async () => {
    verify();
    const view = await mount();
    await fillAndSubmit(view, { password: 'newpassword1', confirm: 'differentpassword' });

    await waitFor(() => expect(view.getByText('Passwords do not match')).toBeTruthy());
    // The server also checks this before spending the authorization; the client check exists so
    // the guaranteed-refused request is never made in the first place.
    expect(mockedConfirm).not.toHaveBeenCalled();
  });
});

describe('AUTH-06 — a verified authorization sets the password', () => {
  it('★ posts only the authorization and the password, then sends the person to sign in', async () => {
    verify();
    const view = await mount();
    await fillAndSubmit(view);

    await waitFor(() =>
      expect(mockedConfirm).toHaveBeenCalledWith({
        resetToken: RESET_TOKEN,
        newPassword: 'newpassword1',
        confirmPassword: 'newpassword1',
      })
    );
    // NOTHING ELSE. No email, no code: the account is resolved from the authorization, so there is
    // no field here that could point the write at somebody else.
    const payload = mockedConfirm.mock.calls[0][0];
    expect(Object.keys(payload).sort()).toEqual(['confirmPassword', 'newPassword', 'resetToken']);

    await waitFor(() => expect(view.getByText(RESET_COMPLETED)).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Go to sign in' }));
    expect(mockReplace).toHaveBeenCalledWith('/login');
    // NO SESSION IS APPLIED AND NO `(app)` ROUTE IS REACHED. The server ended every session as
    // part of the reset, so signing in again is both the truthful next step and the person's
    // proof that the new password works.
    expect(view.queryByPlaceholderText(PASSWORD_FIELD)).toBeNull();
  });

  it('★ drops the authorization and THIS device’s session on success', async () => {
    // A spent authorization must not linger in memory, and a stored client token would make *Go to
    // sign in* reach `/login`, which sees `signedIn` and redirects into the app on a session the
    // server has already ended.
    verify();
    const view = await mount();
    await fillAndSubmit(view);

    await waitFor(() => expect(view.getByText(RESET_COMPLETED)).toBeTruthy());
    expect(readVerifiedReset()).toBeNull();
    expect(mockClearSession).toHaveBeenCalledTimes(1);
  });

  it('keeps the session and the authorization when the request fails for another reason', async () => {
    verify();
    mockedConfirm.mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'Something broke.'));

    const view = await mount();
    await fillAndSubmit(view);

    await waitFor(() => expect(view.getByText('Something broke.')).toBeTruthy());
    expect(mockClearSession).not.toHaveBeenCalled();
    expect(readVerifiedReset()?.resetToken).toBe(RESET_TOKEN);
  });
});

describe('AUTH-06 — an expired authorization restarts the journey', () => {
  it('★ drops the form and explains what to do when the server refuses the authorization', async () => {
    verify();
    mockedConfirm.mockRejectedValue(
      new ApiError(
        400,
        'INVALID_PASSWORD_RESET_AUTHORIZATION',
        'That verification has expired. Please verify your reset code again.'
      )
    );

    const view = await mount();
    await fillAndSubmit(view);

    await waitFor(() => expect(view.getByText('Verify your code first')).toBeTruthy());
    expect(view.queryByPlaceholderText(PASSWORD_FIELD)).toBeNull();
    expect(readVerifiedReset()).toBeNull();
    expect(mockClearSession).not.toHaveBeenCalled();

    await fireEvent.press(view.getByRole('button', { name: 'Start again' }));
    expect(mockReplace).toHaveBeenCalledWith('/forgot-password');
  });

  it('lets the person abandon the journey from the form', async () => {
    verify();
    const view = await mount();

    await fireEvent.press(view.getByText('Start over'));

    expect(mockReplace).toHaveBeenCalledWith('/forgot-password');
    expect(readVerifiedReset()).toBeNull();
  });
});

describe('AUTH-06 — field problems land on the input the server named', () => {
  it('shows a long-password refusal on the password field', async () => {
    verify();
    mockedConfirm.mockRejectedValue(
      new ApiError(400, 'VALIDATION_ERROR', 'Please check the highlighted fields.', [
        { field: 'newPassword', message: 'password must be at most 72 characters' },
      ])
    );

    const view = await mount();
    await fillAndSubmit(view);

    await waitFor(() =>
      expect(view.getByText('password must be at most 72 characters')).toBeTruthy()
    );
    expect(view.queryByText(RESET_COMPLETED)).toBeNull();
  });
});
