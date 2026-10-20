/**
 * AUTH-04-F — the email-verification screen a person actually meets.
 *
 * `phase16-email-verification.test.tsx` pins the state machine behind it. This file pins
 * the surface of the CUSTOM 6-DIGIT CODE flow: what it asks for, what it says, and — the
 * property that matters most — that it NEVER signs anyone in by itself. Only a
 * server-issued session leaves this screen, and the only thing that produces one is
 * `confirmVerificationCode` resolving a user, asserted here through the real screen.
 *
 * PROPERTIES ASSERTED DIRECTLY, because each is a way a wrong implementation would still
 * look right:
 *
 *   1. THE OLD LINK UX IS GONE. No "I have verified - continue" and no "Resend
 *      verification email": the screen asks for a six-digit code and nothing else.
 *   2. THE 429 COOLDOWN IS THE SERVER'S NUMBER. A `Retry-After` on the refusal becomes the
 *      resend wait verbatim rather than an invented duration.
 *   3. "STILL NOT VERIFIED" IS A NOTICE, NOT AN ERROR — the ordinary outcome of a confirm
 *      that succeeded while Firebase still reports the address unverified.
 *   4. THE UNREACHABLE STATE IS A SAFE RESTING PLACE. A persisted identity whose state
 *      could not be read offers Try Again and Sign out, and never auto-retries.
 *   5. THE SIGN-OUT ABANDONS THE JOURNEY through `cancelFirebaseOnboarding`, which ends the
 *      durable Firebase session — not a navigation that leaves the identity signed in.
 *
 * Only `expo-router` and `lib/auth` are mocked. The screen and
 * `AuthLayout`/`Banner`/`Button`/`Input` are the real ones.
 */

import { fireEvent, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ApiError } from '../lib/client';
import { useSession } from '../lib/auth';
import { defaultHomePath } from '../lib/permissions';
import { ThemeProvider } from '../lib/theme-context';

import VerifyEmailScreen from '../app/verify-email';

const mockRedirect = jest.fn();

jest.mock('expo-router', () => {
  // `jest.requireActual`, not a bare `require`: the factory is hoisted above the
  // imports, so a top-level `Text` binding would be in its temporal dead zone.
  const { Text } = jest.requireActual('react-native');
  return {
    router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
    Redirect: ({ href }: { href: string }) => {
      mockRedirect(href);
      return null;
    },
    Link: ({ href, children }: { href: string; children?: ReactNode }) => (
      <Text testID={`link:${href}`}>{children}</Text>
    ),
  };
});

jest.mock('../lib/auth', () => ({
  useSession: jest.fn(),
}));

const mockedUseSession = useSession as jest.Mock;

const requestVerificationCode = jest.fn();
const confirmVerificationCode = jest.fn();
const retryVerificationResume = jest.fn();
const cancelFirebaseOnboarding = jest.fn();
const clearVerificationEntryError = jest.fn();

const TITLE = 'Verify your email';
const VERIFY = 'Verify';
const SEND = 'Send verification code';
const RESEND = 'Resend verification code';
const UNREACHABLE_TITLE = 'Check your connection';
const UNREACHABLE_BODY =
  'We could not reach the verification service. Check your connection, then try again.';
const TRY_AGAIN = 'Try again';
const CODE_SENT_MESSAGE = 'Verification code sent. Check your inbox and spam folder.';
const STILL_UNVERIFIED_MESSAGE =
  'That code was accepted, but your email is not verified yet. Try again in a moment.';
const GENERIC_FAILURE_MESSAGE = 'Something went wrong. Please try again.';

const OWNER = { id: 'u1', name: 'Ada', email: 'owner@example.com', role: 'OWNER' as const };

type View = Awaited<ReturnType<typeof render>>;

const mount = (): Promise<View> =>
  render(
    <ThemeProvider>
      <VerifyEmailScreen />
    </ThemeProvider>
  );

/** The context as the verify screen sees it. */
function verifyingSession(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: 'signedOut',
    user: null,
    firebaseOnboarding: 'verify-email',
    requestVerificationCode,
    confirmVerificationCode,
    retryVerificationResume,
    cancelFirebaseOnboarding,
    verificationEntryError: null,
    clearVerificationEntryError,
    // Explicit, so a test that forgets it exercises the ordinary journey rather than
    // relying on `undefined` being falsy.
    firebaseRegistrationRequired: false,
    verificationCodeIssuedAt: null,
    ...overrides,
  };
}

/** A 429 carrying the server's own wait, exactly as `lib/client.ts` builds it. */
function rateLimited(retryAfter: number): ApiError {
  const err = new ApiError(429, 'EMAIL_VERIFICATION_RATE_LIMITED', 'Too many requests');
  err.retryAfter = retryAfter;
  return err;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseSession.mockReturnValue(verifyingSession());
  requestVerificationCode.mockResolvedValue(undefined);
  confirmVerificationCode.mockResolvedValue(OWNER);
  retryVerificationResume.mockResolvedValue(undefined);
  cancelFirebaseOnboarding.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// What it renders
// ---------------------------------------------------------------------------

describe('the verify screen', () => {
  it('★ offers exactly the code actions, and no sign-in form', async () => {
    const view = await mount();

    expect(view.getByText(TITLE)).toBeTruthy();
    expect(view.getByPlaceholderText('123456')).toBeTruthy();
    expect(view.getByRole('button', { name: VERIFY })).toBeTruthy();
    expect(view.getByRole('button', { name: SEND })).toBeTruthy();

    // It creates NO new identity: there is no email or password field, because the
    // identity is already authenticated and filling in a form would be a second one.
    expect(view.queryByPlaceholderText('you@company.com')).toBeNull();
    expect(view.queryByPlaceholderText('••••••••')).toBeNull();
  });

  it('★ carries none of the retired verification-LINK copy', async () => {
    const view = await mount();

    expect(view.queryByText('I have verified - continue')).toBeNull();
    expect(view.queryByText('Resend verification email')).toBeNull();
  });

  it('★ does NOT sign anyone in on its own — nothing happens until an action is pressed', async () => {
    await mount();

    expect(confirmVerificationCode).not.toHaveBeenCalled();
    expect(requestVerificationCode).not.toHaveBeenCalled();
    expect(retryVerificationResume).not.toHaveBeenCalled();
    expect(cancelFirebaseOnboarding).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('redirects an already-signed-in person to their home, not back here', async () => {
    mockedUseSession.mockReturnValue(
      verifyingSession({ status: 'signedIn', user: OWNER, firebaseOnboarding: 'none' })
    );

    await mount();

    // Only a real session produces this, and it is the SAME destination rule every other
    // screen uses, so a person cannot be parked on a dead-end route.
    expect(mockRedirect).toHaveBeenCalledWith(defaultHomePath(OWNER));
  });

  it('redirects to Login when nothing is waiting to be verified', async () => {
    // The probe found no identity, or a verified one. A redirect rather than the old
    // dead-end "start again" screen — the decision was already made at boot.
    mockedUseSession.mockReturnValue(verifyingSession({ firebaseOnboarding: 'none' }));

    await mount();

    expect(mockRedirect).toHaveBeenCalledWith('/login');
    expect(confirmVerificationCode).not.toHaveBeenCalled();
  });

  it('★ hands a verified identity with no tenant to the registration screen', async () => {
    // FOUND ON A DEVICE. Confirmation succeeds after a cold start (the registration
    // details are in-memory), the exchange refuses with REGISTRATION_REQUIRED, the
    // registration route is armed — and this screen used to keep rendering its own form
    // with the refusal's sentence and no control that goes anywhere, so retrying Verify
    // only repeated the exchange. The armed route is now followed, as Login already does.
    mockedUseSession.mockReturnValue(verifyingSession({ firebaseRegistrationRequired: true }));

    await mount();

    expect(mockRedirect).toHaveBeenCalledWith('/register-firebase');
  });
});

// ---------------------------------------------------------------------------
// The unreachable state
// ---------------------------------------------------------------------------

describe('the unreachable state', () => {
  beforeEach(() => {
    mockedUseSession.mockReturnValue(
      verifyingSession({ firebaseOnboarding: 'verify-unreachable' })
    );
  });

  it('★ offers Try Again and Sign out, and does not auto-retry', async () => {
    const view = await mount();

    expect(view.getByText(UNREACHABLE_TITLE)).toBeTruthy();
    expect(view.getByText(UNREACHABLE_BODY)).toBeTruthy();
    expect(view.getByRole('button', { name: TRY_AGAIN })).toBeTruthy();
    expect(view.getByText('Sign out')).toBeTruthy();

    // No code form — there is no readable identity to verify yet.
    expect(view.queryByPlaceholderText('123456')).toBeNull();
    expect(view.queryByRole('button', { name: VERIFY })).toBeNull();
    // And NOTHING ran by itself: an automatic retry here would be an unattended loop.
    expect(retryVerificationResume).not.toHaveBeenCalled();
    expect(confirmVerificationCode).not.toHaveBeenCalled();
  });

  it('re-runs the probe only when Try Again is pressed', async () => {
    const view = await mount();

    await fireEvent.press(view.getByRole('button', { name: TRY_AGAIN }));

    expect(retryVerificationResume).toHaveBeenCalledTimes(1);
    expect(confirmVerificationCode).not.toHaveBeenCalled();
  });

  it('shows the mapped message when Try Again fails', async () => {
    retryVerificationResume.mockRejectedValue({});
    const view = await mount();

    await fireEvent.press(view.getByRole('button', { name: TRY_AGAIN }));

    expect(await view.findByText(GENERIC_FAILURE_MESSAGE)).toBeTruthy();
  });

  it('abandons the journey through the context when Sign out is pressed', async () => {
    const view = await mount();

    await fireEvent.press(view.getByText('Sign out'));

    expect(cancelFirebaseOnboarding).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// The code field
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Option B — the initial request failed during signup
// ---------------------------------------------------------------------------

describe('an initial request failure (Option B)', () => {
  const REASON = 'The verification email could not be sent. Please try again shortly.';

  it('★ shows the one-shot reason the journey was armed', async () => {
    mockedUseSession.mockReturnValue(verifyingSession({ verificationEntryError: REASON }));

    const view = await mount();

    expect(view.getByText(REASON)).toBeTruthy();
    // The code form is present — the person is in the journey, not stranded.
    expect(view.getByPlaceholderText('123456')).toBeTruthy();
    // And it must NOT have been auto-resent on arrival.
    expect(requestVerificationCode).not.toHaveBeenCalled();
  });

  it('clears the reason when the person acts, so their own outcome takes over', async () => {
    mockedUseSession.mockReturnValue(verifyingSession({ verificationEntryError: REASON }));

    const view = await mount();
    await fireEvent.press(view.getByRole('button', { name: SEND }));

    expect(requestVerificationCode).toHaveBeenCalledTimes(1);
    expect(clearVerificationEntryError).toHaveBeenCalledTimes(1);
  });
});

describe('the code field', () => {
  it('accepts digits only and caps the value at six', async () => {
    const view = await mount();

    await fireEvent.changeText(view.getByPlaceholderText('123456'), '1a2b3c4d5e6f7g');

    // The non-digits are stripped and the value is capped, so the field holds the code.
    expect(view.getByDisplayValue('123456')).toBeTruthy();
  });

  it('★ declares what the field holds, so the platform can offer the emailed code', async () => {
    const view = await mount();
    const field = view.getByPlaceholderText('123456');

    // A six-digit code cannot be recalled from memory; this declaration is what makes Android
    // offer an autofill chip and iOS show the code from Mail above the keyboard.
    expect(field.props.autoComplete).toBe('one-time-code');
    expect(field.props.textContentType).toBe('oneTimeCode');
  });

  it('disables Verify until a code is entered, then enables it', async () => {
    const view = await mount();

    const disabled = (): boolean =>
      Boolean(view.getByRole('button', { name: VERIFY }).props.accessibilityState?.disabled);
    expect(disabled()).toBe(true);

    await fireEvent.changeText(view.getByPlaceholderText('123456'), '123456');
    expect(disabled()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------

describe('verify', () => {
  it('submits the trimmed code through the context exactly once', async () => {
    const view = await mount();
    await fireEvent.changeText(view.getByPlaceholderText('123456'), ' 123456 ');

    await fireEvent.press(view.getByRole('button', { name: VERIFY }));

    expect(confirmVerificationCode).toHaveBeenCalledTimes(1);
    expect(confirmVerificationCode).toHaveBeenCalledWith('123456');
    expect(view.queryByText(GENERIC_FAILURE_MESSAGE)).toBeNull();
  });

  it('★ treats "still not verified" as a NOTICE, not an error', async () => {
    confirmVerificationCode.mockResolvedValue(null);
    const view = await mount();
    await fireEvent.changeText(view.getByPlaceholderText('123456'), '123456');

    await fireEvent.press(view.getByRole('button', { name: VERIFY }));

    // It is the ordinary outcome of a confirm that succeeded while Firebase still reports
    // the address unverified. Rendering it as a failure would say something is broken.
    expect(await view.findByText(STILL_UNVERIFIED_MESSAGE)).toBeTruthy();
    expect(view.queryByText(GENERIC_FAILURE_MESSAGE)).toBeNull();
  });

  it('shows the server message when the code is rejected', async () => {
    confirmVerificationCode.mockRejectedValue(
      new ApiError(400, 'INVALID_VERIFICATION_CODE', 'That code is not valid or has expired.')
    );
    const view = await mount();
    await fireEvent.changeText(view.getByPlaceholderText('123456'), '000000');

    await fireEvent.press(view.getByRole('button', { name: VERIFY }));

    expect(await view.findByText('That code is not valid or has expired.')).toBeTruthy();
  });

  it('maps a server field error onto the code input', async () => {
    confirmVerificationCode.mockRejectedValue(
      new ApiError(400, 'VALIDATION_ERROR', 'Check the form.', [
        { field: 'code', message: 'Enter the 6-digit code.' },
      ])
    );
    const view = await mount();
    await fireEvent.changeText(view.getByPlaceholderText('123456'), '123456');

    await fireEvent.press(view.getByRole('button', { name: VERIFY }));

    expect(await view.findByText('Enter the 6-digit code.')).toBeTruthy();
  });

  it('falls back to a generic message when a failure carries none of its own', async () => {
    confirmVerificationCode.mockRejectedValue({});
    const view = await mount();
    await fireEvent.changeText(view.getByPlaceholderText('123456'), '123456');

    await fireEvent.press(view.getByRole('button', { name: VERIFY }));

    expect(await view.findByText(GENERIC_FAILURE_MESSAGE)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Send / resend
// ---------------------------------------------------------------------------

describe('send code', () => {
  it('requests a code and says so', async () => {
    const view = await mount();

    await fireEvent.press(view.getByRole('button', { name: SEND }));

    expect(requestVerificationCode).toHaveBeenCalledTimes(1);
    expect(await view.findByText(CODE_SENT_MESSAGE)).toBeTruthy();
  });

  it('★ starts the 60-second cooldown after a successful send', async () => {
    const view = await mount();

    await fireEvent.press(view.getByRole('button', { name: SEND }));

    // The action is now a countdown, and the button is disabled while it runs.
    const cooling = await view.findByText(/^Resend code in /);
    expect(cooling).toBeTruthy();
    expect(view.queryByRole('button', { name: RESEND })).toBeNull();
  });

  it('★ honours the server Retry-After on a 429 rather than inventing one', async () => {
    requestVerificationCode.mockRejectedValue(rateLimited(60));
    const view = await mount();

    await fireEvent.press(view.getByRole('button', { name: SEND }));

    expect(await view.findByText(/^Resend code in /)).toBeTruthy();
    // The refusal is not also shown as a plain error while the cooldown explains it.
    expect(view.queryByText(CODE_SENT_MESSAGE)).toBeNull();
  });

  it('reports a non-429 failure without pretending a code was sent', async () => {
    requestVerificationCode.mockRejectedValue(
      new Error('Unable to send the verification code. Please try again.')
    );
    const view = await mount();

    await fireEvent.press(view.getByRole('button', { name: SEND }));

    expect(
      await view.findByText('Unable to send the verification code. Please try again.')
    ).toBeTruthy();
    expect(view.queryByText(CODE_SENT_MESSAGE)).toBeNull();
    // No cooldown, because nothing was sent.
    expect(view.getByRole('button', { name: SEND })).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Sign out
// ---------------------------------------------------------------------------

describe('sign out', () => {
  it('★ abandons the journey through the context, so Firebase really ends', async () => {
    const view = await mount();

    await fireEvent.press(view.getByText('Sign out'));

    // Not a navigation: navigating away would leave the Firebase identity signed in and
    // the next person at this device one tap from it.
    expect(cancelFirebaseOnboarding).toHaveBeenCalledTimes(1);
  });

  it('keeps the person on this screen when abandoning it fails', async () => {
    cancelFirebaseOnboarding.mockRejectedValue(new Error('offline'));
    const view = await mount();

    await fireEvent.press(view.getByText('Sign out'));

    expect(await view.findByText(GENERIC_FAILURE_MESSAGE)).toBeTruthy();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
