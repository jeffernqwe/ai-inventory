/**
 * Phase 32L-B — the disconnect SCREEN, and the one gate that decides whether it exists
 * at all.
 *
 * THE SCREEN IS NOT THE SECURITY BOUNDARY, and nothing here pretends otherwise. The
 * server refuses an unlinked account with 409 `FIREBASE_IDENTITY_NOT_LINKED` no matter
 * what the UI does. What is asserted here is the part a person meets: that the flow is
 * unreachable when there is nothing to disconnect, that the email can be READ but never
 * TYPED, that a mistyped confirmation never reaches the network, and that each refusal
 * a person can actually hit renders the reply that helps rather than a raw error.
 *
 * THE NO-EMAIL-INPUT CASE IS THE SECURITY ONE. The confirmation's email is the
 * account's own address, taken from the session and displayed. If it were a field, a
 * person could point the confirmation at an identity that is not theirs — and while the
 * server would still refuse the mismatch, the flow would invite an identity-steering
 * attempt that has no legitimate use. It is therefore asserted as an absence.
 *
 * THE FRESHNESS REFUSAL IS ASSERTED AS AN ORDERING, TOO. The server owns a 300 s
 * window, so it can refuse with `FIREBASE_REAUTHENTICATION_REQUIRED` — and the remedy
 * is a second confirmation, which can hand control to a browser that backgrounds or
 * kills this process. The typed new password must therefore be gone BEFORE that
 * confirmation runs. The suite proves it by arriving at step 2 a second time and
 * finding both fields empty, and by checking that the retry's `newPassword` is the one
 * typed afterwards — with the confirmation shown to have happened first.
 *
 * Only `expo-router` and `lib/auth` are mocked — the screen composes the real
 * `Button`/`Card`/`Input`/`Banner` primitives and the real theme, so its rendering is
 * the shipped one. `lib/firebase-auth` is mocked for its error TYPE only, because
 * loading the real module would pull in the Firebase SDK (see `firebase.test.ts`).
 */

import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { ApiError } from '../lib/client';
import { useSession } from '../lib/auth';
import { ThemeProvider } from '../lib/theme-context';

import DisconnectFirebaseScreen from '../app/(app)/disconnect-firebase';
import ProfileScreen from '../app/(app)/profile';

// The redirect target is rendered as text so it can be asserted, which is the same
// treatment `register-firebase-screen.test.tsx` gives its `Link`.
const redirects = { current: [] as string[] };

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
    Redirect: ({ href }: { href: string }) => <Text testID={`redirect:${href}`} />,
    Stack: { Screen: () => null },
  };
});

jest.mock('../lib/auth', () => {
  // `jest.requireActual` INSIDE the factory, not a top-level import: the factory is
  // hoisted above the imports, so a bare `ApiError` binding would be in its temporal
  // dead zone — and Jest forbids the reference outright. Requiring it here also means
  // the `instanceof` check uses the SAME class this file's assertions build errors
  // from, which is what makes the check mean something.
  //
  // The constructor is given an explicit type because `requireActual` is `any`, and an
  // `any` RHS gives `instanceof` nothing to narrow — which is what made this line a
  // typecheck error rather than a silent `any`.
  const ApiErrorClass = jest.requireActual('../lib/client').ApiError as new (
    ...args: never[]
  ) => { status: number; code: string | null };
  return {
    useSession: jest.fn(),
    // A minimal stand-in with the same shape the screen relies on: a 401, or a 403 that
    // names a disabled account. The real one lives in the session suite's real provider.
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
const SECOND_PASSWORD = 'TypedAgain2@';

const GOOGLE_OPTION = 'Confirm with Google';
const PASSWORD_OPTION = 'Confirm with password';
const DISCONNECT = 'Disconnect Firebase';
const CHANGE_PASSWORD = 'Change password';

const confirmFirebaseSignIn = jest.fn();
const disconnectFirebase = jest.fn();
const signOut = jest.fn();

/** Signs in with the account shape under test. `undefined` omits the field entirely. */
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
    disconnectFirebase,
    signOut,
  });
}

/**
 * `render` is awaited, as this project's other screen suites do it: the React 19 /
 * RNTL 14 pair resolves the queries asynchronously, so a bare call would hand back a
 * promise rather than a query object.
 */
const mount = () =>
  render(
    <ThemeProvider>
      <DisconnectFirebaseScreen />
    </ThemeProvider>
  );

/**
 * Walks the flow to the new-password step through the password option.
 *
 * EVERY PRESS IS FOLLOWED BY A `waitFor` rather than a synchronous assertion. Under
 * React 19 the re-render a press schedules is not guaranteed to have been committed by
 * the time `fireEvent` returns, so asserting the next step immediately reads the
 * PREVIOUS tree — which is exactly how the first run of this suite failed.
 */
async function reachPasswordStep(view: Awaited<ReturnType<typeof mount>>) {
  await press(view, PASSWORD_OPTION);
  await waitFor(() => expect(view.getByPlaceholderText('Your current password')).toBeTruthy());
  await typeInto(view, 'Your current password', PASSWORD);
  await press(view, 'Confirm');
  await waitFor(() => expect(view.getByText('Step 2 · Choose a new password')).toBeTruthy());
}

/**
 * Presses a button by its ACCESSIBLE NAME, awaited.
 *
 * Both halves are this project's convention (`register-firebase-screen.test.tsx` does
 * the same): `getByRole` targets the button itself rather than a `Text` inside it, and
 * `fireEvent` is awaited so the work its handler schedules is flushed inside `act`. A
 * bare press leaves the handler's post-`await` state updates outside `act`, which React
 * 19 reports as a console error on every case.
 */
async function press(view: Awaited<ReturnType<typeof mount>>, name: string): Promise<void> {
  await fireEvent.press(view.getByRole('button', { name }));
}

/**
 * Types into a field and waits for the value to be COMMITTED before returning.
 *
 * THIS IS NOT A FORMALITY. A button's `onPress` closes over the state of the render it
 * was created in, so pressing a button from the previous render calls the handler with
 * the PREVIOUS value — for this screen that means an empty password and a handler that
 * correctly reports it as missing rather than proceeding. Waiting for the input's
 * committed `value` is the signal that the same commit has also replaced the buttons'
 * handlers, because a commit replaces the whole subtree.
 *
 * The value is read off the element found by PLACEHOLDER rather than by
 * `getByDisplayValue`, so a field whose value equals another's (the two new-password
 * fields are typed identically on purpose) is still unambiguous.
 */
async function typeInto(
  view: Awaited<ReturnType<typeof mount>>,
  placeholder: string,
  value: string
): Promise<void> {
  await fireEvent.changeText(view.getByPlaceholderText(placeholder), value);
  await waitFor(() => expect(view.getByPlaceholderText(placeholder).props.value).toBe(value));
}

/** Fills both new-password fields and waits for each to be committed. */
async function fillNewPassword(
  view: Awaited<ReturnType<typeof mount>>,
  newPassword: string,
  confirmation = newPassword
): Promise<void> {
  await typeInto(view, 'At least 8 characters', newPassword);
  await typeInto(view, 'Repeat the new password', confirmation);
}

beforeEach(() => {
  jest.clearAllMocks();
  redirects.current = [];
  confirmFirebaseSignIn.mockResolvedValue({ kind: 'idToken', idToken: 'confirmed.token' });
  disconnectFirebase.mockResolvedValue({ kind: 'unlinked' });
  signOut.mockResolvedValue(undefined);
  signInAs({ password: false, firebase: true });
});

// ---------------------------------------------------------------------------
// The gate (decision Q8)
// ---------------------------------------------------------------------------

describe('reachability', () => {
  it('redirects away when the account has no Firebase identity', async () => {
    signInAs({ password: true, firebase: false });
    const view = await mount();

    expect(view.getByTestId('redirect:/profile')).toBeTruthy();
    expect(view.queryByText(GOOGLE_OPTION)).toBeNull();
    expect(view.queryByText(PASSWORD_OPTION)).toBeNull();
  });

  it('redirects away when the capability block is absent entirely', async () => {
    // An older server's user object. Absence means "assume the historical behaviour",
    // which here is that there is no Firebase connection to disconnect.
    signInAs(undefined);
    const view = await mount();

    expect(view.getByTestId('redirect:/profile')).toBeTruthy();
    expect(view.queryByText(GOOGLE_OPTION)).toBeNull();
  });

  it('renders the flow when the account does authenticate through Firebase', async () => {
    const view = await mount();

    expect(view.queryByTestId('redirect:/profile')).toBeNull();
    expect(view.getByText(GOOGLE_OPTION)).toBeTruthy();
    expect(view.getByText(PASSWORD_OPTION)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// The email is read, never typed
// ---------------------------------------------------------------------------

describe('the account email', () => {
  it('is displayed', async () => {
    const view = await mount();
    expect(view.getByText(EMAIL)).toBeTruthy();
  });

  it('has no input anywhere in the flow', async () => {
    const view = await mount();

    // Step 1: the email is on screen and yet nothing carries it as a value.
    expect(view.queryByDisplayValue(EMAIL)).toBeNull();

    // Step 2 as well — reached through the password option, so a field would have had
    // every chance to appear by now.
    await reachPasswordStep(view);
    expect(view.queryByDisplayValue(EMAIL)).toBeNull();
    expect(view.queryByPlaceholderText(/email/i)).toBeNull();
  });

  it('passes the account email to the confirmation without letting it be edited', async () => {
    const view = await mount();

    await press(view, GOOGLE_OPTION);

    await waitFor(() => expect(confirmFirebaseSignIn).toHaveBeenCalledTimes(1));
    expect(confirmFirebaseSignIn).toHaveBeenCalledWith({
      method: 'google',
      email: EMAIL,
      password: undefined,
    });
  });
});

// ---------------------------------------------------------------------------
// Confirming the sign-in
// ---------------------------------------------------------------------------

describe('confirming the sign-in', () => {
  it('asks for the sign-in password only when the password option is chosen', async () => {
    const view = await mount();

    // Google goes straight to the browser, so it needs no field of its own.
    expect(view.queryByPlaceholderText('Your current password')).toBeNull();

    await press(view, PASSWORD_OPTION);
    await waitFor(() => expect(view.getByPlaceholderText('Your current password')).toBeTruthy());
  });

  it('moves to the new-password step once the sign-in is confirmed', async () => {
    const view = await mount();

    await reachPasswordStep(view);

    expect(view.getByPlaceholderText('At least 8 characters')).toBeTruthy();
    expect(view.getByPlaceholderText('Repeat the new password')).toBeTruthy();
  });

  it('explains which option confirms the account when the wrong one was chosen', async () => {
    // Firebase reported that this address has no password identity, so the reply is an
    // instruction rather than an error, and it must not stay on the password screen.
    confirmFirebaseSignIn.mockResolvedValue({ kind: 'wrong-method' });
    const view = await mount();

    await press(view, PASSWORD_OPTION);
    await waitFor(() => expect(view.getByPlaceholderText('Your current password')).toBeTruthy());
    await typeInto(view, 'Your current password', PASSWORD);
    await press(view, 'Confirm');

    await waitFor(() => expect(view.getByText(/other confirmation option/i)).toBeTruthy());
    expect(view.getByText(GOOGLE_OPTION)).toBeTruthy();
  });

  it('shows nothing at all when the person cancels the Google step', async () => {
    // Closing the sheet is an ordinary outcome, not a failure, so there is no banner to
    // read — the same treatment the login screen gives it.
    confirmFirebaseSignIn.mockResolvedValue({ kind: 'cancelled' });
    const view = await mount();

    await press(view, GOOGLE_OPTION);

    await waitFor(() => expect(confirmFirebaseSignIn).toHaveBeenCalled());
    expect(view.queryByText(/could not/i)).toBeNull();
    expect(view.getByText(GOOGLE_OPTION)).toBeTruthy();
  });

  it('renders a confirmation fault through the Firebase module\u2019s safe sentence', async () => {
    confirmFirebaseSignIn.mockResolvedValue({
      kind: 'failure',
      code: 'auth/network-request-failed',
      message: 'Cannot reach the sign-in service. Check your connection and try again.',
    });
    const view = await mount();

    await press(view, GOOGLE_OPTION);

    await waitFor(() =>
      expect(view.getByText(/Cannot reach the sign-in service/)).toBeTruthy()
    );
  });
});

// ---------------------------------------------------------------------------
// The new password, and the one call
// ---------------------------------------------------------------------------

describe('establishing the new password', () => {
  it('does not call the server when the confirmation does not match', async () => {
    const view = await mount();
    await reachPasswordStep(view);

    await fillNewPassword(view, NEW_PASSWORD, 'SomethingElse1!');
    await press(view, DISCONNECT);

    await waitFor(() => expect(view.getByText('Passwords do not match')).toBeTruthy());
    expect(disconnectFirebase).not.toHaveBeenCalled();
  });

  it('does not call the server for a password the server would reject on length', async () => {
    const view = await mount();
    await reachPasswordStep(view);

    await fillNewPassword(view, 'short');
    await press(view, DISCONNECT);

    await waitFor(() => expect(view.getByText(/at least 8 characters/i)).toBeTruthy());
    expect(disconnectFirebase).not.toHaveBeenCalled();
  });

  it('sends the confirmation and the new password, and never the repeat', async () => {
    const view = await mount();
    await reachPasswordStep(view);

    await fillNewPassword(view, NEW_PASSWORD);
    await press(view, DISCONNECT);

    await waitFor(() => expect(disconnectFirebase).toHaveBeenCalledTimes(1));
    const [input, options] = disconnectFirebase.mock.calls[0]!;
    expect(input).toEqual({
      method: 'password',
      email: EMAIL,
      password: PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    // `confirmPassword` is a client-only field: it exists to catch a typo and must not
    // be part of anything the server sees.
    expect(Object.keys(input)).not.toContain('confirmPassword');
    // The FIRST attempt is not a retry, which is what makes the second one the last.
    expect(options).toEqual({ retry: false });
  });

  it('renders the server field errors against the inputs that own them', async () => {
    const err = new ApiError(400, 'VALIDATION_ERROR', 'Validation failed');
    err.fields = [{ field: 'newPassword', message: 'Password must be at least 8 characters' }];
    disconnectFirebase.mockRejectedValue(err);

    const view = await mount();
    await reachPasswordStep(view);
    await fillNewPassword(view, NEW_PASSWORD);
    await press(view, DISCONNECT);

    await waitFor(() => expect(view.getByText('Password must be at least 8 characters')).toBeTruthy());
  });
});

// ---------------------------------------------------------------------------
// The two refusals that carry a reply
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The Profile entry point (decision Q8)
// ---------------------------------------------------------------------------

/** The Profile screen reads the same session, so the gate can be checked where it lives. */
const mountProfile = () =>
  render(
    <ThemeProvider>
      <ProfileScreen />
    </ThemeProvider>
  );

describe('the Profile entry point', () => {
  it('offers the action when the account authenticates through Firebase', async () => {
    const view = await mountProfile();
    expect(view.getByRole('button', { name: DISCONNECT })).toBeTruthy();
  });

  it('does not offer it when there is no Firebase identity to disconnect', async () => {
    signInAs({ password: true, firebase: false });
    const view = await mountProfile();

    expect(view.queryByText(DISCONNECT)).toBeNull();
    // The rest of the Security card is untouched — only this action is gated.
    expect(view.getByText(CHANGE_PASSWORD)).toBeTruthy();
  });

  it('does not offer it for a user object that predates the capability', async () => {
    // Absence of `authMethods.firebase` is not "assume yes": opening a flow the server
    // would refuse with 409 serves nobody, so the action is not shown.
    signInAs({ password: false });
    const view = await mountProfile();

    expect(view.queryByText(DISCONNECT)).toBeNull();
  });
});

describe('server refusals', () => {
  it('points at the other option when the identity is not this account\u2019s', async () => {
    disconnectFirebase.mockRejectedValue(
      new ApiError(409, 'FIREBASE_IDENTITY_CONFLICT', 'This sign-in cannot be connected to this account.')
    );

    const view = await mount();
    await reachPasswordStep(view);
    await fillNewPassword(view, NEW_PASSWORD);
    await press(view, DISCONNECT);

    await waitFor(() => expect(view.getByText(/Try the other confirmation option/i)).toBeTruthy());
    // The server's own sentence for this code points at an administrator, which is the
    // wrong destination for a mistyped choice — so it is deliberately not relayed.
    expect(view.queryByText(/contact an administrator/i)).toBeNull();
    expect(view.getByText(GOOGLE_OPTION)).toBeTruthy();
  });

  it("relays the server's own sentence for a refused Firebase token", async () => {
    disconnectFirebase.mockRejectedValue(
      new ApiError(
        400,
        'FIREBASE_TOKEN_INVALID',
        'Your sign-in could not be verified. Please try again.'
      )
    );

    const view = await mount();
    await reachPasswordStep(view);
    await fillNewPassword(view, NEW_PASSWORD);
    await press(view, DISCONNECT);

    await waitFor(() => expect(view.getByText(/could not be verified/i)).toBeTruthy());
    // Recoverable, so the choice is offered again rather than the flow dead-ending.
    expect(view.getByText(GOOGLE_OPTION)).toBeTruthy();
  });

  it('renders the terminal not-linked refusal', async () => {
    disconnectFirebase.mockRejectedValue(
      new ApiError(409, 'FIREBASE_IDENTITY_NOT_LINKED', 'This account is not connected to a sign-in provider.')
    );

    const view = await mount();
    await reachPasswordStep(view);
    await fillNewPassword(view, NEW_PASSWORD);
    await press(view, DISCONNECT);

    await waitFor(() => expect(view.getByText(/not connected to a sign-in provider/i)).toBeTruthy());
  });
});

// ---------------------------------------------------------------------------
// The freshness refusal — the password is discarded, never carried
// ---------------------------------------------------------------------------

/**
 * Walks a FIRST attempt into a `reauth-required` outcome and back to the choice step.
 *
 * The outcome rather than a thrown error, because that is the contract: the
 * orchestration hands a freshness refusal back after ONE request instead of retrying
 * with the credential it is still holding.
 */
async function reachReauthenticationRefusal(view: Awaited<ReturnType<typeof mount>>) {
  disconnectFirebase.mockResolvedValueOnce({ kind: 'reauth-required' });
  await reachPasswordStep(view);
  await fillNewPassword(view, NEW_PASSWORD);
  await press(view, DISCONNECT);
  await waitFor(() => expect(view.getByText(GOOGLE_OPTION)).toBeTruthy());
}

/** Confirms the sign-in a SECOND time, the way the remedy requires. */
async function reconfirmWithoutPassword(view: Awaited<ReturnType<typeof mount>>) {
  await press(view, PASSWORD_OPTION);
  await waitFor(() => expect(view.getByPlaceholderText('Your current password')).toBeTruthy());
  await typeInto(view, 'Your current password', PASSWORD);
  await press(view, 'Confirm');
  await waitFor(() => expect(view.getByText('Step 2 \u00b7 Choose a new password')).toBeTruthy());
}

describe('the freshness refusal', () => {
  it('returns to the choice step with an instruction rather than an error', async () => {
    const view = await mount();
    await reachReauthenticationRefusal(view);

    expect(view.getByText(/confirm your sign-in again, then choose a new password/i)).toBeTruthy();
    expect(view.getByText(GOOGLE_OPTION)).toBeTruthy();
    expect(view.queryByText(/could not disconnect/i)).toBeNull();
  });

  it('does not send anything until a new password has been typed again', async () => {
    const view = await mount();
    await reachReauthenticationRefusal(view);

    // One attempt so far. Everything from here on is the person's own doing.
    expect(disconnectFirebase).toHaveBeenCalledTimes(1);
    expect(confirmFirebaseSignIn).toHaveBeenCalledTimes(1);

    await reconfirmWithoutPassword(view);

    // The sign-in has been confirmed a second time and STILL nothing has been sent:
    // the retry waits for a password that does not exist yet, which is what keeps the
    // discarded credential from being reused.
    expect(confirmFirebaseSignIn).toHaveBeenCalledTimes(2);
    expect(disconnectFirebase).toHaveBeenCalledTimes(1);
  });

  it('discards the first attempt\u2019s password before the second confirmation', async () => {
    const view = await mount();
    await reachReauthenticationRefusal(view);
    await reconfirmWithoutPassword(view);

    // THE ASSERTION THAT MATTERS. Arriving at step 2 with the previous value still in
    // the fields would mean it had been held in memory across the confirmation — a
    // round-trip that can background or kill the app.
    expect(view.getByPlaceholderText('At least 8 characters').props.value).toBe('');
    expect(view.getByPlaceholderText('Repeat the new password').props.value).toBe('');
  });

  it('retries once, with the newly typed password and the retry flag', async () => {
    const view = await mount();
    await reachReauthenticationRefusal(view);
    await reconfirmWithoutPassword(view);

    await fillNewPassword(view, SECOND_PASSWORD);
    await press(view, DISCONNECT);

    await waitFor(() => expect(disconnectFirebase).toHaveBeenCalledTimes(2));
    const [input, options] = disconnectFirebase.mock.calls[1]!;
    expect(input.newPassword).toBe(SECOND_PASSWORD);
    expect(input.newPassword).not.toBe(NEW_PASSWORD);
    expect(options).toEqual({ retry: true });
    // The second confirmation is what the retry is built on, and it happened first.
    expect(confirmFirebaseSignIn).toHaveBeenCalledTimes(2);
    expect(confirmFirebaseSignIn.mock.invocationCallOrder[1]!).toBeLessThan(
      disconnectFirebase.mock.invocationCallOrder[1]!
    );
  });

  it('stops and surfaces the refusal when the retry is refused the same way', async () => {
    const view = await mount();
    await reachReauthenticationRefusal(view);
    await reconfirmWithoutPassword(view);
    disconnectFirebase.mockRejectedValueOnce(
      new ApiError(409, 'FIREBASE_REAUTHENTICATION_REQUIRED', 'Please confirm your sign-in again.')
    );

    await fillNewPassword(view, SECOND_PASSWORD);
    await press(view, DISCONNECT);

    await waitFor(() => expect(view.getByText(/Please confirm your sign-in again/i)).toBeTruthy());
    // TWO attempts, and the flow stays where it is: answering this with another
    // confirmation would be the loop the freeze forbids.
    expect(disconnectFirebase).toHaveBeenCalledTimes(2);
    expect(view.queryByText(GOOGLE_OPTION)).toBeNull();
  });
});
