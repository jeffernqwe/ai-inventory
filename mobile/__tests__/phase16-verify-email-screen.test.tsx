/**
 * Phase 16 — the email-verification screen a person actually meets.
 *
 * `phase16-email-verification.test.tsx` pins the state machine behind it. This file pins
 * the surface: what it asks for, what it says, and — the property that matters most —
 * that it NEVER signs anyone in by itself. Only a server-issued session leaves this
 * screen, and the only thing that produces one is `completeEmailVerification` resolving a
 * user, which is asserted here through the real screen rather than assumed.
 *
 * TWO PROPERTIES ARE ASSERTED DIRECTLY, because both are ways a wrong implementation
 * would still look right:
 *
 *   1. "STILL NOT VERIFIED" IS A NOTICE, NOT AN ERROR. It is the ordinary outcome of
 *      pressing continue too early, so it must read as guidance. Reversing the two would
 *      pass a test that only looked for text.
 *   2. THE SIGN-OUT ABANDONS THE JOURNEY. It must call `cancelFirebaseOnboarding` (which
 *      ends the durable Firebase session), not navigate away and leave the identity signed
 *      in to Firebase.
 *
 * Only `expo-router` and `lib/auth` are mocked. The screen and
 * `AuthLayout`/`Banner`/`Button` are the real ones.
 */

import { fireEvent, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';

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

const completeEmailVerification = jest.fn();
const resendVerificationEmail = jest.fn();
const cancelFirebaseOnboarding = jest.fn();

const TITLE = 'Verify your email';
const CONTINUE = 'I have verified - continue';
const RESEND = 'Resend verification email';
const START_AGAIN_TITLE = 'Start again';
const NO_VERIFICATION_MESSAGE =
  'There is no sign-in waiting to be verified. Create an account or sign in to continue.';
const VERIFIED_NOT_YET_MESSAGE =
  'Your email is not verified yet. Open the link we sent you, then try again.';
const RESEND_SENT_MESSAGE = 'Verification email sent. Check your inbox and spam folder.';
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
    completeEmailVerification,
    resendVerificationEmail,
    cancelFirebaseOnboarding,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseSession.mockReturnValue(verifyingSession());
  completeEmailVerification.mockResolvedValue(OWNER);
  resendVerificationEmail.mockResolvedValue(undefined);
  cancelFirebaseOnboarding.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// What it renders
// ---------------------------------------------------------------------------

describe('the verify screen', () => {
  it('★ offers exactly the two verification actions, and no sign-in form', async () => {
    const view = await mount();

    expect(view.getByText(TITLE)).toBeTruthy();
    expect(view.getByRole('button', { name: CONTINUE })).toBeTruthy();
    expect(view.getByRole('button', { name: RESEND })).toBeTruthy();

    // It creates NO new identity: there is no email or password field, because the
    // identity is already authenticated and filling in a form would be a second one.
    expect(view.queryByPlaceholderText('you@company.com')).toBeNull();
    expect(view.queryByPlaceholderText('••••••••')).toBeNull();
  });

  it('★ does NOT sign anyone in on its own — nothing happens until an action is pressed', async () => {
    await mount();

    expect(completeEmailVerification).not.toHaveBeenCalled();
    expect(resendVerificationEmail).not.toHaveBeenCalled();
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

  it('shows a start-again screen when there is no verification in progress', async () => {
    mockedUseSession.mockReturnValue(verifyingSession({ firebaseOnboarding: 'none' }));

    const view = await mount();

    expect(view.getByText(START_AGAIN_TITLE)).toBeTruthy();
    expect(view.getByText(NO_VERIFICATION_MESSAGE)).toBeTruthy();
    // The actions belong to a journey that is not in progress, so they are absent.
    expect(view.queryByRole('button', { name: CONTINUE })).toBeNull();
    expect(view.queryByRole('button', { name: RESEND })).toBeNull();
    // And the route back to sign-in is reachable.
    expect(view.getByTestId('link:/login')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Continue
// ---------------------------------------------------------------------------

describe('continue after verification', () => {
  it('calls the continue action exactly once', async () => {
    const view = await mount();

    await fireEvent.press(view.getByRole('button', { name: CONTINUE }));

    expect(completeEmailVerification).toHaveBeenCalledTimes(1);
    // The context is what signs the person in. In this harness the status does not
    // change, so the observable claim is that neither a notice nor a failure was shown.
    expect(view.queryByText(VERIFIED_NOT_YET_MESSAGE)).toBeNull();
    expect(view.queryByText(GENERIC_FAILURE_MESSAGE)).toBeNull();
  });

  it('★ treats "still not verified" as a NOTICE, not an error', async () => {
    completeEmailVerification.mockResolvedValue(null);
    const view = await mount();

    await fireEvent.press(view.getByRole('button', { name: CONTINUE }));

    // It is the ordinary outcome of pressing too early. Rendering it as a failure would
    // tell a person something is broken when nothing is.
    expect(await view.findByText(VERIFIED_NOT_YET_MESSAGE)).toBeTruthy();
    expect(view.queryByText(GENERIC_FAILURE_MESSAGE)).toBeNull();
  });

  it('shows the mapped message when the check itself could not be completed', async () => {
    completeEmailVerification.mockRejectedValue(
      new Error('Unable to check your email verification status. Please try again.')
    );
    const view = await mount();

    await fireEvent.press(view.getByRole('button', { name: CONTINUE }));

    expect(
      await view.findByText('Unable to check your email verification status. Please try again.')
    ).toBeTruthy();
  });

  it('falls back to a generic message when a failure carries none of its own', async () => {
    completeEmailVerification.mockRejectedValue({});
    const view = await mount();

    await fireEvent.press(view.getByRole('button', { name: CONTINUE }));

    expect(await view.findByText(GENERIC_FAILURE_MESSAGE)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Resend
// ---------------------------------------------------------------------------

describe('resend', () => {
  it('asks Firebase for another email and says so', async () => {
    const view = await mount();

    await fireEvent.press(view.getByRole('button', { name: RESEND }));

    expect(resendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(await view.findByText(RESEND_SENT_MESSAGE)).toBeTruthy();
  });

  it('★ reports a failure without pretending an email was sent', async () => {
    resendVerificationEmail.mockRejectedValue(
      new Error('Unable to send the verification email. Please try again.')
    );
    const view = await mount();

    await fireEvent.press(view.getByRole('button', { name: RESEND }));

    expect(
      await view.findByText('Unable to send the verification email. Please try again.')
    ).toBeTruthy();
    expect(view.queryByText(RESEND_SENT_MESSAGE)).toBeNull();
  });

  it('clears a previous notice when the action is retried and fails', async () => {
    // A stale "email sent" sitting beside a fresh failure would be worse than either.
    const view = await mount();
    await fireEvent.press(view.getByRole('button', { name: RESEND }));
    expect(await view.findByText(RESEND_SENT_MESSAGE)).toBeTruthy();

    resendVerificationEmail.mockRejectedValueOnce(
      new Error('Unable to send the verification email. Please try again.')
    );
    await fireEvent.press(view.getByRole('button', { name: RESEND }));

    expect(
      await view.findByText('Unable to send the verification email. Please try again.')
    ).toBeTruthy();
    expect(view.queryByText(RESEND_SENT_MESSAGE)).toBeNull();
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
