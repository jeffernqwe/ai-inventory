/**
 * The sign-in fields declare what they hold, so the platform can fill them.
 *
 * WHY THIS IS A FILE OF ITS OWN. It asserts a different property from
 * `login-validation.test.tsx` (which is about what happens when the form is empty) and from
 * `login-rate-limit-cooldown.test.tsx` (which is about the server's cooldown): here the subject is
 * the metadata the fields carry, not the behaviour behind them. Keeping it separate means the
 * assertion is not something a reader has to find inside a validation case.
 *
 * WHY IT MATTERS AT ALL. A `TextInput` that declares nothing is guessed at by Android's autofill
 * and by iOS's QuickType bar, and the guess is frequently wrong on a screen whose only secure field
 * is the password. `autoComplete` / `textContentType` state the answer — the same reason the two
 * six-digit code screens declare `one-time-code` / `oneTimeCode`, which their own suites pin.
 *
 * `current-password` rather than `new-password` is deliberate: on this screen a password manager
 * should offer a SAVED credential, not propose to generate one, and the two hints differ in exactly
 * that way.
 *
 * Only `expo-router` and `lib/auth` are mocked — the screen and `Input` are the real components, so
 * the props asserted here are the ones handed to React Native's `TextInput`.
 */

import { render } from '@testing-library/react-native';
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

const EMAIL_FIELD = 'you@company.com';
const PASSWORD_FIELD = '••••••••';

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseSession.mockReturnValue({
    status: 'signedOut',
    user: null,
    signIn: jest.fn(),
    signInWithGoogle: jest.fn(),
    firebaseOnboarding: null,
  });
});

describe('the sign-in fields tell the platform what they hold', () => {
  it('★ declares the email field as an address, so autofill offers the saved account', async () => {
    // RNTL 14's `render` is asynchronous, which is why every case here awaits it.
    const view = await render(
      <ThemeProvider>
        <LoginScreen />
      </ThemeProvider>
    );

    const field = view.getByPlaceholderText(EMAIL_FIELD);
    expect(field.props.autoComplete).toBe('email');
    expect(field.props.textContentType).toBe('emailAddress');
  });

  it('★ declares the password field as an EXISTING credential, not a new one', async () => {
    const view = await render(
      <ThemeProvider>
        <LoginScreen />
      </ThemeProvider>
    );

    const field = view.getByPlaceholderText(PASSWORD_FIELD);
    // `current-password` is the whole point: it makes a manager offer the saved password.
    // `new-password` here would invite a generated one for an account that already exists.
    expect(field.props.autoComplete).toBe('current-password');
    expect(field.props.textContentType).toBe('password');
  });
});
