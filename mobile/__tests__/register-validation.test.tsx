/**
 * Registration required-field validation (finding F-1).
 *
 * The email/password registration screen previously validated only the
 * password/confirm match, so an empty form fell straight through to
 * `signUp()` — which begins with the Firebase `createUserWithEmailAndPassword`
 * call — and surfaced a generic banner instead of the per-field errors the
 * form already renders. This file pins the corrected order:
 *
 *   1. Required-field validation runs BEFORE `signUp()`. Every empty field is
 *      reported, and the service is never called, so no Firebase identity is
 *      created from an incomplete form.
 *   2. The pre-existing password/confirm rule is preserved: a non-empty
 *      confirmation that differs still reports 'Passwords do not match'.
 *   3. A complete form still calls `signUp()` exactly once, unchanged.
 *
 * Only `expo-router` and `lib/auth` are mocked. The screen and its
 * `AuthLayout`/`Banner`/`Input`/`Button` are the real components, so the
 * assertion is about what a person actually meets.
 */

import { fireEvent, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useSession } from '../lib/auth';
import { ThemeProvider } from '../lib/theme-context';

import RegisterScreen from '../app/register';

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
const signUp = jest.fn();

const BUSINESS_PLACEHOLDER = 'Acme Retail';
const NAME_PLACEHOLDER = 'Jane Doe';
const EMAIL_PLACEHOLDER = 'you@company.com';
const PASSWORD_PLACEHOLDER = 'At least 8 characters';
const CONFIRM_PLACEHOLDER = 'Repeat your password';
const SUBMIT = 'Create Account';

type View = Awaited<ReturnType<typeof render>>;

const mount = (): Promise<View> =>
  render(
    <ThemeProvider>
      <RegisterScreen />
    </ThemeProvider>
  );

const press = async (view: View): Promise<void> => {
  await fireEvent.press(view.getByRole('button', { name: SUBMIT }));
};

/** A signed-out session is what makes the form render instead of redirecting. */
beforeEach(() => {
  jest.clearAllMocks();
  mockedUseSession.mockReturnValue({ status: 'signedOut', user: null, signUp });
  signUp.mockResolvedValue(undefined);
});

describe('empty registration form', () => {
  it('★ reports every required field and never calls sign-up', async () => {
    const view = await mount();
    await press(view);

    expect(view.getByText('Business name is required')).toBeTruthy();
    expect(view.getByText('Name is required')).toBeTruthy();
    expect(view.getByText('Email is required')).toBeTruthy();
    expect(view.getByText('Password is required')).toBeTruthy();
    expect(view.getByText('Confirm password is required')).toBeTruthy();

    // The load-bearing assertion: no Firebase identity can be created here.
    expect(signUp).not.toHaveBeenCalled();
  });

  it('treats a whitespace-only business name as empty', async () => {
    const view = await mount();
    await fireEvent.changeText(view.getByPlaceholderText(BUSINESS_PLACEHOLDER), '   ');
    await press(view);

    expect(view.getByText('Business name is required')).toBeTruthy();
    expect(signUp).not.toHaveBeenCalled();
  });

  it('reports only the fields that are actually missing', async () => {
    const view = await mount();
    await fireEvent.changeText(view.getByPlaceholderText(BUSINESS_PLACEHOLDER), 'Acme Retail');
    await fireEvent.changeText(view.getByPlaceholderText(EMAIL_PLACEHOLDER), 'owner@example.com');
    await press(view);

    expect(view.queryByText('Business name is required')).toBeNull();
    expect(view.queryByText('Email is required')).toBeNull();
    expect(view.getByText('Name is required')).toBeTruthy();
    expect(view.getByText('Password is required')).toBeTruthy();
    expect(view.getByText('Confirm password is required')).toBeTruthy();
    expect(signUp).not.toHaveBeenCalled();
  });
});

describe('password confirmation is preserved', () => {
  it('★ still reports a mismatch for a non-empty, differing confirmation', async () => {
    const view = await mount();
    await fireEvent.changeText(view.getByPlaceholderText(BUSINESS_PLACEHOLDER), 'Acme Retail');
    await fireEvent.changeText(view.getByPlaceholderText(NAME_PLACEHOLDER), 'Ada Lovelace');
    await fireEvent.changeText(view.getByPlaceholderText(EMAIL_PLACEHOLDER), 'owner@example.com');
    await fireEvent.changeText(view.getByPlaceholderText(PASSWORD_PLACEHOLDER), 'Password123!');
    await fireEvent.changeText(view.getByPlaceholderText(CONFIRM_PLACEHOLDER), 'Password456!');
    await press(view);

    expect(view.getByText('Passwords do not match')).toBeTruthy();
    expect(signUp).not.toHaveBeenCalled();
  });

  it('reports the empty confirmation as required, not as a mismatch', async () => {
    const view = await mount();
    await fireEvent.changeText(view.getByPlaceholderText(BUSINESS_PLACEHOLDER), 'Acme Retail');
    await fireEvent.changeText(view.getByPlaceholderText(NAME_PLACEHOLDER), 'Ada Lovelace');
    await fireEvent.changeText(view.getByPlaceholderText(EMAIL_PLACEHOLDER), 'owner@example.com');
    await fireEvent.changeText(view.getByPlaceholderText(PASSWORD_PLACEHOLDER), 'Password123!');
    await press(view);

    expect(view.getByText('Confirm password is required')).toBeTruthy();
    expect(view.queryByText('Passwords do not match')).toBeNull();
    expect(signUp).not.toHaveBeenCalled();
  });
});

describe('password length is judged before an identity is created', () => {
  /**
   * Registration is where a password is CHOSEN, and it was the last screen that chose
   * one without checking its length — so a 5-character password was sent to the server
   * and came back under the input in a developer's words. `reset-password.tsx` and
   * `change-password.tsx` already refused it client-side; the rule is now shared.
   *
   * This matters more here than anywhere else in the app: `signUp` on a
   * Firebase-configured build CREATES AN IDENTITY, so a rejected form is not a wasted
   * request but a half-made account.
   */
  const submitWithPassword = async (view: View, password: string): Promise<void> => {
    await fireEvent.changeText(view.getByPlaceholderText(BUSINESS_PLACEHOLDER), 'Acme Retail');
    await fireEvent.changeText(view.getByPlaceholderText(NAME_PLACEHOLDER), 'Ada Lovelace');
    await fireEvent.changeText(view.getByPlaceholderText(EMAIL_PLACEHOLDER), 'owner@example.com');
    await fireEvent.changeText(view.getByPlaceholderText(PASSWORD_PLACEHOLDER), password);
    await fireEvent.changeText(view.getByPlaceholderText(CONFIRM_PLACEHOLDER), password);
    await press(view);
  };

  it('★ refuses a short password without calling sign-up', async () => {
    const view = await mount();
    await submitWithPassword(view, 'short1');

    expect(view.getByText('Password must be at least 8 characters')).toBeTruthy();
    expect(signUp).not.toHaveBeenCalled();
  });

  it('★ refuses an over-long password without calling sign-up', async () => {
    const view = await mount();
    await submitWithPassword(view, 'a'.repeat(73));

    expect(view.getByText('Password must be at most 72 characters')).toBeTruthy();
    expect(signUp).not.toHaveBeenCalled();
  });

  it('★ reports an EMPTY password as required, never as too short', async () => {
    // The order of the two checks, which is the difference between a useful message
    // and a misleading one: "at least 8 characters" under a field the person has not
    // filled in says the wrong thing about what is wrong.
    const view = await mount();
    await submitWithPassword(view, '');

    expect(view.getByText('Password is required')).toBeTruthy();
    expect(view.queryByText('Password must be at least 8 characters')).toBeNull();
    expect(signUp).not.toHaveBeenCalled();
  });

  it('accepts a password at exactly the minimum length', async () => {
    const view = await mount();
    await submitWithPassword(view, 'a'.repeat(8));

    expect(signUp).toHaveBeenCalledTimes(1);
  });
});

describe('a complete form is unchanged', () => {
  it('★ calls sign-up exactly once with the entered values', async () => {
    const view = await mount();
    await fireEvent.changeText(view.getByPlaceholderText(BUSINESS_PLACEHOLDER), 'Acme Retail');
    await fireEvent.changeText(view.getByPlaceholderText(NAME_PLACEHOLDER), 'Ada Lovelace');
    await fireEvent.changeText(view.getByPlaceholderText(EMAIL_PLACEHOLDER), 'owner@example.com');
    await fireEvent.changeText(view.getByPlaceholderText(PASSWORD_PLACEHOLDER), 'Password123!');
    await fireEvent.changeText(view.getByPlaceholderText(CONFIRM_PLACEHOLDER), 'Password123!');
    await press(view);

    expect(signUp).toHaveBeenCalledTimes(1);
    expect(signUp).toHaveBeenCalledWith({
      businessName: 'Acme Retail',
      name: 'Ada Lovelace',
      email: 'owner@example.com',
      password: 'Password123!',
    });
  });
});
