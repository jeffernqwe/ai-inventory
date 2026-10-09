/**
 * Issue 2 — the login screen's rate-limit cooldown.
 *
 * WHAT THIS PINS. `POST /api/auth/login` answers `429 LOGIN_RATE_LIMITED` with the
 * wait stated in a `Retry-After` header. This screen reads THAT number; it never
 * invents one, and there is deliberately no fixed three-minute constant anywhere in
 * the screen. So the cases below check both directions:
 *
 *   - a stated wait becomes a countdown and the form stops sending requests;
 *   - a DIFFERENT stated wait produces a DIFFERENT countdown, which is what makes
 *     "derived, not hardcoded" falsifiable rather than merely asserted;
 *   - an UNSTATED wait shows the refusal but starts no countdown and does not block
 *     the form, because guessing a length would be inventing a policy the server
 *     never stated;
 *   - Firebase's own `auth/too-many-requests` is NOT the server's cooldown: it is a
 *     `FirebaseAuthError` (nothing in it produced an HTTP response) and carries no
 *     `Retry-After`, so it stays an ordinary refusal with nothing counting down.
 *
 * Only the module boundaries are mocked (`expo-router`, `lib/auth`, and
 * `lib/firebase-native`, so the REAL `FirebaseAuthError` class can be imported
 * without loading `@react-native-firebase/*`). The screen, its error mapping and
 * `AuthLayout`/`Banner`/`Input`/`Button` are the real ones. RNTL v14 renders and
 * dispatches asynchronously, so `render` and every `fireEvent` are awaited.
 */

import { fireEvent, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ApiError, apiFetch } from '../lib/client';
import { FirebaseAuthError } from '../lib/firebase-auth';
import { useSession } from '../lib/auth';
import { ThemeProvider } from '../lib/theme-context';

import LoginScreen from '../app/login';

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
    Redirect: () => null,
    Link: ({ children }: { children?: ReactNode }) => <Text>{children}</Text>,
  };
});

jest.mock('../lib/auth', () => ({
  useSession: jest.fn(),
}));

// `lib/firebase-auth` imports the native boundary at module scope. It is mocked
// here only so this suite can import the real `FirebaseAuthError` class; no
// Firebase behaviour is exercised.
jest.mock('../lib/firebase-native', () => ({
  isNativeFirebaseConfigured: () => false,
  isNativeGoogleConfigured: () => false,
  nativeConfirmPasswordReset: jest.fn(),
  nativeCreateUserWithEmail: jest.fn(),
  nativeCurrentIdToken: jest.fn(),
  nativeSendPasswordResetEmail: jest.fn(),
  nativeSignInWithEmail: jest.fn(),
  nativeSignInWithGoogle: jest.fn(),
  nativeSignOut: jest.fn(),
  nativeVerifyPasswordResetCode: jest.fn(),
}));

const mockedUseSession = useSession as jest.Mock;
const signIn = jest.fn();
const signInWithGoogle = jest.fn();

const EMAIL_FIELD = 'you@company.com';
const PASSWORD_FIELD = '••••••••';
const SIGN_IN = 'Sign In';

type View = Awaited<ReturnType<typeof render>>;

const mount = (): Promise<View> =>
  render(
    <ThemeProvider>
      <LoginScreen />
    </ThemeProvider>
  );

/** A `LOGIN_RATE_LIMITED` refusal carrying the wait the server stated (or none). */
function rateLimited(retryAfter: number | null): ApiError {
  const err = new ApiError(
    429,
    'LOGIN_RATE_LIMITED',
    'Too many login attempts. Please wait a moment and try again.'
  );
  err.retryAfter = retryAfter;
  return err;
}

async function submitCredentials(view: View): Promise<void> {
  await fireEvent.changeText(view.getByPlaceholderText(EMAIL_FIELD), 'owner@example.com');
  await fireEvent.changeText(view.getByPlaceholderText(PASSWORD_FIELD), 'Password123!');
  await fireEvent.press(view.getByRole('button', { name: SIGN_IN }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseSession.mockReturnValue({
    status: 'signedOut',
    user: null,
    signIn,
    signInWithGoogle,
    firebaseOnboarding: 'none',
  });
});

describe('login — LOGIN_RATE_LIMITED cooldown', () => {
  it('turns the server Retry-After into a countdown', async () => {
    signIn.mockRejectedValue(rateLimited(300));
    const view = await mount();
    await submitCredentials(view);

    expect(view.getByText(/Try again in 5m/)).toBeTruthy();
  });

  it('shows the wait the server stated, not a fixed constant', async () => {
    signIn.mockRejectedValue(rateLimited(45));
    const short = await mount();
    await submitCredentials(short);
    expect(short.getByText(/Try again in 45s/)).toBeTruthy();

    signIn.mockRejectedValue(rateLimited(90));
    const longer = await mount();
    await submitCredentials(longer);
    expect(longer.getByText(/Try again in 1m 30s/)).toBeTruthy();
  });

  it('sends no further request while the cooldown is running', async () => {
    signIn.mockRejectedValue(rateLimited(300));
    const view = await mount();
    await submitCredentials(view);
    expect(signIn).toHaveBeenCalledTimes(1);

    await fireEvent.press(view.getByRole('button', { name: SIGN_IN }));

    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it('starts no cooldown when the server stated no wait', async () => {
    signIn.mockRejectedValue(rateLimited(null));
    const view = await mount();
    await submitCredentials(view);

    expect(view.getByText(/Too many sign-in attempts/)).toBeTruthy();
    expect(view.queryByText(/Try again in/)).toBeNull();

    // And the form still submits: an unstated wait is not a licence to invent one.
    signIn.mockRejectedValueOnce(new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password'));
    await submitCredentials(view);
    expect(signIn).toHaveBeenCalledTimes(2);
  });

  it('keeps the Firebase auth/too-many-requests refusal out of the cooldown', async () => {
    signIn.mockRejectedValue(
      new FirebaseAuthError('auth/too-many-requests', 'Too many attempts. Please wait a moment and try again.')
    );
    const view = await mount();
    await submitCredentials(view);

    expect(view.getByText('Too many attempts. Please wait a moment and try again.')).toBeTruthy();
    expect(view.queryByText(/Try again in/)).toBeNull();

    signIn.mockRejectedValueOnce(new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password'));
    await submitCredentials(view);
    expect(signIn).toHaveBeenCalledTimes(2);
  });

  it('starts no cooldown for an ordinary refusal', async () => {
    signIn.mockRejectedValue(new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password'));
    const view = await mount();
    await submitCredentials(view);

    expect(view.getByText('Invalid email or password')).toBeTruthy();
    expect(view.queryByText(/Try again in/)).toBeNull();
  });
});

describe('ApiError.retryAfter — read from the response header', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  function respond(retryAfter: string | null): void {
    global.fetch = jest.fn(async () => ({
      status: 429,
      headers: {
        get: (name: string) => (name.toLowerCase() === 'retry-after' ? retryAfter : null),
      },
      json: async () => ({ code: 'LOGIN_RATE_LIMITED', error: 'Too many login attempts.' }),
    })) as unknown as typeof fetch;
  }

  it('reads delta-seconds', async () => {
    respond('90');
    await expect(
      apiFetch('/api/auth/login', { method: 'POST', body: { email: 'a@b.c' } })
    ).rejects.toMatchObject({ status: 429, code: 'LOGIN_RATE_LIMITED', retryAfter: 90 });
  });

  it('is null when the response states no wait', async () => {
    respond(null);
    await expect(
      apiFetch('/api/auth/login', { method: 'POST', body: { email: 'a@b.c' } })
    ).rejects.toMatchObject({ retryAfter: null });
  });

  it('is null for a value that is neither seconds nor a date', async () => {
    respond('soon');
    await expect(
      apiFetch('/api/auth/login', { method: 'POST', body: { email: 'a@b.c' } })
    ).rejects.toMatchObject({ retryAfter: null });
  });
});
