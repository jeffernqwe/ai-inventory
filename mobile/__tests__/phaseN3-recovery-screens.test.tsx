/**
 * N-3 — the two recovery screens, with both flows present at once.
 *
 * WHAT THIS FILE PINS, AND WHY EACH CASE EARNS ITS PLACE.
 *
 *   ForgotPasswordScreen (AUTH-06 rewrote this half; it no longer talks to Firebase)
 *     • the address is posted to the server, and the SUCCESS state is a navigation to the
 *       code screen — never a sentence about whether an account exists;
 *     • the request body is never rendered, so the server's uniform 202 cannot be undone;
 *     • a failure keeps the person on the screen with the server's own sentence, and a
 *       malformed address lands on the email input rather than above the form;
 *     • an empty field asks the network for nothing.
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

import { router } from 'expo-router';

import ForgotPasswordScreen from '../app/forgot-password';
import ResetPasswordScreen from '../app/reset-password';
import { requestPasswordResetCode, resetPassword } from '../lib/api';
import { ApiError } from '../lib/client';
import { clearPasswordResetPending, markPasswordResetPending, useSession } from '../lib/auth';
import {
  confirmFirebasePasswordReset,
  verifyFirebasePasswordResetCode,
} from '../lib/firebase-auth';
import { ThemeProvider } from '../lib/theme-context';

const mockParams: Record<string, unknown> = {};

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => mockParams,
  Link: ({ children }: { children?: ReactNode }) => children,
}));

jest.mock('../lib/api', () => ({
  requestPasswordResetCode: jest.fn(),
  resetPassword: jest.fn(),
}));

jest.mock('../lib/auth', () => ({
  useSession: jest.fn(),
  // N-4 — the recovery marker's writer and the definitive-failure clear. Mocked at the
  // module boundary like everything else here, so this suite pins the screen's ORDERING
  // (verify -> mark -> confirm) without touching SecureStore.
  markPasswordResetPending: jest.fn(),
  clearPasswordResetPending: jest.fn(),
}));

// The Firebase sender is GONE from this boundary (AUTH-06), so the mock offers only what the
// screens can still reach. A fake that kept it would let a reintroduced call pass unnoticed.
jest.mock('../lib/firebase-auth', () => ({
  verifyFirebasePasswordResetCode: jest.fn(),
  confirmFirebasePasswordReset: jest.fn(),
}));

const mockedRequestCode = requestPasswordResetCode as jest.Mock;
const mockedResetPassword = resetPassword as jest.Mock;
const mockedRouter = router as unknown as { push: jest.Mock; replace: jest.Mock };
const mockedConfirmFirebase = confirmFirebasePasswordReset as jest.Mock;
const mockedVerifyFirebase = verifyFirebasePasswordResetCode as jest.Mock;
const mockedMarkPending = markPasswordResetPending as jest.Mock;
const mockedClearPending = clearPasswordResetPending as jest.Mock;
const mockedUseSession = useSession as jest.Mock;

const clearSession = jest.fn(async () => {});

/** The address Firebase resolves for the fixture code. Memory-only, by design. */
const RESET_ACCOUNT_EMAIL = 'reset-owner@example.com';

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
async function requestCode(view: View, email = 'user@example.com'): Promise<void> {
  await fireEvent.changeText(view.getByPlaceholderText(EMAIL_FIELD), email);
  await fireEvent.press(view.getByRole('button', { name: 'Send reset code' }));
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
  mockedRequestCode.mockResolvedValue({});
  mockedResetPassword.mockResolvedValue({});
  // N-4 — the first Firebase step of every reset attempt now resolves the account.
  mockedVerifyFirebase.mockResolvedValue({ kind: 'verified', email: RESET_ACCOUNT_EMAIL });
  mockedMarkPending.mockResolvedValue(undefined);
  mockedClearPending.mockResolvedValue(undefined);
});

describe('AUTH-06 — Forgot Password sends ONE request and continues in the app', () => {
  it('posts the address and routes to the code screen, saying nothing about the account', async () => {
    const view = await mountForgot();
    await requestCode(view);

    await waitFor(() => expect(mockedRequestCode).toHaveBeenCalledWith('user@example.com'));
    // THE SUCCESS STATE IS A NAVIGATION. The server answers one 202 whether or not the address
    // exists, so there is no branch here that could render "no such account" — and the screen
    // never reads the response body, which is the one place this client could undo that.
    await waitFor(() =>
      expect(mockedRouter.push).toHaveBeenCalledWith({
        pathname: '/reset-password-code',
        // The address, and WHEN it was accepted: the server's 60-second resend cooldown starts
        // here, so the next screen can start its countdown instead of offering a Resend that the
        // server would silently ignore.
        params: { email: 'user@example.com', sentAt: expect.any(String) },
      })
    );
    const { params } = mockedRouter.push.mock.calls[0][0] as { params: { sentAt: string } };
    expect(Number(params.sentAt)).toBeGreaterThan(0);
    expect(view.queryByText(/Diagnostic \(dev only\)/)).toBeNull();
  });

  it('trims the address before sending it, so a stray space is not a different one', async () => {
    const view = await mountForgot();
    await requestCode(view, '  spaced@example.com  ');

    await waitFor(() => expect(mockedRequestCode).toHaveBeenCalledWith('spaced@example.com'));
  });

  it('stays on the screen with the server’s sentence when the request fails', async () => {
    mockedRequestCode.mockRejectedValue(
      new ApiError(
        503,
        'PASSWORD_RESET_CODE_NOT_CONFIGURED',
        'Password reset is temporarily unavailable. Please try again later.'
      )
    );

    const view = await mountForgot();
    await requestCode(view);

    await waitFor(() =>
      expect(
        view.getByText('Password reset is temporarily unavailable. Please try again later.')
      ).toBeTruthy()
    );
    expect(mockedRouter.push).not.toHaveBeenCalled();
    // The application code is shown to a DEVELOPER and nobody else: it names the failing side
    // without a clause being appended to the person's sentence.
    expect(
      view.getByText('Diagnostic (dev only) — server: PASSWORD_RESET_CODE_NOT_CONFIGURED')
    ).toBeTruthy();
  });

  it('reports a field problem on the input the server named', async () => {
    mockedRequestCode.mockRejectedValue(
      new ApiError(400, 'VALIDATION_ERROR', 'Please check the highlighted fields.', [
        { field: 'email', message: 'Enter a valid email address.' },
      ])
    );

    const view = await mountForgot();
    await requestCode(view);

    await waitFor(() => expect(view.getByText('Enter a valid email address.')).toBeTruthy());
    expect(mockedRouter.push).not.toHaveBeenCalled();
  });

  it('asks the network for nothing when the field is empty', async () => {
    const view = await mountForgot();
    await fireEvent.press(view.getByRole('button', { name: 'Send reset code' }));

    await waitFor(() => expect(view.getByText('Email is required')).toBeTruthy());
    expect(mockedRequestCode).not.toHaveBeenCalled();
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

    // N-4 — THE ORDER IS THE GUARANTEE: the account is established, then the marker is
    // written, and only THEN does the credential change. An interruption after this
    // sequence's second step still leaves the note behind (design §14C.3.9 M-6).
    expect(mockedVerifyFirebase).toHaveBeenCalledWith('oob-code-1');
    expect(mockedMarkPending).toHaveBeenCalledWith(RESET_ACCOUNT_EMAIL);
    const order = (fn: jest.Mock) => fn.mock.invocationCallOrder[0];
    expect(order(mockedVerifyFirebase)).toBeLessThan(order(mockedMarkPending));
    expect(order(mockedMarkPending)).toBeLessThan(order(mockedConfirmFirebase));
    // Nothing is cleared on the success path: the marker is left for the sign-in that
    // follows, which is what performs the revocation.
    expect(mockedClearPending).not.toHaveBeenCalled();
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
    // N-4 — AND NO RECOVERY MARKER. The custom flow revokes server-side as part of the
    // reset itself, so a marker here would make a later sign-in revoke the same sessions a
    // second time; the two flows must not both claim the debt.
    expect(mockedVerifyFirebase).not.toHaveBeenCalled();
    expect(mockedMarkPending).not.toHaveBeenCalled();
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
    expect(mockedVerifyFirebase).toHaveBeenCalledWith('oob-code-1');
  });

  it('names an unusable action code, and shows no success state', async () => {
    mockParams.oobCode = 'expired-code';
    mockedConfirmFirebase.mockResolvedValue({ kind: 'invalid-code' });

    const view = await mountReset();
    await submitNewPassword(view);

    await waitFor(() => expect(view.getByText(LINK_INVALID)).toBeTruthy());
    expect(view.queryByText(RESET_COMPLETED)).toBeNull();
    expect(clearSession).not.toHaveBeenCalled();
    // N-4 — a refused code is DEFINITIVE: no password changed, so nothing is owed and the
    // marker is dropped rather than left to revoke a change that never happened.
    expect(mockedClearPending).toHaveBeenCalled();
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
    // N-4 — UNDECIDED, SO THE MARKER STAYS: a transport fault can happen AFTER Firebase
    // applied the change, so the revocation is still owed and the next sign-in retries it.
    expect(mockedClearPending).not.toHaveBeenCalled();
  });

  it('still calls a link with no code incomplete, and asks for nothing', async () => {
    const view = await mountReset();

    expect(view.getByText(LINK_INCOMPLETE)).toBeTruthy();
    expect(mockedVerifyFirebase).not.toHaveBeenCalled();
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
    expect(mockedVerifyFirebase).not.toHaveBeenCalled();
    expect(mockedConfirmFirebase).not.toHaveBeenCalled();
  });
});
