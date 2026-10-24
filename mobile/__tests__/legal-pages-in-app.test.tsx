/**
 * The two legal pages, reachable from the app.
 *
 * WHY THIS SUITE EXISTS. Google Play's listing points at a privacy policy URL, and the terms are
 * referenced from the same pages; both are worthless to a person holding the phone if the app
 * never opens them. This pins the part a person meets: Profile offers both, each tap opens the
 * page ON OUR OWN SERVER at an address derived from `API_URL`, and a device that cannot open a
 * browser says so instead of appearing to do nothing.
 *
 * WHY THE URL IS ASSERTED AGAINST `API_URL` RATHER THAN A LITERAL. The defect this prevents is
 * the quiet one: a hand-written domain in a screen keeps working on the machine it was typed on
 * and points somewhere else — or nowhere — in a build configured for another server. Comparing
 * against the imported constant means a build pointed at the development server opens the
 * development pages, and no edit here can hardcode a host.
 *
 * Only `expo-router` and `lib/auth` are mocked, the same way the Phase 32M suite does it: the
 * screen renders the real `Button`/`Card`/`Banner` primitives and the real theme.
 */

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { API_URL } from '../lib/config';
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

const PRIVACY = 'Privacy policy';
const TERMS = 'Terms of use';

function signedIn(): void {
  mockedUseSession.mockReturnValue({
    user: {
      id: 'u1',
      name: 'Jane Doe',
      email: 'jane@acme.test',
      role: 'OWNER',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    status: 'signedIn',
    signOut: jest.fn(),
    refresh: jest.fn(),
    connectFirebase: jest.fn(),
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
  signedIn();
  jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
  // `openURL` is declared `Promise<void>`, so the stub resolves with nothing.
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('★ opens the privacy policy on the server this build talks to', async () => {
  const screen = await mount();

  await act(async () => {
    fireEvent.press(screen.getByText(PRIVACY));
  });

  await waitFor(() => expect(Linking.openURL).toHaveBeenCalledTimes(1));
  expect(Linking.openURL).toHaveBeenCalledWith(`${API_URL}/privacy`);
  expect(API_URL).toMatch(/^https?:\/\//);
});

it('★ opens the terms of use at the same origin, and the two addresses differ', async () => {
  const screen = await mount();

  await act(async () => {
    fireEvent.press(screen.getByText(TERMS));
  });

  await waitFor(() => expect(Linking.openURL).toHaveBeenCalledTimes(1));
  expect(Linking.openURL).toHaveBeenCalledWith(`${API_URL}/terms`);
  expect(`${API_URL}/terms`).not.toBe(`${API_URL}/privacy`);
});

it('asks the platform whether it can open the page before trying', async () => {
  const screen = await mount();

  await act(async () => {
    fireEvent.press(screen.getByText(PRIVACY));
  });

  await waitFor(() => expect(Linking.canOpenURL).toHaveBeenCalledWith(`${API_URL}/privacy`));
});

it('says so when the device cannot open a browser, instead of doing nothing', async () => {
  jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);
  const screen = await mount();

  await act(async () => {
    fireEvent.press(screen.getByText(TERMS));
  });

  await waitFor(() =>
    expect(screen.getByText(/Could not open the page on this device/)).toBeTruthy()
  );
  expect(Linking.openURL).not.toHaveBeenCalled();
});

it('keeps the session: no legal tap signs the person out or changes the account', async () => {
  const signOut = jest.fn();
  mockedUseSession.mockReturnValue({
    user: {
      id: 'u1',
      name: 'Jane Doe',
      email: 'jane@acme.test',
      role: 'OWNER',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    status: 'signedIn',
    signOut,
    refresh: jest.fn(),
    connectFirebase: jest.fn(),
  });
  const screen = await mount();

  // One press at a time: each tap resolves its own promise, so the two are not raced into the
  // same act() scope (which is also why the second wait is for a count, not for a truthiness).
  fireEvent.press(screen.getByText(PRIVACY));
  await waitFor(() => expect(Linking.openURL).toHaveBeenCalledTimes(1));
  fireEvent.press(screen.getByText(TERMS));
  await waitFor(() => expect(Linking.openURL).toHaveBeenCalledTimes(2));
  expect(signOut).not.toHaveBeenCalled();
});
