/**
 * Phase 32K — what the Profile screen offers, and what it stops offering.
 *
 * The server half of this boundary is pinned in
 * `server/test/phase32k-firebase-password-boundary.test.mjs`. This file pins the
 * part a person meets: an account whose credential is held by its sign-in provider
 * must not be invited to change a local password the server will refuse to change.
 *
 * THE SCREEN IS NOT THE SECURITY BOUNDARY AND NOTHING HERE PRETENDS OTHERWISE. A
 * Firebase-owned account that reaches `/change-password` anyway — by deep link, by
 * a stale bundle, or by a hand-crafted request — is refused with 409
 * `PASSWORD_NOT_APPLICABLE` by the server, and the change-password screen's
 * existing error path already renders that message. What is asserted here is only
 * that the UI does not OFFER an action it knows will be rejected.
 *
 * THREE CASES, AND THE THIRD IS THE ONE THAT IS EASY TO GET WRONG:
 *
 *   1. `authMethods.password === false` — no Change password control, and a
 *      sentence explaining why instead.
 *   2. `authMethods.password === true`  — the control is there, exactly as before.
 *   3. `authMethods` ABSENT             — the control is there. An older server, or
 *      any response that predates this phase, must keep the historical behaviour
 *      rather than silently removing the feature. This is why the screen tests
 *      `=== false` and not falsiness.
 *
 * It also pins the NEGATIVE half of the contract: the reason lives in the response
 * as a capability, so no provider name reaches the screen. A screen that rendered
 * "Firebase" would pass a naive "is the button hidden" test and fail this one.
 *
 * Only `expo-router` and `lib/auth` are mocked — the screen composes the real
 * `Button`/`Card`/`Text` primitives and the real theme, so its rendering is the
 * shipped one.
 */

import { render } from '@testing-library/react-native';

import { useSession } from '../lib/auth';
import { ThemeProvider } from '../lib/theme-context';

import ProfileScreen from '../app/(app)/profile';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

jest.mock('../lib/auth', () => ({
  useSession: jest.fn(),
}));

const mockedUseSession = useSession as jest.Mock;

const CHANGE_PASSWORD = 'Change password';
const ACTIVE_SESSIONS = 'Active sessions';
// Matched loosely on the clause that carries the meaning, so the assertion does
// not hinge on how the apostrophe in "can't" happens to be encoded in JSX.
const MANAGED_NOTE = /managed by your sign-in provider/i;

/**
 * Signs in as a user whose account shape is described by `authMethods`.
 *
 * `undefined` omits the field entirely, which is the case an older server's
 * response produces — the one that must not change the UI.
 */
function signInAs(authMethods?: { password: boolean; firebase?: boolean }): void {
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
    token: 'token',
    signOut: jest.fn(),
    refresh: jest.fn(),
  });
}

const mount = () =>
  render(
    <ThemeProvider>
      <ProfileScreen />
    </ThemeProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Profile — local password management is offered only where it applies', () => {
  it('hides the control and explains why when the provider manages the password', async () => {
    signInAs({ password: false });
    const { queryByText, getByText } = await mount();

    expect(queryByText(CHANGE_PASSWORD)).toBeNull();
    // The reason is shown rather than the control silently vanishing: a missing
    // button with no explanation reads as a bug.
    expect(getByText(MANAGED_NOTE)).toBeTruthy();
    // Only the password control is gated. Everything else on the screen stays.
    expect(getByText(ACTIVE_SESSIONS)).toBeTruthy();
  });

  it('keeps the control for an account that manages its own password', async () => {
    signInAs({ password: true });
    const { queryByText, getByText } = await mount();

    expect(getByText(CHANGE_PASSWORD)).toBeTruthy();
    expect(queryByText(MANAGED_NOTE)).toBeNull();
  });

  it('keeps the control when the server does not send the capability at all', async () => {
    // Backward compatibility, and the reason the screen compares `=== false`: an
    // older server's user object has no `authMethods`, and defaulting to "no local
    // password" would take the feature away from every legacy account.
    signInAs();
    const { queryByText, getByText } = await mount();

    expect(getByText(CHANGE_PASSWORD)).toBeTruthy();
    expect(queryByText(MANAGED_NOTE)).toBeNull();
  });

  it('keeps the note, not the local action, when a local password AND an identity are both reported', async () => {
    // ADDED BY THIS PASS. A shape the current server does not produce — `authMethodsFor`
    // derives the two capabilities as exact complements of `firebaseUid`, so an account is
    // either `{ true, false }` or `{ false, true }` — but which Phase 32M already pins
    // as reachable "however the capability block is eventually derived".
    //
    // IF IT APPEARS, THE LOCAL ACTION IS A DEAD END: the retained hash no longer
    // authenticates anyone (`loginWithPassword` refuses a `firebaseUid` account with 403
    // `FIREBASE_SIGN_IN_REQUIRED`), so `/change-password` answers 409
    // `PASSWORD_NOT_APPLICABLE` every time. The provider note is the honest answer,
    // and the Firebase-managed action below it is the one that works.
    signInAs({ password: true, firebase: true });
    const { queryByText, getByText } = await mount();

    expect(queryByText(CHANGE_PASSWORD)).toBeNull();
    expect(getByText(MANAGED_NOTE)).toBeTruthy();
    // Only the local control is withdrawn; the rest of the screen is untouched.
    expect(getByText(ACTIVE_SESSIONS)).toBeTruthy();
  });

  it('names no sign-in provider on the screen', async () => {
    // The server publishes a capability, not the `firebaseUid` behind it, and the
    // screen must not reintroduce the implementation detail it was spared.
    signInAs({ password: false });
    const { toJSON } = await mount();
    const surface = JSON.stringify(toJSON()).toLowerCase();

    expect(surface.includes('firebase')).toBe(false);
    expect(surface.includes('google')).toBe(false);
  });
});
