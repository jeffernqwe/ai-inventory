/**
 * Phase A (F-1) — the re-scoped CHANGE-PASSWORD screen.
 *
 * THE SCREEN IS NOT THE SECURITY BOUNDARY, and nothing here pretends otherwise. The
 * server derives the account from the session and the identity from a verified token, so
 * a client that skipped this screen entirely could not change anything it should not.
 * What is asserted here is the part a person meets, and the two things that would be
 * silent if they broke:
 *
 * 1. IT NO LONGER DETACHES ANYTHING. The screen it replaced ended by disconnecting the
 *    account's Firebase identity; this one ends by replacing the credential Firebase
 *    holds and SWAPPING the session, so the person stays signed in. There is no
 *    'signOut' on the success path, and that absence is pinned.
 * 2. THE CREDENTIAL IS DISCARDED BEFORE THE SECOND CONFIRMATION. A freshness refusal
 *    sends the flow back to step 1, and the typed new password must be gone before a
 *    confirmation can hand control to a browser that backgrounds or kills the process.
 *    The suite proves it by arriving at step 2 a second time and finding it empty.
 *
 * Only 'expo-router' and 'lib/auth' are mocked — the screen composes the real
 * 'Button'/'Card'/'Input'/'Banner' primitives and the real theme, so its rendering is the
 * shipped one. 'lib/firebase-auth' is mocked for its error TYPE only, because loading the
 * real module would pull in the native packages.
 */

import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { ApiError } from '../lib/client';
import { useSession } from '../lib/auth';
import { ThemeProvider } from '../lib/theme-context';

import ChangePasswordScreen from '../app/(app)/disconnect-firebase';
import { router } from 'expo-router';

// The redirect target is rendered as text so it can be asserted.
jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
    Redirect: ({ href }: { href: string }) => <Text testID={'redirect:' + href} />,
    Stack: { Screen: () => null },
  };
});

jest.mock('../lib/auth', () => {
  // 'jest.requireActual' INSIDE the factory, not a top-level import: the factory is hoisted
  // above the imports, so a bare binding would be in its temporal dead zone. Requiring it
  // here also means 'instanceof' uses the SAME class this file's assertions build from.
  const ApiErrorClass = jest.requireActual('../lib/client').ApiError as new (
    ...args: never[]
  ) => { status: number; code: string | null };
  return {
    useSession: jest.fn(),
    // The real predicate's shape: a 401, or a 403 that names a disabled account.
    isSessionError: (err: unknown) =>
      err instanceof ApiErrorClass && (err.status === 401 || err.code === 'ACCOUNT_DISABLED'),
  };
});

jest.mock('../lib/firebase-auth', () => ({
  FirebaseAuthError: class FirebaseAuthError extends Error {
    code: string | null;

    constructor(code: string | null, message: string) {
      super(message);
      this.name = 'FirebaseAuthError';
      this.code = code;
    }
  },
}));

const mockedUseSession = useSession as jest.Mock;

const EMAIL = 'owner@example.com';
const PASSWORD = 'Password123!';
const NEW_PASSWORD = 'BrandNewPass1!';
const MISMATCH = 'TypedDifferently2@';

const GOOGLE_OPTION = 'Confirm with Google';
const PASSWORD_OPTION = 'Confirm with password';
const STEP_ONE = 'Step 1 · Confirm your sign-in';
const STEP_TWO = 'Step 2 · Choose a new password';
const CHANGE = 'Change sign-in password';
const SUCCESS_HEADING = 'Password changed';
const REAUTH_NOTICE =
  'For your security, please confirm your sign-in again, then choose a new password.';

const confirmFirebaseSignIn = jest.fn();
const changeFirebasePassword = jest.fn();
const signOut = jest.fn();

/** Signs in with the account shape under test. 'undefined' omits the field entirely. */
function signInAs(authMethods?: { password: boolean; firebase?: boolean }): void {
  mockedUseSession.mockReturnValue({
    user: {
      id: 'u1',
      name: 'Jane Doe',
      email: EMAIL,
      role: 'OWNER',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      ...(authMethods === undefined ? {} : { authMethods }),
    },
    status: 'signedIn',
    confirmFirebaseSignIn,
    changeFirebasePassword,
    signOut,
  });
}

/**
 * 'render' is awaited, as this project's other screen suites do it: the React 19 / RNTL 14
 * pair resolves the queries asynchronously, so a bare call would hand back a promise.
 */
const mount = () =>
  render(
    <ThemeProvider>
      <ChangePasswordScreen />
    </ThemeProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  signInAs({ password: false, firebase: true });
  confirmFirebaseSignIn.mockResolvedValue({ kind: 'idToken', idToken: 'confirmed.id.token' });
  changeFirebasePassword.mockResolvedValue({ kind: 'changed' });
  signOut.mockResolvedValue(undefined);
});

/** Step 1, with the password option confirmed, leaving the screen at step 2. */
async function reachStepTwo(view: Awaited<ReturnType<typeof mount>>): Promise<void> {
  await fireEvent.press(view.getByRole('button', { name: PASSWORD_OPTION }));
  await fireEvent.changeText(view.getByPlaceholderText('Your current password'), PASSWORD);
  await fireEvent.press(view.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(view.getByText(STEP_TWO)).toBeTruthy());
}

describe('the screen is reachable only where it means something', () => {
  it('redirects an account that does not authenticate through Firebase', async () => {
    signInAs({ password: true, firebase: false });
    const view = await mount();

    expect(view.getByTestId('redirect:/profile')).toBeTruthy();
    expect(view.queryByText(STEP_ONE)).toBeNull();
  });

  it('redirects when the capability block is absent entirely', async () => {
    // An older server's user object. The check is '!== true', so absence is not "assume yes".
    signInAs(undefined);
    const view = await mount();

    expect(view.getByTestId('redirect:/profile')).toBeTruthy();
  });

  it('shows the account address but gives no field to change it', async () => {
    const view = await mount();

    expect(view.getByText(STEP_ONE)).toBeTruthy();
    // READABLE, NEVER TYPED: if the address were a field, a person could point the
    // confirmation at an identity that is not theirs.
    expect(view.getByText(EMAIL)).toBeTruthy();
    expect(view.queryByDisplayValue(EMAIL)).toBeNull();
  });

  it('reports a missing confirmation password instead of sending it', async () => {
    const view = await mount();

    await fireEvent.press(view.getByRole('button', { name: PASSWORD_OPTION }));
    await fireEvent.press(view.getByRole('button', { name: 'Confirm' }));

    expect(view.getByText('Password is required')).toBeTruthy();
    expect(confirmFirebaseSignIn).not.toHaveBeenCalled();
    expect(view.getByText(STEP_ONE)).toBeTruthy();
  });

  it('reports a mistyped confirmation without reaching the network', async () => {
    const view = await mount();
    await reachStepTwo(view);

    await fireEvent.changeText(view.getByPlaceholderText('At least 8 characters'), NEW_PASSWORD);
    await fireEvent.changeText(view.getByPlaceholderText('Repeat the new password'), MISMATCH);
    await fireEvent.press(view.getByRole('button', { name: CHANGE }));

    expect(view.getByText('Passwords do not match')).toBeTruthy();
    // A mistyped confirmation must never become the credential, and must never spend a
    // request that records a change that did not happen.
    expect(changeFirebasePassword).not.toHaveBeenCalled();
  });
});

describe('the screen reports the change, and never disconnects anything', () => {
  it('★ confirms the success and offers the way back, with NO sign-out', async () => {
    const view = await mount();
    await reachStepTwo(view);

    await fireEvent.changeText(view.getByPlaceholderText('At least 8 characters'), NEW_PASSWORD);
    await fireEvent.changeText(view.getByPlaceholderText('Repeat the new password'), NEW_PASSWORD);
    await fireEvent.press(view.getByRole('button', { name: CHANGE }));

    await waitFor(() => expect(view.getByText(SUCCESS_HEADING)).toBeTruthy());
    // THE PHASE'S CENTRAL NEGATIVE, at the surface a person meets: the flow replaces the
    // credential and the session, so it must not end the session it was using.
    expect(signOut).not.toHaveBeenCalled();

    await fireEvent.press(view.getByRole('button', { name: 'Back to profile' }));
    expect(router.replace).toHaveBeenCalledWith('/profile');
  });

  it('sends the new password and the confirmation option, and nothing else', async () => {
    const view = await mount();
    await reachStepTwo(view);

    await fireEvent.changeText(view.getByPlaceholderText('At least 8 characters'), NEW_PASSWORD);
    await fireEvent.changeText(view.getByPlaceholderText('Repeat the new password'), NEW_PASSWORD);
    await fireEvent.press(view.getByRole('button', { name: CHANGE }));

    await waitFor(() => expect(changeFirebasePassword).toHaveBeenCalledTimes(1));
    expect(changeFirebasePassword).toHaveBeenCalledWith(
      {
        method: 'password',
        email: EMAIL,
        password: PASSWORD,
        newPassword: NEW_PASSWORD,
      },
      { retry: false }
    );
  });

  it('★ discards the typed new password BEFORE the second confirmation', async () => {
    changeFirebasePassword.mockResolvedValue({ kind: 'reauth-required' });
    const view = await mount();
    await reachStepTwo(view);

    await fireEvent.changeText(view.getByPlaceholderText('At least 8 characters'), NEW_PASSWORD);
    await fireEvent.changeText(view.getByPlaceholderText('Repeat the new password'), NEW_PASSWORD);
    await fireEvent.press(view.getByRole('button', { name: CHANGE }));

    // Back to step 1, told what to do rather than what went wrong, and still signed in.
    await waitFor(() => expect(view.getByText(STEP_ONE)).toBeTruthy());
    expect(view.getByText(REAUTH_NOTICE)).toBeTruthy();
    expect(signOut).not.toHaveBeenCalled();

    // The second confirmation runs, and the credential typed before it is GONE — the whole
    // reason it is discarded by hand rather than left in state across a browser round trip.
    await reachStepTwo(view);
    expect(view.queryByDisplayValue(NEW_PASSWORD)).toBeNull();
    expect(view.queryByDisplayValue(PASSWORD)).toBeNull();
  });

  it('spends exactly one automatic retry, then reports the refusal', async () => {
    changeFirebasePassword.mockResolvedValue({ kind: 'reauth-required' });
    const view = await mount();

    // First attempt: the screen answers with a fresh confirmation.
    await reachStepTwo(view);
    await fireEvent.changeText(view.getByPlaceholderText('At least 8 characters'), NEW_PASSWORD);
    await fireEvent.changeText(view.getByPlaceholderText('Repeat the new password'), NEW_PASSWORD);
    await fireEvent.press(view.getByRole('button', { name: CHANGE }));
    await waitFor(() => expect(view.getByText(STEP_ONE)).toBeTruthy());

    // Second attempt carries the retry flag, so the same refusal is terminal here.
    await reachStepTwo(view);
    await fireEvent.changeText(view.getByPlaceholderText('At least 8 characters'), NEW_PASSWORD);
    await fireEvent.changeText(view.getByPlaceholderText('Repeat the new password'), NEW_PASSWORD);
    await fireEvent.press(view.getByRole('button', { name: CHANGE }));

    await waitFor(() => expect(view.queryByText(SUCCESS_HEADING)).toBeNull());
    expect(changeFirebasePassword).toHaveBeenNthCalledWith(2, expect.anything(), { retry: true });
    expect(signOut).not.toHaveBeenCalled();
  });

  it('answers the wrong confirmation option with the other one, without a dead end', async () => {
    confirmFirebaseSignIn.mockResolvedValue({ kind: 'wrong-method' });
    const view = await mount();

    await fireEvent.press(view.getByRole('button', { name: PASSWORD_OPTION }));
    await fireEvent.changeText(view.getByPlaceholderText('Your current password'), PASSWORD);
    await fireEvent.press(view.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(
        view.getByText('That does not match this account. Try the other confirmation option.')
      ).toBeTruthy()
    );
    // Back at the choice, where the remedy lives, rather than on a step that cannot succeed.
    expect(view.getByText(STEP_ONE)).toBeTruthy();
    expect(view.getByRole('button', { name: GOOGLE_OPTION })).toBeTruthy();
    expect(changeFirebasePassword).not.toHaveBeenCalled();
  });

  it('ends the local session when the server reports session loss', async () => {
    changeFirebasePassword.mockRejectedValue(new ApiError(401, 'AUTH_REQUIRED', 'Sign in again.'));
    const view = await mount();
    await reachStepTwo(view);

    await fireEvent.changeText(view.getByPlaceholderText('At least 8 characters'), NEW_PASSWORD);
    await fireEvent.changeText(view.getByPlaceholderText('Repeat the new password'), NEW_PASSWORD);
    await fireEvent.press(view.getByRole('button', { name: CHANGE }));

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(view.queryByText(SUCCESS_HEADING)).toBeNull();
  });
});
