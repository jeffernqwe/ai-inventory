/**
 * Phase 32M — the Profile screen's Connect Google entry point, and the gate that
 * decides whether it exists at all.
 *
 * THE SCREEN IS NOT THE SECURITY BOUNDARY, and nothing here pretends otherwise. A
 * client that somehow called the route for an account that already carries an
 * identity would be refused by the server (CASE D), and one that presented
 * somebody else's identity would be refused too (CASE B). What is asserted here is
 * the part a person meets: that the action is offered exactly where reconnecting
 * is possible and meaningful, that the screen holds no credential of its own, and
 * that each answer — success, cancellation, refusal — renders the reply that helps
 * rather than a raw error.
 *
 * THE GATE IS DELIBERATELY TWO-SIDED. It is not enough that no Firebase identity
 * is attached: the account must also have a local password, because that password
 * is what proves ownership of the account being linked. A shape without one is
 * therefore not offered the action even though its `firebase` half is false.
 *
 * Only `expo-router` and `lib/auth` are mocked — the screen composes the real
 * `Button`/`Card`/`Banner` primitives and the real theme, so its rendering is the
 * shipped one.
 */

import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { ApiError } from '../lib/client';
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

const CONNECT = 'Connect Google';
// Phase A (F-1): the entry point no longer detaches anything — it changes the
// password. The label stays provider-neutral (the screen must not name the identity
// implementation) and distinct from the local 'Change password' control, which is why
// it is asserted by its own constant.
const CHANGE_SIGNIN_PASSWORD = 'Change sign-in password';
const CHANGE_PASSWORD = 'Change password';

const connectFirebase = jest.fn();

/** Signs in with the account shape under test. `undefined` omits the field entirely. */
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
    status: 'signedIn',
    connectFirebase,
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
  connectFirebase.mockResolvedValue({ kind: 'linked' });
  signInAs({ password: true, firebase: false });
});

describe('Profile — connecting Google is offered only where it applies', () => {
  it('offers it to a password account with no Firebase identity', async () => {
    const view = await mount();

    expect(view.getByRole('button', { name: CONNECT })).toBeTruthy();
    // The rest of the Security card is untouched: only this action is gated.
    expect(view.getByText(CHANGE_PASSWORD)).toBeTruthy();
    expect(view.queryByText(CHANGE_SIGNIN_PASSWORD)).toBeNull();
  });

  it('does not offer it when the account already authenticates through Firebase', async () => {
    signInAs({ password: false, firebase: true });
    const view = await mount();

    expect(view.queryByText(CONNECT)).toBeNull();
    // The inverse action is what belongs there instead.
    expect(view.getByRole('button', { name: CHANGE_SIGNIN_PASSWORD })).toBeTruthy();
  });

  it('does not offer it when the capability block is absent entirely', async () => {
    // An older server's user object. Absence is not "assume yes": the preconditions of
    // the flow are unknown, so nothing is offered.
    signInAs(undefined);
    const view = await mount();

    expect(view.queryByText(CONNECT)).toBeNull();
    expect(view.queryByText(CHANGE_SIGNIN_PASSWORD)).toBeNull();
  });

  it('does not offer it to an account that already reports a local password AND an identity', async () => {
    // The two halves of the gate are not interchangeable, so this shape — a password
    // that is managed locally alongside an identity that is already attached — is
    // pinned separately. Today the server derives `password: false` for every account
    // carrying a `firebaseUid`, so this combination is not a shape it produces; the
    // point is that attaching is never offered where there is already something to
    // detach, however the capability block is eventually derived.
    signInAs({ password: true, firebase: true });
    const view = await mount();

    expect(view.queryByText(CONNECT)).toBeNull();
    expect(view.getByRole('button', { name: CHANGE_SIGNIN_PASSWORD })).toBeTruthy();
  });

  it('does not offer it without a local password, even with no Firebase identity', async () => {
    // The account's password is the ownership proof this flow relies on, so a shape
    // without one is refused by the gate as well as by the server.
    signInAs({ password: false, firebase: false });
    const view = await mount();

    expect(view.queryByText(CONNECT)).toBeNull();
  });

  it('starts exactly one attempt per press and reports the success', async () => {
    const view = await mount();

    await fireEvent.press(view.getByRole('button', { name: CONNECT }));

    await waitFor(() => expect(connectFirebase).toHaveBeenCalledTimes(1));
    // The credential and the request are the session layer's; the screen passes nothing.
    expect(connectFirebase).toHaveBeenCalledWith();
    await waitFor(() => expect(view.getByText(/Google is now connected/i)).toBeTruthy());
  });

  it('shows nothing at all when the person cancels the Google step', async () => {
    connectFirebase.mockResolvedValue({ kind: 'cancelled' });
    const view = await mount();

    await fireEvent.press(view.getByRole('button', { name: CONNECT }));

    await waitFor(() => expect(connectFirebase).toHaveBeenCalledTimes(1));
    // Closing the sheet is an ordinary outcome, not a failure: no banner, and the action
    // is still there so the person can try again.
    expect(view.queryByText(/could not/i)).toBeNull();
    expect(view.queryByText(/already in progress/i)).toBeNull();
    await waitFor(() => expect(view.getByRole('button', { name: CONNECT })).toBeTruthy());
  });

  it("relays the server's own sentence for a refused link", async () => {
    // The server's conflict message is deliberately generic — it may not say whether
    // the identity belongs to someone else or this account already carries a different
    // one — so the screen relays it rather than inventing an explanation it cannot support.
    connectFirebase.mockRejectedValue(
      new ApiError(
        409,
        'FIREBASE_IDENTITY_CONFLICT',
        'This sign-in cannot be connected to this account. Please contact an administrator.'
      )
    );
    const view = await mount();

    await fireEvent.press(view.getByRole('button', { name: CONNECT }));

    await waitFor(() =>
      expect(
        view.getByText('This sign-in cannot be connected to this account. Please contact an administrator.')
      ).toBeTruthy()
    );
    // Still offered: the refusal changed nothing, so the person may retry.
    expect(view.getByRole('button', { name: CONNECT })).toBeTruthy();
  });
});
