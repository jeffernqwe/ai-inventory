/**
 * Authentication UX hardening — three defects a person could actually meet.
 *
 *   1. REGISTRATION SENT THE ADDRESS UNTRIMMED. `login.tsx` has trimmed it for a while;
 *      `register.tsx` passed the raw field through to `signUp()`, which in a
 *      Firebase-configured build hands it to `createUserWithEmailAndPassword`. A trailing
 *      space is invisible on a phone keyboard, and it either created an identity under a
 *      padded address or came back as `auth/invalid-email` for an address the person can
 *      see is correct. The two name fields had the same shape of bug in the other
 *      direction: the required-field guard judged `businessName.trim()` and then sent the
 *      untrimmed value, so the validation and the request disagreed.
 *
 *   2. THE RESEND COOLDOWN BLOCKED VERIFYING. `verify-email.tsx` included the resend
 *      cooldown in the VERIFY button's `disabled`, so for a minute after any code was
 *      sent (or resent) the code in the inbox could not be submitted. The cooldown
 *      belongs to the send control, which still carries it.
 *
 *   3. THE CODE'S LIFETIME WAS NEVER STATED. "That verification code is invalid or has
 *      expired" is the server's single refusal for wrong, expired and exhausted, so an
 *      expired code was indistinguishable from a typo unless the screen says how long a
 *      code lives. The subtitle now states it, and the number is pinned to the server's
 *      own `EMAIL_VERIFICATION_TTL_MINUTES` so the two cannot drift.
 *
 * Only `expo-router` and `lib/auth` are mocked. The screens and their
 * `AuthLayout`/`Banner`/`Input`/`Button` are real, so the assertions are about what a
 * person actually meets.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { fireEvent, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useSession } from '../lib/auth';
import { ThemeProvider } from '../lib/theme-context';

import RegisterScreen from '../app/register';
import VerifyEmailScreen from '../app/verify-email';

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
    Redirect: () => null,
    Link: ({ children }: { href: string; children?: ReactNode }) => <Text>{children}</Text>,
  };
});

jest.mock('../lib/auth', () => ({
  useSession: jest.fn(),
}));

const mockedUseSession = useSession as jest.Mock;

type View = Awaited<ReturnType<typeof render>>;

const mount = (element: React.ReactElement): Promise<View> =>
  render(<ThemeProvider>{element}</ThemeProvider>);

const fill = async (view: View, placeholder: string, text: string): Promise<void> => {
  await fireEvent.changeText(view.getByPlaceholderText(placeholder), text);
};

// ---------------------------------------------------------------------------
// 1. Registration trims before it sends
// ---------------------------------------------------------------------------

describe('registration submits trimmed values', () => {
  const signUp = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseSession.mockReturnValue({ status: 'signedOut', user: null, signUp });
    signUp.mockResolvedValue(undefined);
  });

  it('★ trims the email, the business name and the name before sign-up', async () => {
    const view = await mount(<RegisterScreen />);

    await fill(view, 'Acme Retail', '  Acme Retail  ');
    await fill(view, 'Jane Doe', '  Jane Doe  ');
    await fill(view, 'you@company.com', '  owner@example.com  ');
    await fill(view, 'At least 8 characters', 'Password123!');
    await fill(view, 'Repeat your password', 'Password123!');

    await fireEvent.press(view.getByRole('button', { name: 'Create Account' }));

    expect(signUp).toHaveBeenCalledTimes(1);
    expect(signUp).toHaveBeenCalledWith({
      businessName: 'Acme Retail',
      name: 'Jane Doe',
      email: 'owner@example.com',
      password: 'Password123!',
    });
  });

  it('keeps the password byte-for-byte, including its spaces', async () => {
    const view = await mount(<RegisterScreen />);

    await fill(view, 'Acme Retail', 'Acme');
    await fill(view, 'Jane Doe', 'Ada');
    await fill(view, 'you@company.com', 'owner@example.com');
    await fill(view, 'At least 8 characters', ' Pass word 123 ');
    await fill(view, 'Repeat your password', ' Pass word 123 ');

    await fireEvent.press(view.getByRole('button', { name: 'Create Account' }));

    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({ password: ' Pass word 123 ' })
    );
  });

  it('still refuses whitespace-only required fields instead of sending an empty name', async () => {
    const view = await mount(<RegisterScreen />);

    await fill(view, 'Acme Retail', '   ');
    await fill(view, 'Jane Doe', '   ');
    await fill(view, 'you@company.com', 'owner@example.com');
    await fill(view, 'At least 8 characters', 'Password123!');
    await fill(view, 'Repeat your password', 'Password123!');

    await fireEvent.press(view.getByRole('button', { name: 'Create Account' }));

    expect(view.getByText('Business name is required')).toBeTruthy();
    expect(view.getByText('Name is required')).toBeTruthy();
    expect(signUp).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 2 + 3. The verification screen's controls and its stated lifetime
// ---------------------------------------------------------------------------

describe('verification screen', () => {
  const requestVerificationCode = jest.fn();
  const confirmVerificationCode = jest.fn();
  const cancelFirebaseOnboarding = jest.fn();
  const clearVerificationEntryError = jest.fn();

  const baseSession = {
    status: 'signedOut',
    user: null,
    firebaseOnboarding: 'verify-email',
    requestVerificationCode,
    confirmVerificationCode,
    retryVerificationResume: jest.fn(),
    cancelFirebaseOnboarding,
    verificationEntryError: null,
    clearVerificationEntryError,
    verificationCodeIssuedAt: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseSession.mockReturnValue(baseSession);
    requestVerificationCode.mockResolvedValue(undefined);
    confirmVerificationCode.mockResolvedValue(null);
  });

  it('★ keeps Verify usable while the resend cooldown is running', async () => {
    const view = await mount(<VerifyEmailScreen />);

    // A successful send starts the screen's 60-second cooldown...
    await fireEvent.press(view.getByRole('button', { name: 'Send verification code' }));
    expect(requestVerificationCode).toHaveBeenCalledTimes(1);
    // ...which is visible on the SECONDARY control only (the label formats 60s as 1m).
    expect(view.getByText(/Resend code in (\d+m( \d+s)?|\d+s)/)).toBeTruthy();

    // The code is in the inbox and the person types it. Verify must work NOW.
    await fill(view, '123456', '654321');
    const verify = view.getByRole('button', { name: 'Verify' });
    expect(verify.props.accessibilityState?.disabled).toBe(false);

    await fireEvent.press(verify);
    expect(confirmVerificationCode).toHaveBeenCalledWith('654321');
  });

  it('still disables Verify with no code entered', async () => {
    const view = await mount(<VerifyEmailScreen />);
    const verify = view.getByRole('button', { name: 'Verify' });
    expect(verify.props.accessibilityState?.disabled).toBe(true);
  });

  it('does not send a second code while the cooldown is running', async () => {
    const view = await mount(<VerifyEmailScreen />);
    await fireEvent.press(view.getByRole('button', { name: 'Send verification code' }));

    // The control is now a disabled countdown, so pressing it again cannot spend a
    // request that the server would answer with a guaranteed 429.
    expect(view.queryByRole('button', { name: 'Send verification code' })).toBeNull();
    expect(requestVerificationCode).toHaveBeenCalledTimes(1);
  });

  it('★ opens knowing registration already sent a code', async () => {
    // REGISTRATION SENDS BEFORE IT NAVIGATES, so this is the ordinary arrival. The screen
    // used to open on an enabled "Send verification code" — a control whose only possible
    // answer was the server's 60-second resend refusal — and asked the person to enter a
    // code it did not admit had been sent.
    mockedUseSession.mockReturnValue({
      ...baseSession,
      verificationCodeIssuedAt: Date.now(),
    });

    const view = await mount(<VerifyEmailScreen />);

    expect(view.getByText(/Enter the 6-digit code we emailed you/)).toBeTruthy();
    // The server's window is already running, so the control is the countdown and nothing
    // can be sent — and nothing was sent BY THIS MOUNT.
    expect(view.getByText(/^Resend code in /)).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Send verification code' })).toBeNull();
    expect(requestVerificationCode).not.toHaveBeenCalled();
  });

  it('★ a sign-in journey says a code WILL be sent, not that one was', async () => {
    // The other arrival: an unverified identity signed in. No code has been mailed for this
    // attempt, so the send is the live action and the copy must not pretend otherwise.
    const view = await mount(<VerifyEmailScreen />);

    expect(view.getByText(/We'll email you a 6-digit code/)).toBeTruthy();
    expect(view.getByRole('button', { name: 'Send verification code' })).toBeTruthy();
    expect(view.queryByText(/^Resend code in /)).toBeNull();
  });

  it('★ a short code cannot spend one of the five attempts', async () => {
    // The server caps a challenge at five tries and answers every refusal — wrong, expired,
    // exhausted — with one sentence. An unfinished entry is not a guess, so it must be
    // refused here rather than described to the person as a wrong code.
    const view = await mount(<VerifyEmailScreen />);

    await fill(view, '123456', '12345');
    expect(
      view.getByRole('button', { name: 'Verify' }).props.accessibilityState?.disabled
    ).toBe(true);

    // The keyboard's Go key reaches the same guard, not the network.
    await fireEvent(view.getByPlaceholderText('123456'), 'submitEditing');
    expect(confirmVerificationCode).not.toHaveBeenCalled();
    expect(view.getByText('Enter the 6-digit code from your email.')).toBeTruthy();

    // The sixth digit makes it a real attempt again.
    await fill(view, '123456', '123456');
    expect(
      view.getByRole('button', { name: 'Verify' }).props.accessibilityState?.disabled
    ).toBe(false);
  });

  it('★ states the code lifetime, and its number is the server’s own', async () => {
    const view = await mount(<VerifyEmailScreen />);
    expect(view.getByText(/expires in 10 minutes/)).toBeTruthy();

    // The server constant, read out of its own source rather than restated here — the
    // guard `lib/validation.ts` already uses for its email and password rules. If the
    // window changes server-side, this fails instead of the screen lying to a person.
    const serverFile = path.join(
      __dirname,
      '..',
      '..',
      'server',
      'src',
      'constants',
      'emailVerification.ts'
    );
    const source = fs.readFileSync(serverFile, 'utf8');
    const match = /EMAIL_VERIFICATION_TTL_MINUTES\s*=\s*(\d+)/.exec(source);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBe(10);
  });
});
