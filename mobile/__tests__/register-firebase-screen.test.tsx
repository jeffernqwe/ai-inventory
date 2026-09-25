/**
 * Phase 32J — the Firebase onboarding screen, and the login screen's route to it.
 *
 * The service half of this flow is pinned in
 * `__tests__/firebase-registration-onboarding.test.tsx`. This file pins the part a
 * person actually meets: what the screen asks for, what it refuses to ask for, what
 * it says when the server refuses, and where the login screen sends them.
 *
 * THREE PROPERTIES ARE LOAD-BEARING AND ARE ASSERTED DIRECTLY, because each one is
 * a way the wrong implementation would still look right:
 *
 *   1. NO EMAIL AND NO PASSWORD. The identity is already authenticated, so asking
 *      for either would create a SECOND Firebase identity (`ensureFirebaseAccount`)
 *      instead of registering the one that was proved. A form that merely *ignored*
 *      those fields would pass a screenshot and fail this.
 *   2. NO RAW SERVER TEXT. The one failure the backend reports generically is the
 *      Firebase UID collision, which arrives as an ordinary 500. Its message must
 *      not reach the screen.
 *   3. THE ACTION GOES TO THE FIREBASE ROUTE. The login screen's footer already
 *      links to `/register`, so a banner action that still pointed there would be
 *      invisible to a test that only looked for a link to a registration screen.
 *      The `Link` mock therefore exposes the href, and both links are asserted.
 *
 * Only `expo-router` and `lib/auth` are mocked — the screens, their error mapping,
 * and `AuthLayout`/`Banner`/`Input`/`Button` are the real ones.
 */

import { fireEvent, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ApiError } from '../lib/client';
import { useSession } from '../lib/auth';
import { FirebaseAuthError } from '../lib/firebase-auth';
import { ThemeProvider } from '../lib/theme-context';

import FirebaseRegisterScreen from '../app/register-firebase';
import LoginScreen from '../app/login';

jest.mock('expo-router', () => {
  // `jest.requireActual`, not a bare `require`: the factory is hoisted above the
  // imports, so a top-level `Text` binding would be in its temporal dead zone.
  const { Text } = jest.requireActual('react-native');
  return {
    router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
    Redirect: () => null,
    // Wraps children in a <Text>, which is what the real `Link` does, and carries
    // the href in a testID so the TARGET can be asserted, not just the wording.
    Link: ({ href, children }: { href: string; children?: ReactNode }) => (
      <Text testID={`link:${href}`}>{children}</Text>
    ),
  };
});

jest.mock('../lib/auth', () => ({
  useSession: jest.fn(),
}));

// The screens only need the error TYPE from this module, and loading the real one
// would pull in the Firebase SDK. The class is re-declared rather than required, so
// `instanceof` is checked against this exact constructor on both sides of the seam.
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
const completeFirebaseRegistration = jest.fn();
const signIn = jest.fn();

const BUSINESS_FIELD = 'Acme Retail';
const NAME_FIELD = 'Jane Doe';
const EMAIL_PLACEHOLDER = 'you@company.com';
const PASSWORD_PLACEHOLDER = '••••••••';
const SUBMIT = 'Create Account';
const SIGN_IN_ACTION = 'Sign in to your existing account';
const GENERIC_MESSAGE = 'We could not create your account. Please try again.';
const EXISTING_ACCOUNT_MESSAGE =
  'An existing Inventory AI account already uses this email. Sign in to that account to continue.';

type View = Awaited<ReturnType<typeof render>>;

const mount = (): Promise<View> =>
  render(
    <ThemeProvider>
      <FirebaseRegisterScreen />
    </ThemeProvider>
  );

const mountLogin = (): Promise<View> =>
  render(
    <ThemeProvider>
      <LoginScreen />
    </ThemeProvider>
  );

/** A session where an identity is authenticated and waiting for a tenant. */
function armedSession(): Record<string, unknown> {
  return {
    status: 'signedOut',
    user: null,
    firebaseRegistrationRequired: true,
    completeFirebaseRegistration,
  };
}

async function submit(view: View, businessName = 'Acme Retail', name = ''): Promise<void> {
  await fireEvent.changeText(view.getByPlaceholderText(BUSINESS_FIELD), businessName);
  if (name) await fireEvent.changeText(view.getByPlaceholderText(NAME_FIELD), name);
  await fireEvent.press(view.getByRole('button', { name: SUBMIT }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseSession.mockReturnValue(armedSession());
  completeFirebaseRegistration.mockResolvedValue({
    id: 'u1',
    name: 'Ada',
    email: 'ada@example.com',
    role: 'OWNER',
  });
});

// ---------------------------------------------------------------------------
// Test 3 — what the screen asks for
// ---------------------------------------------------------------------------

describe('the onboarding form', () => {
  it('★ asks for a business name only — no email, no password, no confirmation', async () => {
    const view = await mount();

    expect(view.getByPlaceholderText(BUSINESS_FIELD)).toBeTruthy();
    expect(view.getByPlaceholderText(NAME_FIELD)).toBeTruthy();

    // The three fields that would mean "create a Firebase identity" are absent.
    expect(view.queryByPlaceholderText(EMAIL_PLACEHOLDER)).toBeNull();
    expect(view.queryByPlaceholderText(PASSWORD_PLACEHOLDER)).toBeNull();
    expect(view.queryByText('Confirm password')).toBeNull();
  });

  it('submits the business name and the optional display name', async () => {
    const view = await mount();
    await submit(view, '  Acme Retail  ', 'Ada Lovelace');

    expect(completeFirebaseRegistration).toHaveBeenCalledTimes(1);
    expect(completeFirebaseRegistration).toHaveBeenCalledWith({
      businessName: 'Acme Retail',
      name: 'Ada Lovelace',
    });
  });

  it('omits the name entirely when it is left blank', async () => {
    const view = await mount();
    await submit(view, 'Acme Retail');

    expect(completeFirebaseRegistration).toHaveBeenCalledWith({
      businessName: 'Acme Retail',
      name: undefined,
    });
  });

  it('requires a business name before calling the service', async () => {
    const view = await mount();
    await submit(view, '   ');

    expect(completeFirebaseRegistration).not.toHaveBeenCalled();
    expect(view.getByText('Business name is required')).toBeTruthy();
  });

  it('promotes a field error with no input of its own to form level', async () => {
    // `validateFirebaseRegister` reports a verified identity with no email address
    // as a problem on `idToken`, which this screen has no input for. Dropping it
    // would leave the user with a silent failure.
    completeFirebaseRegistration.mockRejectedValue(
      new ApiError(400, 'VALIDATION_ERROR', 'Validation failed', [
        { field: 'idToken', message: 'the verified Firebase identity carries no email address' },
      ])
    );

    const view = await mount();
    await submit(view);
    expect(view.getByText('the verified Firebase identity carries no email address')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Test 5 — EMAIL_IN_USE
// ---------------------------------------------------------------------------

describe('the email already belongs to an account', () => {
  it('★ explains the conflict and offers sign-in, without linking anything', async () => {
    completeFirebaseRegistration.mockRejectedValue(
      new ApiError(409, 'EMAIL_IN_USE', 'An account with this email already exists')
    );

    const view = await mount();
    await submit(view);

    expect(view.getByText(EXISTING_ACCOUNT_MESSAGE)).toBeTruthy();
    expect(view.getByText(SIGN_IN_ACTION)).toBeTruthy();
    // The refusal is not retried automatically and the identity is not attached:
    // exactly one attempt was made, and it was the user's.
    expect(completeFirebaseRegistration).toHaveBeenCalledTimes(1);
  });

  it('offers no sign-in action for an ordinary failure', async () => {
    // A disabled account is a statement with nothing to press on THIS screen; the
    // footer link is always present, so the case is pinned on the action's wording.
    completeFirebaseRegistration.mockRejectedValue(
      new ApiError(403, 'ACCOUNT_DISABLED', 'This account is disabled. Contact an administrator.')
    );

    const view = await mount();
    await submit(view);

    expect(view.queryByText(SIGN_IN_ACTION)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test 6 — a collision must not leak internals
// ---------------------------------------------------------------------------

describe('an unrecognised failure', () => {
  it('★ shows a generic sentence and never the thrown error text', async () => {
    // This is the shape a Firebase UID collision takes on the wire: the server
    // logs the detail and answers a generic 500. The raw text must not surface.
    const raw = 'The verified Firebase identity is already linked to another account';
    completeFirebaseRegistration.mockRejectedValue(new Error(raw));

    const view = await mount();
    await submit(view);

    expect(view.getByText(GENERIC_MESSAGE)).toBeTruthy();
    expect(view.queryByText(raw)).toBeNull();
    expect(view.queryByText(/uid/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test 4 (screen side) — the Firebase identity is gone
// ---------------------------------------------------------------------------

describe('no Firebase identity', () => {
  it('shows the module’s safe sentence and offers sign-in', async () => {
    completeFirebaseRegistration.mockRejectedValue(
      new FirebaseAuthError('firebase/no-current-user', 'Your sign-in has expired. Please sign in again.')
    );

    const view = await mount();
    await submit(view);

    expect(view.getByText('Your sign-in has expired. Please sign in again.')).toBeTruthy();
    expect(view.getByText(SIGN_IN_ACTION)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Reaching the route with nothing outstanding
// ---------------------------------------------------------------------------

describe('the route with no pending registration', () => {
  it('does not render a form it could only fail to submit', async () => {
    // A cold start has no Firebase user (in-memory persistence), so offering the
    // form would invite a business name and then fail. Fail safe instead.
    mockedUseSession.mockReturnValue({
      status: 'signedOut',
      user: null,
      firebaseRegistrationRequired: false,
      completeFirebaseRegistration,
    });

    const view = await mount();

    expect(view.queryByPlaceholderText(BUSINESS_FIELD)).toBeNull();
    expect(view.getByText('Your sign-in has expired. Sign in again to continue.')).toBeTruthy();
  });

  it('redirects away once the session exists', async () => {
    mockedUseSession.mockReturnValue({
      status: 'signedIn',
      user: { id: 'u1', name: 'Ada', email: 'ada@example.com', role: 'OWNER' },
      firebaseRegistrationRequired: false,
      completeFirebaseRegistration,
    });

    const view = await mount();
    expect(view.queryByPlaceholderText(BUSINESS_FIELD)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The login screen's wiring to this route
// ---------------------------------------------------------------------------

describe('login — the REGISTRATION_REQUIRED action', () => {
  beforeEach(() => {
    mockedUseSession.mockReturnValue({ status: 'signedOut', user: null, signIn, signInWithGoogle: jest.fn() });
  });

  const linkText = (view: View, href: string): unknown =>
    view.getByTestId(`link:${href}`).props.children;

  it('★ points at the Firebase onboarding route, not the email/password one', async () => {
    signIn.mockRejectedValue(
      new ApiError(
        403,
        'REGISTRATION_REQUIRED',
        'This sign-in is not linked to an Inventory AI account yet. Create a business account to continue.'
      )
    );

    const view = await mountLogin();
    await fireEvent.changeText(view.getByPlaceholderText(EMAIL_PLACEHOLDER), 'owner@example.com');
    await fireEvent.changeText(view.getByPlaceholderText(PASSWORD_PLACEHOLDER), 'Password123!');
    await fireEvent.press(view.getByRole('button', { name: 'Sign In' }));

    // Both links exist — the footer's and the banner action's — and they are told
    // apart by their TARGET, which is the thing that changed in this phase.
    expect(linkText(view, '/register-firebase')).toBe('Create a business account');
    expect(linkText(view, '/register')).toBe('Create an account');
  });
});
