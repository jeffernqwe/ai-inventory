/**
 * The user-facing authentication vocabulary — one guard for the standard.
 *
 * WHY THIS FILE EXISTS. The words on these screens are a product decision, and the
 * decisions that matter are the ones that are easy to undo by accident: an action
 * named after the implementation it happens to use, or a provider named where the
 * account's provider is not knowable. Neither breaks a test that only checks a
 * control is present, so both are pinned here directly.
 *
 * THE TWO RULES IT ENFORCES:
 *
 *   1. ACTIONS ARE NAMED FOR THE PERSON, NOT THE IMPLEMENTATION. "Add Google
 *      sign-in", not "Connect Google"; never "Disconnect Firebase" — that action
 *      was re-scoped into a password change (Phase A) and must not come back.
 *   2. NO PROVIDER IS NAMED WHERE THE PROVIDER IS NOT KNOWN. The server publishes a
 *      capability (`authMethods`), not the identity behind it, so an account whose
 *      credential is held by a sign-in provider could be Google OR a Firebase
 *      email/password identity — and the app cannot tell. Naming Google there would
 *      be a claim the app cannot support, and it would suggest that Google manages
 *      an Email & Password sign-in it has nothing to do with.
 *
 * WHAT IT DOES NOT DO. Nothing here is a security assertion: the server is the
 * boundary in every case, and these are labels. It also does not pin every sentence
 * on these screens — only the vocabulary, and only where a regression would be
 * silent.
 *
 * Only `expo-router` and `lib/auth` are mocked — the screens compose the real
 * `Button`/`Card`/`Banner`/`SectionHeader` primitives and the real theme, so the
 * rendered surface is the shipped one.
 */

import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useSession } from '../lib/auth';
import { ThemeProvider } from '../lib/theme-context';

import LoginScreen from '../app/login';
import ProfileScreen from '../app/(app)/profile';

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

const mockedUseSession = useSession as jest.Mock;

const SIGN_IN_METHODS = 'Sign-in methods';
const METHODS_INTRO = 'Manage the ways you can sign in to your Inventory AI account.';
const EMAIL_PASSWORD = 'Email & Password';
const GOOGLE_METHOD = 'Google sign-in';
const GOOGLE_INTRO = 'Use your Google account to sign in to Inventory AI.';
const ADD_GOOGLE = 'Add Google sign-in';
const CHANGE_SIGNIN_PASSWORD = 'Change sign-in password';
const CHANGE_SIGNIN_INTRO =
  'Change the password you use to sign in to your Inventory AI account.';
const LOCAL_CHANGE_PASSWORD = 'Change password';
const CONTINUE_WITH_GOOGLE = 'Continue with Google';
const FORGOT_PASSWORD = 'Forgot password?';

type AuthMethods = { password: boolean; firebase?: boolean };

/** Signs in with the account shape under test. `undefined` omits the field entirely. */
function signIn(authMethods?: AuthMethods): void {
  mockedUseSession.mockReturnValue({
    user: {
      id: 'u1',
      name: 'Jane Doe',
      email: 'jane@acme.test',
      role: 'OWNER',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      ...(authMethods === undefined ? {} : { authMethods }),
    },
    status: 'signedIn',
    token: 'token',
    signIn: jest.fn(),
    signInWithGoogle: jest.fn(),
    connectFirebase: jest.fn(),
    signOut: jest.fn(),
    refresh: jest.fn(),
    firebaseOnboarding: 'none',
  });
}

const mountProfile = () =>
  render(
    <ThemeProvider>
      <ProfileScreen />
    </ThemeProvider>
  );

/** The whole rendered surface, lowercased — the blunt check for leaked vendor terms. */
function surface(view: { toJSON: () => unknown }): string {
  return JSON.stringify(view.toJSON()).toLowerCase();
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Sign-in methods — the approved vocabulary on Profile', () => {
  it('names the section and both methods in user terms', async () => {
    signIn({ password: true, firebase: false });
    const view = await mountProfile();

    expect(view.getByText(SIGN_IN_METHODS)).toBeTruthy();
    expect(view.getByText(METHODS_INTRO)).toBeTruthy();
    expect(view.getByText(EMAIL_PASSWORD)).toBeTruthy();
    expect(view.getByText(GOOGLE_METHOD)).toBeTruthy();
    expect(view.getByText(GOOGLE_INTRO)).toBeTruthy();
    expect(view.getByRole('button', { name: ADD_GOOGLE })).toBeTruthy();
  });

  it('never uses the retired vendor wording', async () => {
    // The shape where BOTH actions are on screen — a linked account — so the check
    // is about the words actually offered, not about a control that is absent anyway.
    signIn({ password: true, firebase: true });
    const view = await mountProfile();

    expect(view.getByRole('button', { name: CHANGE_SIGNIN_PASSWORD })).toBeTruthy();
    expect(view.queryByText('Connect Google')).toBeNull();
    expect(view.queryByText('Disconnect Firebase')).toBeNull();
    expect(surface(view).includes('disconnect')).toBe(false);
  });

  it("does not name a provider where the account's provider is not knowable", async () => {
    // A credential held by a sign-in provider could be Google or an Email & Password
    // identity, and the capability block does not say which. Naming Google here would
    // assert something the app cannot know.
    signIn({ password: false, firebase: true });
    const view = await mountProfile();

    expect(view.getByText(CHANGE_SIGNIN_INTRO)).toBeTruthy();
    expect(view.getByRole('button', { name: CHANGE_SIGNIN_PASSWORD })).toBeTruthy();
    expect(view.queryByText(ADD_GOOGLE)).toBeNull();
    const text = surface(view);
    expect(text.includes('google')).toBe(false);
    expect(text.includes('firebase')).toBe(false);
  });

  it('keeps the local-password action for a legacy account with no identity', async () => {
    // The historical shape: no `authMethods` at all. The control must not disappear.
    signIn();
    const view = await mountProfile();

    expect(view.getByText(EMAIL_PASSWORD)).toBeTruthy();
    expect(view.getByRole('button', { name: LOCAL_CHANGE_PASSWORD })).toBeTruthy();
    expect(view.queryByText(GOOGLE_METHOD)).toBeNull();
  });
});

describe('Login — the approved vocabulary', () => {
  it('offers Google and password recovery in user terms', async () => {
    mockedUseSession.mockReturnValue({
      status: 'signedOut',
      user: null,
      signIn: jest.fn(),
      signInWithGoogle: jest.fn(),
      firebaseOnboarding: 'none',
    });
    const view = await render(
      <ThemeProvider>
        <LoginScreen />
      </ThemeProvider>
    );

    expect(view.getByRole('button', { name: CONTINUE_WITH_GOOGLE })).toBeTruthy();
    expect(view.getByText(FORGOT_PASSWORD)).toBeTruthy();
    const text = surface(view);
    expect(text.includes('firebase')).toBe(false);
    expect(text.includes('disconnect')).toBe(false);
  });
});
