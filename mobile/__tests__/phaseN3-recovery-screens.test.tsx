/**
 * N-3 — the two recovery screens, with both flows present at once.
 *
 * WHAT THIS FILE PINS, AND WHY EACH CASE EARNS ITS PLACE.
 *
 *   ForgotPasswordScreen
 *     • a Firebase send ends in the SAME fixed sentence the custom flow has always shown,
 *       so the success state cannot become a way to learn whether an address exists;
 *     • an unconfigured build falls back to the custom endpoint — the 26B/27 flow is
 *       still reachable, which is the additive half of the phase;
 *     • a Firebase FAILURE does not fall back, because an outage must not be a route to
 *       the other mail system;
 *     • a malformed address lands on the email input, and nothing else does.
 *
 *   ResetPasswordScreen
 *     • `?oobCode=` is redeemed by Firebase and NOT sent to the server endpoint;
 *     • `?token=` still goes to the server endpoint and NOT to Firebase — both links keep
 *       working, which is the whole point of landing this additively;
 *     • an unusable action code produces its own sentence and no success state;
 *     • a link with neither parameter is still "Link incomplete".
 *
 * Only the module boundaries are mocked (`expo-router` for params and navigation,
 * `lib/api` for the custom endpoints, `lib/firebase-auth` for the Firebase operations,
 * `lib/auth` for the session). The screens, their validation, and
 * `AuthLayout`/`Input`/`Button`/`Banner` are the real ones, so the copy asserted here is
 * the copy the app shows. RNTL v14 renders and dispatches asynchronously, so `render` and
 * every `fireEvent` are awaited.
 */

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import ForgotPasswordScreen from '../app/forgot-password';
import ResetPasswordScreen from '../app/reset-password';
import { forgotPassword, resetPassword } from '../lib/api';
import { useSession } from '../lib/auth';
import { confirmFirebasePasswordReset, sendFirebasePasswordResetEmail } from '../lib/firebase-auth';
import { ThemeProvider } from '../lib/theme-context';

const mockParams: Record<string, unknown> = {};

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => mockParams,
  Link: ({ children }: { children?: ReactNode }) => children,
}));

jest.mock('../lib/api', () => ({
  forgotPassword: jest.fn(),
  resetPassword: jest.fn(),
}));

jest.mock('../lib/auth', () => ({
  useSession: jest.fn(),
}));

jest.mock('../lib/firebase-auth', () => ({
  sendFirebasePasswordResetEmail: jest.fn(),
  confirmFirebasePasswordReset: jest.fn(),
}));

const mockedForgotPassword = forgotPassword as jest.Mock;
const mockedResetPassword = resetPassword as jest.Mock;
const mockedSendFirebase = sendFirebasePasswordResetEmail as jest.Mock;
const mockedConfirmFirebase = confirmFirebasePasswordReset as jest.Mock;
const mockedUseSession = useSession as jest.Mock;

const clearSession = jest.fn(async () => {});

/** The server's own fixed sentence, which the Firebase path must reproduce unchanged. */
const REQUEST_ACCEPTED =
  'If an account exists for that email, a password reset link has been sent.';
const RESET_COMPLETED = 'Password changed. Please sign in again.';
const LINK_INVALID = 'This reset link is invalid or has expired. Request a new one.';
const LINK_INCOMPLETE = 'This reset link is missing its code.';

const EMAIL_FIELD = 'you@company.com';
const PASSWORD_FIELD = 'At least 8 characters';
const CONFIRM_FIELD = 'Repeat your new password';

type View = Awaited<ReturnType<typeof render>>;

const mountForgot = (): Promise<View> =>
  render(
    <ThemeProvider>
      <ForgotPasswordScreen />
    </ThemeProvider>
  );

const mountReset = (): Promise<View> =>
  render(
    <ThemeProvider>
      <ResetPasswordScreen />
    </ThemeProvider>
  );

/** Types an address and presses the request button. */
async function requestLink(view: View, email = 'user@example.com'): Promise<void> {
  await fireEvent.changeText(view.getByPlaceholderText(EMAIL_FIELD), email);
  await fireEvent.press(view.getByRole('button', { name: 'Send reset link' }));
}

/** Fills both password fields identically and submits. */
async function submitNewPassword(view: View, password = 'newpassword1'): Promise<void> {
  await fireEvent.changeText(view.getByPlaceholderText(PASSWORD_FIELD), password);
  await fireEvent.changeText(view.getByPlaceholderText(CONFIRM_FIELD), password);
  await fireEvent.press(view.getByRole('button', { name: 'Set new password' }));
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  mockedUseSession.mockReturnValue({ clearSession });
  mockedForgotPassword.mockResolvedValue({});
  mockedResetPassword.mockResolvedValue({});
});

describe('N-3 — Forgot Password chooses the flow by the build, never by a failure', () => {
  it('sends through Firebase and shows the custom flow’s own fixed sentence', async () => {
    mockedSendFirebase.mockResolvedValue({ kind: 'sent' });

    const view = await mountForgot();
    await requestLink(view);

    await waitFor(() => expect(view.getByText(REQUEST_ACCEPTED)).toBeTruthy());
    expect(mockedSendFirebase).toHaveBeenCalledWith('user@example.com');
    // The server endpoint is untouched: nothing about this visit went near 26B.
    expect(mockedForgotPassword).not.toHaveBeenCalled();
  });

  it('falls back to the custom endpoint when the build has no Firebase configuration', async () => {
    mockedSendFirebase.mockResolvedValue({ kind: 'legacyFallback' });

    const view = await mountForgot();
    await requestLink(view);

    await waitFor(() => expect(mockedForgotPassword).toHaveBeenCalledWith('user@example.com'));
    // The same success state, so the fallback is invisible to the person using it.
    expect(view.getByText(REQUEST_ACCEPTED)).toBeTruthy();
  });

  it('does NOT fall back when Firebase is configured but failing', async () => {
    mockedSendFirebase.mockResolvedValue({
      kind: 'failure',
      code: 'auth/network-request-failed',
      message: 'Cannot reach the sign-in service. Check your connection and try again.',
    });

    const view = await mountForgot();
    await requestLink(view);

    await waitFor(() =>
      expect(
        view.getByText('Cannot reach the sign-in service. Check your connection and try again.')
      ).toBeTruthy()
    );
    expect(mockedForgotPassword).not.toHaveBeenCalled();
    expect(view.queryByText(REQUEST_ACCEPTED)).toBeNull();
  });

  it('shows a malformed address on the input rather than above the form', async () => {
    mockedSendFirebase.mockResolvedValue({
      kind: 'failure',
      code: 'auth/invalid-email',
      message: 'Enter a valid email address.',
      field: 'email',
    });

    const view = await mountForgot();
    await requestLink(view, 'not-an-email');

    await waitFor(() => expect(view.getByText('Enter a valid email address.')).toBeTruthy());
    expect(mockedForgotPassword).not.toHaveBeenCalled();
    expect(view.queryByText(REQUEST_ACCEPTED)).toBeNull();
  });

  it('asks the network for nothing when the field is empty', async () => {
    const view = await mountForgot();
    await fireEvent.press(view.getByRole('button', { name: 'Send reset link' }));

    await waitFor(() => expect(view.getByText('Email is required')).toBeTruthy());
    expect(mockedSendFirebase).not.toHaveBeenCalled();
    expect(mockedForgotPassword).not.toHaveBeenCalled();
  });
});

describe('N-3 — Reset Password accepts a Firebase code and still accepts the custom token', () => {
  it('redeems a Firebase oobCode through Firebase, not through the server', async () => {
    mockParams.oobCode = 'oob-code-1';
    mockedConfirmFirebase.mockResolvedValue({ kind: 'reset' });

    const view = await mountReset();
    await submitNewPassword(view);

    await waitFor(() =>
      expect(mockedConfirmFirebase).toHaveBeenCalledWith({
        oobCode: 'oob-code-1',
        newPassword: 'newpassword1',
      })
    );
    expect(mockedResetPassword).not.toHaveBeenCalled();
    await waitFor(() => expect(view.getByText(RESET_COMPLETED)).toBeTruthy());
    expect(clearSession).toHaveBeenCalled();
  });

  it('still sends the custom flow’s token to the existing endpoint', async () => {
    mockParams.token = 'custom-token-1';

    const view = await mountReset();
    await submitNewPassword(view);

    await waitFor(() =>
      expect(mockedResetPassword).toHaveBeenCalledWith({
        token: 'custom-token-1',
        newPassword: 'newpassword1',
        confirmPassword: 'newpassword1',
      })
    );
    expect(mockedConfirmFirebase).not.toHaveBeenCalled();
    await waitFor(() => expect(view.getByText(RESET_COMPLETED)).toBeTruthy());
  });

  it('prefers the Firebase code when a link somehow carries both', async () => {
    mockParams.oobCode = 'oob-code-1';
    mockParams.token = 'custom-token-1';
    mockedConfirmFirebase.mockResolvedValue({ kind: 'reset' });

    const view = await mountReset();
    await submitNewPassword(view);

    await waitFor(() => expect(mockedConfirmFirebase).toHaveBeenCalledTimes(1));
    expect(mockedResetPassword).not.toHaveBeenCalled();
  });

  it('names an unusable action code, and shows no success state', async () => {
    mockParams.oobCode = 'expired-code';
    mockedConfirmFirebase.mockResolvedValue({ kind: 'invalid-code' });

    const view = await mountReset();
    await submitNewPassword(view);

    await waitFor(() => expect(view.getByText(LINK_INVALID)).toBeTruthy());
    expect(view.queryByText(RESET_COMPLETED)).toBeNull();
    expect(clearSession).not.toHaveBeenCalled();
    // The remedy is reachable from here. (Asserted by text: expo-router's `Link` renders
    // as a Text, so it exposes no link role to query.)
    expect(view.getByText('Request a new link')).toBeTruthy();
  });

  it('relays a Firebase fault in the module’s own words, without succeeding', async () => {
    mockParams.oobCode = 'oob-code-1';
    mockedConfirmFirebase.mockResolvedValue({
      kind: 'failure',
      code: 'auth/network-request-failed',
      message: 'Cannot reach the sign-in service. Check your connection and try again.',
    });

    const view = await mountReset();
    await submitNewPassword(view);

    await waitFor(() =>
      expect(
        view.getByText('Cannot reach the sign-in service. Check your connection and try again.')
      ).toBeTruthy()
    );
    expect(view.queryByText(RESET_COMPLETED)).toBeNull();
  });

  it('still calls a link with no code incomplete, and asks for nothing', async () => {
    const view = await mountReset();

    expect(view.getByText(LINK_INCOMPLETE)).toBeTruthy();
    expect(mockedConfirmFirebase).not.toHaveBeenCalled();
    expect(mockedResetPassword).not.toHaveBeenCalled();
  });

  it('keeps the client-side password rules ahead of any Firebase call', async () => {
    mockParams.oobCode = 'oob-code-1';

    const view = await mountReset();
    await fireEvent.changeText(view.getByPlaceholderText(PASSWORD_FIELD), 'newpassword1');
    await fireEvent.changeText(view.getByPlaceholderText(CONFIRM_FIELD), 'differentpassword');
    await fireEvent.press(view.getByRole('button', { name: 'Set new password' }));

    await waitFor(() => expect(view.getByText('Passwords do not match')).toBeTruthy());
    // A mistyped confirmation must not spend the code: the outcome would be a lost link.
    expect(mockedConfirmFirebase).not.toHaveBeenCalled();
  });
});
