/**
 * Login required-field and email-shape validation.
 *
 * The reported defect: pressing **Sign In** on an empty form produced
 * "Unable to sign in. Please try again." — a sentence that names neither field,
 * describes a fault rather than a missing input, and sends the person looking for
 * a problem that does not exist. `login.tsx` was the only auth screen in the app
 * without a submit-time guard (every other one validated first), so an empty form
 * went out as a real authentication attempt:
 *
 *   * on a Firebase-configured build, an empty address reaches Firebase as a code
 *     this app's message table had no entry for, so it took the generic sentence;
 *   * on a build with no Firebase configuration, it reached `POST /api/auth/login`
 *     and came back with the server's own developer-facing copy
 *     ("email is required").
 *
 * This file pins the corrected order, and the copy, at the screen a person meets:
 *
 *   1. Required-field validation runs BEFORE `signIn()`. Every empty field is
 *      reported by name, and the service is never called — so no credential is
 *      ever sent for a form that cannot succeed.
 *   2. A malformed address is refused on the EMAIL input, in the same words the
 *      Firebase table uses for `auth/invalid-email`, instead of travelling to a
 *      provider to be described for a developer.
 *   3. A complete form still calls `signIn()` exactly once, with the address
 *      TRIMMED — a trailing space is invisible on a phone keyboard and would
 *      otherwise come back as an invalid address.
 *
 * Only `expo-router` and `lib/auth` are mocked. The screen and its
 * `AuthLayout`/`Banner`/`Input`/`Button` are the real components, so the assertion
 * is about what a person actually sees.
 */

import { fireEvent, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useSession } from '../lib/auth';
import { ThemeProvider } from '../lib/theme-context';

import LoginScreen from '../app/login';

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
const signIn = jest.fn();
const signInWithGoogle = jest.fn();

const EMAIL_FIELD = 'you@company.com';
const PASSWORD_FIELD = '••••••••';
const SIGN_IN = 'Sign In';

const EMAIL_REQUIRED = 'Email is required';
const PASSWORD_REQUIRED = 'Password is required';
const EMAIL_INVALID = 'Enter a valid email address.';

/** The sentence the defect showed, which must no longer appear for a missing field. */
const GENERIC = 'Unable to sign in. Please try again.';

type View = Awaited<ReturnType<typeof render>>;

const mount = (): Promise<View> =>
  render(
    <ThemeProvider>
      <LoginScreen />
    </ThemeProvider>
  );

const press = async (view: View): Promise<void> => {
  await fireEvent.press(view.getByRole('button', { name: SIGN_IN }));
};

const fill = async (view: View, email: string, password: string): Promise<void> => {
  await fireEvent.changeText(view.getByPlaceholderText(EMAIL_FIELD), email);
  await fireEvent.changeText(view.getByPlaceholderText(PASSWORD_FIELD), password);
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseSession.mockReturnValue({
    status: 'signedOut',
    user: null,
    signIn,
    signInWithGoogle,
    firebaseOnboarding: null,
  });
  signIn.mockResolvedValue(undefined);
});

describe('an empty login form', () => {
  it('★ names both fields and never calls sign-in', async () => {
    const view = await mount();
    await press(view);

    expect(view.getByText(EMAIL_REQUIRED)).toBeTruthy();
    expect(view.getByText(PASSWORD_REQUIRED)).toBeTruthy();

    // The load-bearing assertion: no credential is sent for a form that cannot
    // succeed, so no provider round trip and no rate-limiter slot is spent on it.
    expect(signIn).not.toHaveBeenCalled();
  });

  it('★ no longer shows the generic sentence it used to show', async () => {
    const view = await mount();
    await press(view);

    expect(view.queryByText(GENERIC)).toBeNull();
  });

  it('treats a whitespace-only address as empty, not as a malformed one', async () => {
    const view = await mount();
    await fill(view, '   ', 'Password123!');
    await press(view);

    expect(view.getByText(EMAIL_REQUIRED)).toBeTruthy();
    expect(view.queryByText(EMAIL_INVALID)).toBeNull();
    expect(signIn).not.toHaveBeenCalled();
  });
});

describe('a malformed email address', () => {
  // The addresses a person actually mistypes: a missing suffix, a missing local
  // part, a space, two @ signs. Each used to reach a provider before being judged.
  it.each(['owner@company', 'owner@', '@company.com', 'owner company@x.com', 'a@@b.com'])(
    '★ refuses %s on the email input without calling sign-in',
    async (address) => {
      const view = await mount();
      await fill(view, address, 'Password123!');
      await press(view);

      expect(view.getByText(EMAIL_INVALID)).toBeTruthy();
      expect(view.queryByText(EMAIL_REQUIRED)).toBeNull();
      expect(signIn).not.toHaveBeenCalled();
    }
  );
});

describe('a partially filled form', () => {
  it('reports only the missing password', async () => {
    const view = await mount();
    await fill(view, 'owner@example.com', '');
    await press(view);

    expect(view.getByText(PASSWORD_REQUIRED)).toBeTruthy();
    expect(view.queryByText(EMAIL_REQUIRED)).toBeNull();
    expect(view.queryByText(EMAIL_INVALID)).toBeNull();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('reports only the missing email', async () => {
    const view = await mount();
    await fill(view, '', 'Password123!');
    await press(view);

    expect(view.getByText(EMAIL_REQUIRED)).toBeTruthy();
    expect(view.queryByText(PASSWORD_REQUIRED)).toBeNull();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('reports a malformed address AND a missing password together', async () => {
    const view = await mount();
    await fill(view, 'owner@company', '');
    await press(view);

    expect(view.getByText(EMAIL_INVALID)).toBeTruthy();
    expect(view.getByText(PASSWORD_REQUIRED)).toBeTruthy();
    expect(signIn).not.toHaveBeenCalled();
  });
});

describe('a valid form is unchanged', () => {
  it('★ calls sign-in exactly once with the entered values', async () => {
    const view = await mount();
    await fill(view, 'owner@example.com', 'Password123!');
    await press(view);

    expect(signIn).toHaveBeenCalledTimes(1);
    expect(signIn).toHaveBeenCalledWith({ email: 'owner@example.com', password: 'Password123!' });
  });

  it('★ trims the address before sending it', async () => {
    const view = await mount();
    await fill(view, '  owner@example.com  ', 'Password123!');
    await press(view);

    expect(signIn).toHaveBeenCalledWith({ email: 'owner@example.com', password: 'Password123!' });
  });

  it('does NOT trim the password — spaces are legitimate password characters', async () => {
    const view = await mount();
    await fill(view, 'owner@example.com', '  spaced  ');
    await press(view);

    expect(signIn).toHaveBeenCalledWith({ email: 'owner@example.com', password: '  spaced  ' });
  });

  it('lets the user correct a field and submit successfully', async () => {
    const view = await mount();
    await press(view);

    expect(signIn).not.toHaveBeenCalled();

    await fill(view, 'owner@example.com', 'Password123!');
    await press(view);

    expect(signIn).toHaveBeenCalledTimes(1);
    // The stale per-field errors are gone, because the second attempt reset them.
    expect(view.queryByText(EMAIL_REQUIRED)).toBeNull();
    expect(view.queryByText(PASSWORD_REQUIRED)).toBeNull();
  });
});
