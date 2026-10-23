/**
 * Auth continuity — the five small things a person actually notices.
 *
 * Each case here exists because the screen was technically correct and still unhelpful:
 *
 *   1. CREATE ACCOUNT did not declare what its fields HOLD, so a password manager could
 *      not fill the address it already had or offer to generate a password — on the one
 *      screen in the app where that matters most. Login and the new-password screen
 *      already declared it; these assertions keep the three from drifting apart again.
 *   2. A FIELD ERROR OUTLIVED THE VALUE IT DESCRIBED. Correcting a field left the red
 *      message underneath it, so a form that was already right still looked wrong until
 *      the next submit. Editing a field now clears that field's message and nothing else.
 *   3. A CODE'S LIFETIME WAS STATIC TEXT. "It expires in 10 minutes" described when the
 *      code was issued, not how long it had left, so an expired code was indistinguishable
 *      from a wrong one until the server refused it. Both code screens now count down
 *      from their own send instant and say plainly when the code is gone.
 *   4. THE CODE SCREENS NEVER NAMED THE INBOX. "Which address did I use?" is the first
 *      question a missing code raises, and the address was already in hand.
 *   5. A COLD START STRANDED A VERIFIED IDENTITY with no Inventory AI account: the
 *      business-name form is armed from memory, so after a restart the only way back was
 *      retyping a password Firebase had already accepted. Login now offers one tap.
 *
 * Only `expo-router` and `lib/auth` are mocked; every component rendered is the real one,
 * so the copy asserted here is the copy the app shows.
 */

import { act, fireEvent, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useSession } from '../lib/auth';
import { ThemeProvider } from '../lib/theme-context';

import LoginScreen from '../app/login';
import RegisterScreen from '../app/register';
import ResetPasswordCodeScreen from '../app/reset-password-code';
import ResetPasswordNewScreen from '../app/reset-password-new';
import VerifyEmailScreen from '../app/verify-email';
import { beginVerifiedReset } from '../lib/passwordResetSession';

const mockParams: Record<string, unknown> = {};
const mockReplace = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    router: {
      replace: (...args: unknown[]) => mockReplace(...args),
      push: (...args: unknown[]) => mockPush(...args),
      back: jest.fn(),
    },
    useLocalSearchParams: () => mockParams,
    Redirect: () => null,
    Link: ({ children }: { children?: ReactNode }) => <Text>{children}</Text>,
  };
});

jest.mock('../lib/auth', () => ({
  useSession: jest.fn(),
}));

const mockedUseSession = useSession as jest.Mock;

const signIn = jest.fn();
const signInWithGoogle = jest.fn();
const continueWithPersistedIdentity = jest.fn();
const requestVerificationCode = jest.fn();
const confirmVerificationCode = jest.fn();

const TTL_MINUTES = 10;

type View = Awaited<ReturnType<typeof render>>;

const mount = (node: React.ReactElement): Promise<View> =>
  render(<ThemeProvider>{node}</ThemeProvider>);

/** The session a signed-out screen sees, with only the fields it reads. */
function signedOutSession(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: 'signedOut',
    user: null,
    firebaseOnboarding: 'none',
    firebaseRegistrationRequired: false,
    hasResumableFirebaseIdentity: false,
    firebaseAccountEmail: null,
    signIn,
    signInWithGoogle,
    continueWithPersistedIdentity,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  mockedUseSession.mockReturnValue(signedOutSession());
  signIn.mockResolvedValue(undefined);
  continueWithPersistedIdentity.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// 1. Autofill
// ---------------------------------------------------------------------------

describe('what the Create Account fields declare to the platform', () => {
  it('★ tells the password manager the email, so it can fill an address it already has', async () => {
    const view = await mount(<RegisterScreen />);
    const email = view.getByPlaceholderText('you@company.com');

    expect(email.props.autoComplete).toBe('email');
    expect(email.props.textContentType).toBe('emailAddress');
  });

  it('★ declares NEW password, which is what makes a generated password offerable', async () => {
    const view = await mount(<RegisterScreen />);
    const password = view.getByPlaceholderText('At least 8 characters');

    // `current-password` here would ask for an existing credential — on an account that
    // does not exist yet. The distinction is the whole reason this assertion exists.
    expect(password.props.autoComplete).toBe('new-password');
    expect(password.props.textContentType).toBe('newPassword');
  });

  it('capitalises the two name fields, which Input defaults off for code fields', async () => {
    const view = await mount(<RegisterScreen />);

    expect(view.getByPlaceholderText('Acme Retail').props.autoCapitalize).toBe('words');
    expect(view.getByPlaceholderText('Jane Doe').props.autoCapitalize).toBe('words');
  });
});

// ---------------------------------------------------------------------------
// 2. Editing clears the message that described the old value
// ---------------------------------------------------------------------------

describe('a corrected field stops looking wrong', () => {
  it('★ Login clears each field message on typing, without touching the other one', async () => {
    const view = await mount(<LoginScreen />);

    await fireEvent.press(view.getByRole('button', { name: 'Sign In' }));
    expect(view.getByText('Email is required')).toBeTruthy();
    expect(view.getByText('Password is required')).toBeTruthy();

    await fireEvent.changeText(view.getByPlaceholderText('you@company.com'), 'o');

    expect(view.queryByText('Email is required')).toBeNull();
    // The password error describes a field that is still empty, so it stays.
    expect(view.getByText('Password is required')).toBeTruthy();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('★ Create Account clears only the field being edited', async () => {
    const view = await mount(<RegisterScreen />);

    await fireEvent.press(view.getByRole('button', { name: 'Create Account' }));
    expect(view.getByText('Business name is required')).toBeTruthy();
    expect(view.getByText('Name is required')).toBeTruthy();

    await fireEvent.changeText(view.getByPlaceholderText('Acme Retail'), 'A');

    expect(view.queryByText('Business name is required')).toBeNull();
    expect(view.getByText('Name is required')).toBeTruthy();
  });

  it('★ the reset password step clears its own messages too', async () => {
    // Reaching the form needs a verified authorization; the screen reads it from memory.
    beginVerifiedReset({
      email: 'owner@example.com',
      resetToken: 'authorization-value',
      expiresInSeconds: 900,
    });

    const view = await mount(<ResetPasswordNewScreen />);

    await fireEvent.press(view.getByRole('button', { name: 'Set new password' }));
    expect(view.getByText('New password is required')).toBeTruthy();

    await fireEvent.changeText(view.getByPlaceholderText('At least 8 characters'), 'a');

    expect(view.queryByText('New password is required')).toBeNull();
    expect(view.getByText('Confirm password is required')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 3 & 4. The code's lifetime, and the inbox it went to
// ---------------------------------------------------------------------------

describe('a code counts down from its own send, and names its inbox', () => {
  const NOW = new Date('2026-10-23T09:00:00.000Z').getTime();

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    mockedUseSession.mockReturnValue(
      signedOutSession({
        firebaseOnboarding: 'verify-email',
        hasResumableFirebaseIdentity: false,
        firebaseAccountEmail: 'owner@example.com',
        verificationCodeIssuedAt: NOW,
        requestVerificationCode,
        confirmVerificationCode,
        retryVerificationResume: jest.fn(),
        cancelFirebaseOnboarding: jest.fn(),
        verificationEntryError: null,
        clearVerificationEntryError: jest.fn(),
      })
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('★ names the address, so nobody has to guess which inbox to check', async () => {
    const view = await mount(<VerifyEmailScreen />);

    expect(view.getByText('We sent the code to owner@example.com.')).toBeTruthy();
  });

  it('★ counts the remaining life down instead of repeating the issue-time lifetime', async () => {
    const view = await mount(<VerifyEmailScreen />);

    expect(view.getByText('Code expires in 10m')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });

    expect(view.getByText('Code expires in 9m')).toBeTruthy();
  });

  it('★ says the code has expired instead of leaving the person to be refused', async () => {
    mockedUseSession.mockReturnValue(
      signedOutSession({
        firebaseOnboarding: 'verify-email',
        firebaseAccountEmail: 'owner@example.com',
        verificationCodeIssuedAt: NOW - (TTL_MINUTES + 1) * 60_000,
        requestVerificationCode,
        confirmVerificationCode,
        retryVerificationResume: jest.fn(),
        cancelFirebaseOnboarding: jest.fn(),
        verificationEntryError: null,
        clearVerificationEntryError: jest.fn(),
      })
    );

    const view = await mount(<VerifyEmailScreen />);

    expect(view.getByText('That code has expired. Send a new one to continue.')).toBeTruthy();
    // The resend control stays available — that sentence is an instruction, not a dead end.
    // Its 60-second cooldown is long over, so it offers the resend itself.
    expect(view.getByRole('button', { name: 'Resend verification code' })).toBeTruthy();
  });

  it('★ the reset code screen does the same, from its own send instant', async () => {
    mockParams.email = 'reset-me@example.com';
    mockParams.sentAt = String(NOW - (TTL_MINUTES + 1) * 60_000);

    const view = await mount(<ResetPasswordCodeScreen />);

    expect(view.getByText(/^Enter the 6-digit code we emailed to reset-me@example.com\./)).toBeTruthy();
    expect(view.getByText('That code has expired. Send a new one to continue.')).toBeTruthy();
  });

  it('the reset code screen counts down while the code is live', async () => {
    mockParams.email = 'reset-me@example.com';
    mockParams.sentAt = String(NOW);

    const view = await mount(<ResetPasswordCodeScreen />);

    expect(view.getByText('Code expires in 10m')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(120_000);
    });

    expect(view.getByText('Code expires in 8m')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 5. The one-tap resume
// ---------------------------------------------------------------------------

describe('a verified account already on this device', () => {
  it('★ is offered on Login, and pressing it performs exactly one exchange', async () => {
    mockedUseSession.mockReturnValue(
      signedOutSession({ hasResumableFirebaseIdentity: true })
    );

    const view = await mount(<LoginScreen />);

    expect(view.getByText('You are already signed in on this device.')).toBeTruthy();
    const button = view.getByRole('button', { name: 'Continue with saved account' });

    await fireEvent.press(button);

    expect(continueWithPersistedIdentity).toHaveBeenCalledTimes(1);
    // It is NOT a password sign-in: no credential is sent.
    expect(signIn).not.toHaveBeenCalled();
  });

  it('★ is absent when no identity was found, so the form is not decorated for nothing', async () => {
    const view = await mount(<LoginScreen />);

    expect(view.queryByRole('button', { name: 'Continue with saved account' })).toBeNull();
    expect(view.queryByText('You are already signed in on this device.')).toBeNull();
  });

  it('★ shows the server refusal and stays usable when the resume is refused', async () => {
    mockedUseSession.mockReturnValue(
      signedOutSession({ hasResumableFirebaseIdentity: true })
    );
    continueWithPersistedIdentity.mockRejectedValue(
      new Error('Could not sign in right now. Please try again.')
    );

    const view = await mount(<LoginScreen />);
    await fireEvent.press(view.getByRole('button', { name: 'Continue with saved account' }));

    expect(
      await view.findByText('Could not sign in right now. Please try again.')
    ).toBeTruthy();
    // The form is still there — a refused resume is a wait, not a dead end.
    expect(view.getByPlaceholderText('you@company.com')).toBeTruthy();
  });
});
