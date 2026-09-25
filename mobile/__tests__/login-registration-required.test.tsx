/**
 * Phase 32E — the login screen surfacing `REGISTRATION_REQUIRED`.
 *
 * This is the one server outcome the login screen must do more than print, so it
 * is the one case where a message alone is not enough: the exchange answers it
 * when an identity authenticated with Firebase but has no Inventory AI account,
 * and the server's message tells the user to create a business account. A message
 * that names a journey needs a control, so the banner for this code carries a link
 * to the registration screen.
 *
 * BOTH SIDES ARE PINNED, because either alone is worthless: a screen that always
 * showed the link would pass the positive case while turning every ordinary error
 * into a dead end pointing at the wrong action.
 *
 * Only `expo-router` and `lib/auth` are mocked — the screen, its error mapping and
 * `AuthLayout`/`Banner`/`Input`/`Button` are the real ones. The banner's link is
 * given distinct wording from the footer's ("Create a business account" against
 * "Create an account") precisely so these cases can tell them apart; the
 * assertions below would otherwise pass on the footer link alone.
 */

import { fireEvent, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ApiError } from '../lib/client';
import { useSession } from '../lib/auth';
import { ThemeProvider } from '../lib/theme-context';

import LoginScreen from '../app/login';

jest.mock('expo-router', () => {
  // `jest.requireActual`, not a bare `require`, for two reasons: the factory is
  // hoisted above the imports, so a top-level `Text` binding would be in its
  // temporal dead zone here; and `react-native` is not mocked in this suite, so
  // requireActual resolves to exactly the module the app renders with.
  const { Text } = jest.requireActual('react-native');
  return {
    router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
    Redirect: () => null,
    // Wraps children in a <Text>, which is what the real `Link` does — its own doc
    // comment says so ("By default, it accepts children and wraps them in a <Text>
    // component"). A mock returning bare children is NOT equivalent: React Native
    // flattens those into the surrounding <Text> as extra text children, so the
    // footer would read "New to Inventory AI? Create an account" as ONE node and
    // every assertion below would be checking a string that the real app never
    // renders. The mock has to preserve the node boundary these cases depend on.
    Link: ({ children }: { children?: ReactNode }) => <Text>{children}</Text>,
  };
});

jest.mock('../lib/auth', () => ({
  useSession: jest.fn(),
}));

const mockedUseSession = useSession as jest.Mock;
const signIn = jest.fn();

const EMAIL_FIELD = 'you@company.com';
const PASSWORD_FIELD = '••••••••';
const BANNER_ACTION = 'Create a business account';
const FOOTER_LINK = 'Create an account';

type View = Awaited<ReturnType<typeof render>>;

const mount = (): Promise<View> =>
  render(
    <ThemeProvider>
      <LoginScreen />
    </ThemeProvider>
  );

/** Fills the form and submits it, then waits for the rejected sign-in to settle. */
async function submitCredentials(view: View): Promise<void> {
  await fireEvent.changeText(view.getByPlaceholderText(EMAIL_FIELD), 'owner@example.com');
  await fireEvent.changeText(view.getByPlaceholderText(PASSWORD_FIELD), 'Password123!');
  await fireEvent.press(view.getByRole('button', { name: 'Sign In' }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseSession.mockReturnValue({ status: 'signedOut', user: null, signIn });
});

describe('login — REGISTRATION_REQUIRED', () => {
  it('shows the server message with an actionable link to registration', async () => {
    const message = 'This sign-in is not linked to an Inventory AI account yet. Create a business account to continue.';
    signIn.mockRejectedValue(new ApiError(403, 'REGISTRATION_REQUIRED', message));

    const view = await mount();
    await submitCredentials(view);

    expect(view.getByText(message)).toBeTruthy();
    expect(view.getByText(BANNER_ACTION)).toBeTruthy();
    // The generic footer link is always present; the banner action is the new one,
    // so both must exist and the case above must not be passing on the footer.
    expect(view.getByText(FOOTER_LINK)).toBeTruthy();
  });

  it('offers no such action for an ordinary refusal', async () => {
    // ACCOUNT_DISABLED is a statement with nothing to press. Showing a
    // registration link here would send a disabled user to create a second
    // account instead of contacting their administrator.
    const message = 'This account is disabled. Contact an administrator.';
    signIn.mockRejectedValue(new ApiError(403, 'ACCOUNT_DISABLED', message));

    const view = await mount();
    await submitCredentials(view);

    expect(view.getByText(message)).toBeTruthy();
    expect(view.queryByText(BANNER_ACTION)).toBeNull();
  });

  it('clears the action when the next attempt fails for a different reason', async () => {
    // The link is derived state, so a second attempt must not inherit the first
    // attempt's affordance.
    signIn.mockRejectedValueOnce(new ApiError(403, 'REGISTRATION_REQUIRED', 'Not linked yet.'));
    const view = await mount();
    await submitCredentials(view);
    expect(view.getByText(BANNER_ACTION)).toBeTruthy();

    signIn.mockRejectedValueOnce(new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password'));
    await submitCredentials(view);

    expect(view.getByText('Invalid email or password')).toBeTruthy();
    expect(view.queryByText(BANNER_ACTION)).toBeNull();
  });
});
