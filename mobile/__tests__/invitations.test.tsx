/**
 * Invitation-based onboarding — the client half (2026-10-25).
 *
 * WHY THIS SUITE EXISTS. An invitation is the first way a person joins an EXISTING
 * business, and it changes three things on the client that must not drift:
 *
 *   1. THE INVITATION SCREEN READS AND STORES NOTHING ELSE. It takes one query
 *      parameter, previews it once over a public endpoint, and puts the token in
 *      memory — never in a route parameter, never in storage. A dead link says so and
 *      stops; it does not become a retry loop.
 *   2. THE REGISTER FORM ASKS FOR NO BUSINESS. An invited person joins somebody else's
 *      business, so the field is absent (not merely optional) and the email is locked to
 *      the invited address — the identity the server compares the verified claim against.
 *   3. THE TOKEN ACTUALLY REACHES THE SERVER, on the one request that can use it, and is
 *      forgotten once a session exists.
 *
 * `lib/auth` and `lib/api` are mocked for the screens; the AuthProvider cases at the end
 * drive the REAL provider and mock only its module boundaries, so the third rule is
 * asserted where it is implemented rather than where it is described.
 */

import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { router } from 'expo-router';

import { ApiError } from '../lib/client';
import { ThemeProvider } from '../lib/theme-context';
import { clearPendingInvite, getPendingInvite, setPendingInvite } from '../lib/pendingInvite';
import { confirm } from '../lib/confirm';
import { AuthProvider, useSession } from '../lib/auth';

import InviteScreen from '../app/invite';
import RegisterScreen from '../app/register';
import InvitationsScreen from '../app/(app)/users/invitations';

// ---------------------------------------------------------------------------
// Router + module seams
// ---------------------------------------------------------------------------

const mockSearchParams = jest.fn(() => ({}) as Record<string, string>);

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
    useLocalSearchParams: () => mockSearchParams(),
    Redirect: ({ href }: { href: string }) => <Text>{'redirect:' + href}</Text>,
    Link: ({ children }: { children?: unknown }) => <Text>{children as never}</Text>,
    Stack: { Screen: () => null },
  };
});

/**
 * The screens read the session, so `useSession` is a stub here — but the REAL provider is
 * kept (`requireActual`) because the last group of cases drives it rather than describing
 * it. Only the hook is replaced; the module's behaviour is not.
 */
jest.mock('../lib/auth', () => ({
  ...jest.requireActual('../lib/auth'),
  useSession: jest.fn(),
}));

const mockPreviewInvitation = jest.fn();
const mockList = jest.fn();
const mockCreate = jest.fn();
const mockRevoke = jest.fn();

jest.mock('../lib/confirm', () => ({
  confirm: jest.fn(async () => true),
}));

const mockUseSession = useSession as jest.Mock;
const mockConfirm = confirm as jest.Mock;
const mockReplace = router.replace as jest.Mock;

const TOKEN = 'a'.repeat(64);

const INVITATION = {
  email: 'colleague@acme.test',
  role: 'MANAGER',
  businessName: 'Acme Retail',
  expiresAt: '2026-11-01T00:00:00.000Z',
};

function signedOut(overrides: Record<string, unknown> = {}) {
  mockUseSession.mockReturnValue({
    status: 'signedOut',
    user: null,
    token: null,
    signUp: jest.fn(async () => null),
    signOut: jest.fn(async () => {}),
    firebaseOnboarding: null,
    ...overrides,
  });
}

function manager({ token = 'session-token' } = {}) {
  const signOut = jest.fn(async () => {});
  mockUseSession.mockReturnValue({
    status: 'signedIn',
    user: { id: 'u-admin', name: 'Ada', role: 'ADMIN', email: 'ada@acme.test' },
    token,
    signUp: jest.fn(async () => null),
    signOut,
  });
  return signOut;
}

function renderWithTheme(element: ReactElement) {
  return render(<ThemeProvider>{element}</ThemeProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  clearPendingInvite();
  mockSearchParams.mockReturnValue({});
  mockPreviewInvitation.mockResolvedValue(INVITATION);
  mockList.mockResolvedValue({ items: [], total: 0 });
  mockCreate.mockResolvedValue({ id: 'inv1', ...INVITATION });
  mockRevoke.mockResolvedValue(undefined);
  mockConfirm.mockResolvedValue(true);
  signedOut();
});

// ---------------------------------------------------------------------------
// 1 — the invitation screen
// ---------------------------------------------------------------------------

describe('the invitation screen', () => {
  it('★ shows what the invitation offers and carries it into registration', async () => {
    mockSearchParams.mockReturnValue({ token: TOKEN });

    const view = await renderWithTheme(<InviteScreen />);

    await waitFor(() => expect(view.getByText('Join Acme Retail')).toBeTruthy());
    // Exactly four facts, all of them the invitee's own business.
    expect(view.getByText('colleague@acme.test')).toBeTruthy();
    expect(view.getByText('Manager')).toBeTruthy();
    // The token is what the server was asked about, and nothing else is sent.
    expect(mockPreviewInvitation).toHaveBeenCalledWith(TOKEN);
    expect(mockPreviewInvitation.mock.calls[0]).toHaveLength(1);

    await fireEvent.press(view.getByText('Create your account'));

    // The token lives in memory for the length of this journey; it never becomes a
    // route parameter, so a screen cannot be reopened from a stale one.
    expect(getPendingInvite()).toEqual({
      token: TOKEN,
      email: INVITATION.email,
      businessName: INVITATION.businessName,
      role: INVITATION.role,
    });
    expect(mockReplace).toHaveBeenCalledWith('/register');
    expect(mockReplace.mock.calls[0]).toHaveLength(1);
  });

  it('tells a person a dead link needs a new email, and stores nothing', async () => {
    mockSearchParams.mockReturnValue({ token: TOKEN });
    mockPreviewInvitation.mockRejectedValue(
      new ApiError(404, 'INVITATION_INVALID', 'This invitation is no longer valid.')
    );

    const view = await renderWithTheme(<InviteScreen />);

    await waitFor(() =>
      expect(view.getByText(/Ask an administrator to send you a new one/)).toBeTruthy()
    );
    expect(view.queryByText('Create your account')).toBeNull();
    expect(getPendingInvite()).toBeNull();

    await fireEvent.press(view.getByText('Back to sign in'));
    expect(mockReplace).toHaveBeenCalledWith('/login');
  });

  it('does not pretend to know anything when the link carries no code', async () => {
    mockSearchParams.mockReturnValue({});

    const view = await renderWithTheme(<InviteScreen />);

    await waitFor(() => expect(view.getByText(/missing its invitation code/)).toBeTruthy());
    // No lookup was made, so nothing was resolved and nothing is offered.
    expect(mockPreviewInvitation).not.toHaveBeenCalled();
    expect(view.queryByText('Create your account')).toBeNull();
  });

  it('explains that an invitation creates an account when this device has one', async () => {
    mockSearchParams.mockReturnValue({ token: TOKEN });
    mockUseSession.mockReturnValue({
      status: 'signedIn',
      user: { id: 'u1', name: 'Ada', role: 'OWNER' },
      token: 'session-token',
      signOut: jest.fn(async () => {}),
    });

    const view = await renderWithTheme(<InviteScreen />);

    expect(view.getByText('Already signed in')).toBeTruthy();
    expect(view.getByText(/You are signed in as Ada/)).toBeTruthy();
    // Nothing was even looked up: a signed-in device has no registration to offer.
    expect(mockPreviewInvitation).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 2 — the register form, in its invited shape
// ---------------------------------------------------------------------------

describe('the register form when an invitation is being accepted', () => {
  it('★ asks for no business name, locks the invited email, and sends no business', async () => {
    // Typed with the payload it receives, so the call tuple can be read back below.
    const signUp = jest.fn(async (_payload: Record<string, unknown>) => null);
    signedOut({ signUp });
    setPendingInvite({
      token: TOKEN,
      email: INVITATION.email,
      businessName: INVITATION.businessName,
      role: INVITATION.role,
    });

    const view = await renderWithTheme(<RegisterScreen />);

    // The business and role come from the invitation, so the form names them instead of
    // asking. The field's absence (not just its optionality) is the assertion.
    expect(view.getByText('Join Acme Retail')).toBeTruthy();
    expect(view.queryByPlaceholderText('Acme Retail')).toBeNull();
    expect(view.getByText('Manager')).toBeTruthy();

    // The invited address is shown and is the identity that will be verified.
    const email = view.getByDisplayValue(INVITATION.email);
    expect(email.props.editable).toBe(false);
    expect(view.getByText('This invitation was sent to this address.')).toBeTruthy();

    await fireEvent.changeText(view.getByPlaceholderText('Jane Doe'), 'Grace Hopper');
    await fireEvent.changeText(view.getByPlaceholderText('At least 8 characters'), 'correct-horse-9');
    await fireEvent.changeText(view.getByPlaceholderText('Repeat your password'), 'correct-horse-9');
    await fireEvent.press(view.getByText('Create Account'));

    await waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));
    // `businessName: undefined` is the whole point: the server creates no business.
    expect(signUp.mock.calls[0][0]).toEqual({
      businessName: undefined,
      name: 'Grace Hopper',
      email: INVITATION.email,
      password: 'correct-horse-9',
    });
  });

  it('still requires a business name for an ordinary sign-up', async () => {
    const signUp = jest.fn(async () => null);
    signedOut({ signUp });

    const view = await renderWithTheme(<RegisterScreen />);

    expect(view.getByText('Create your workspace')).toBeTruthy();
    await fireEvent.press(view.getByText('Create Account'));

    await waitFor(() => expect(view.getByText('Business name is required')).toBeTruthy());
    expect(signUp).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3 — the management screen
// ---------------------------------------------------------------------------

describe('the invitations manager', () => {
  it('★ lists the business’s pending invitations and sends a new one', async () => {
    manager();
    mockList.mockResolvedValue({
      items: [{ id: 'inv1', email: 'new@acme.test', role: 'STAFF', expiresAt: INVITATION.expiresAt }],
      total: 1,
    });

    const view = await renderWithTheme(<InvitationsScreen />);

    await waitFor(() => expect(view.getByText('new@acme.test')).toBeTruthy());
    expect(mockList).toHaveBeenCalledWith('session-token');

    await fireEvent.changeText(view.getByPlaceholderText('colleague@company.com'), 'hire@acme.test');
    await fireEvent.press(view.getByText('Choose a role…'));
    // The pending row already carries a Staff badge, so "Staff" matches twice: the sheet's
    // option comes first in the tree (the form is above the list).
    await fireEvent.press(view.getAllByText('Staff')[0]);
    await fireEvent.press(view.getByText('Send invitation'));

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    expect(mockCreate).toHaveBeenCalledWith('session-token', { email: 'hire@acme.test', role: 'STAFF' });
    await waitFor(() => expect(view.getByText(/Invitation sent to hire@acme.test/)).toBeTruthy());
  });

  it('refuses an empty form before a request is made', async () => {
    manager();
    const view = await renderWithTheme(<InvitationsScreen />);
    await waitFor(() => expect(view.getByText(/No one is waiting to join/)).toBeTruthy());

    await fireEvent.press(view.getByText('Send invitation'));

    expect(mockCreate).not.toHaveBeenCalled();
    expect(view.getByText('Email is required')).toBeTruthy();
    expect(view.getByText('Choose a role')).toBeTruthy();
  });

  it('shows the server’s own sentence when the address already has an account', async () => {
    manager();
    mockCreate.mockRejectedValue(
      new ApiError(409, 'INVITATION_EMAIL_IN_USE', 'This email already belongs to an Inventory AI account')
    );

    const view = await renderWithTheme(<InvitationsScreen />);
    await waitFor(() => expect(view.getByText(/No one is waiting to join/)).toBeTruthy());

    await fireEvent.changeText(view.getByPlaceholderText('colleague@company.com'), 'member@acme.test');
    await fireEvent.press(view.getByText('Choose a role…'));
    await fireEvent.press(view.getByText('Manager'));
    await fireEvent.press(view.getByText('Send invitation'));

    await waitFor(() =>
      expect(view.getByText('This email already belongs to an Inventory AI account')).toBeTruthy()
    );
  });

  it('asks before revoking, then withdraws the invitation', async () => {
    manager();
    mockList.mockResolvedValue({
      items: [{ id: 'inv9', email: 'gone@acme.test', role: 'STAFF', expiresAt: INVITATION.expiresAt }],
      total: 1,
    });

    const view = await renderWithTheme(<InvitationsScreen />);
    await waitFor(() => expect(view.getByText('gone@acme.test')).toBeTruthy());

    await fireEvent.press(view.getByText('Revoke'));

    await waitFor(() => expect(mockRevoke).toHaveBeenCalledWith('session-token', 'inv9'));
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(view.getByText(/Invitation for gone@acme.test revoked/)).toBeTruthy());
  });

  it('refuses a declined confirmation without calling the server', async () => {
    manager();
    mockConfirm.mockResolvedValue(false);
    mockList.mockResolvedValue({
      items: [{ id: 'inv9', email: 'gone@acme.test', role: 'STAFF', expiresAt: INVITATION.expiresAt }],
      total: 1,
    });

    const view = await renderWithTheme(<InvitationsScreen />);
    await waitFor(() => expect(view.getByText('gone@acme.test')).toBeTruthy());

    await fireEvent.press(view.getByText('Revoke'));

    await waitFor(() => expect(mockConfirm).toHaveBeenCalledTimes(1));
    expect(mockRevoke).not.toHaveBeenCalled();
  });

  it('denies the screen to a role that cannot manage users', async () => {
    mockUseSession.mockReturnValue({
      status: 'signedIn',
      user: { id: 'u2', name: 'Sam', role: 'STAFF' },
      token: 'session-token',
      signOut: jest.fn(async () => {}),
    });

    const view = await renderWithTheme(<InvitationsScreen />);

    expect(view.getByText(/Only the business owner and admins can invite people/)).toBeTruthy();
    // Nothing was asked of the server for a role that cannot use the answer.
    expect(mockList).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 4 — the token reaches the request that can use it
// ---------------------------------------------------------------------------

const mockCurrentFirebaseIdToken = jest.fn();
const mockEnsureFirebaseAccount = jest.fn();

jest.mock('../lib/firebase-auth', () => ({
  FirebaseAuthError: class FirebaseAuthError extends Error {
    code: string | null;

    constructor(code: string | null, message: string) {
      super(message);
      this.name = 'FirebaseAuthError';
      this.code = code;
    }
  },
  currentFirebaseIdToken: (...args: unknown[]) => mockCurrentFirebaseIdToken(...args),
  ensureFirebaseAccount: (...args: unknown[]) => mockEnsureFirebaseAccount(...args),
  signInWithEmail: jest.fn(),
  signInWithGoogle: jest.fn(),
  signOutOfFirebase: jest.fn(),
}));

jest.mock('../lib/firebase-native', () => ({
  nativeForceIdToken: jest.fn(async () => 'forced.firebase.id.token'),
  nativeReloadUser: jest.fn(async () => true),
  nativeHasCurrentUser: jest.fn(async () => true),
  nativeUpdatePassword: jest.fn(),
}));

jest.mock('../lib/config', () => ({
  isFirebaseConfigured: () => true,
}));

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async () => {}),
  getItemAsync: jest.fn(async () => null),
  deleteItemAsync: jest.fn(async () => {}),
}));

const mockConfirmEmailVerification = jest.fn();
const mockRequestEmailVerification = jest.fn();
const mockFirebaseRegister = jest.fn();
const mockFirebaseExchange = jest.fn();

jest.mock('../lib/api', () => ({
  previewInvitation: (...args: unknown[]) => mockPreviewInvitation(...args),
  invitationsApi: {
    list: (...args: unknown[]) => mockList(...args),
    create: (...args: unknown[]) => mockCreate(...args),
    revoke: (...args: unknown[]) => mockRevoke(...args),
  },
  // Driven by the real AuthProvider below; every other endpoint is a no-op.
  ensureFirebaseAccount: jest.fn(),
  requestEmailVerification: (...args: unknown[]) => mockRequestEmailVerification(...args),
  confirmEmailVerification: (...args: unknown[]) => mockConfirmEmailVerification(...args),
  firebaseRegister: (...args: unknown[]) => mockFirebaseRegister(...args),
  firebaseExchange: (...args: unknown[]) => mockFirebaseExchange(...args),
  register: jest.fn(),
  login: jest.fn(),
  logout: jest.fn(),
  me: jest.fn(),
  renewSession: jest.fn(),
}));

const USER = { id: 'u-new', name: 'Grace', email: INVITATION.email, role: 'MANAGER' as const };
const SESSION = { token: 'app.jwt', tokenType: 'Bearer', expiresIn: '1d', user: USER };

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

/**
 * The REAL hook, read past the screen-level stub. `useSession` is mocked for the screens
 * above, and the provider's own value is what this group is about — so the assertion runs
 * against the module itself rather than against a stand-in.
 */
const realUseSession = jest.requireActual<typeof import('../lib/auth')>('../lib/auth').useSession;

describe('the invitation token in the real auth flow', () => {
  it('★ is sent with the registration that accepts it, and forgotten once signed in', async () => {
    mockCurrentFirebaseIdToken.mockResolvedValue('firebase.id.token');
    mockEnsureFirebaseAccount.mockResolvedValue({ idToken: 'firebase.id.token' });
    mockRequestEmailVerification.mockResolvedValue({});
    mockConfirmEmailVerification.mockResolvedValue({});
    mockFirebaseRegister.mockResolvedValue({ user: USER, business: { id: 'b1', name: 'Acme Retail' } });
    mockFirebaseExchange.mockResolvedValue(SESSION);
    setPendingInvite({
      token: TOKEN,
      email: INVITATION.email,
      businessName: INVITATION.businessName,
      role: INVITATION.role,
    });

    const view = await renderHook(() => realUseSession(), { wrapper });
    await waitFor(() => expect(view.result.current.status).toBe('signedOut'));

    // Sign-up with an invitation asks for no business name at all.
    await act(async () => {
      await view.result.current.signUp({
        name: 'Grace',
        email: INVITATION.email,
        password: 'correct-horse-9',
      });
    });

    // Verification is the step that completes registration, and the invitation travels
    // with it — the server reads the tenant and role from the row this token resolves.
    await act(async () => {
      await view.result.current.confirmVerificationCode('123456');
    });

    await waitFor(() => expect(mockFirebaseRegister).toHaveBeenCalledTimes(1));
    expect(mockFirebaseRegister.mock.calls[0][0]).toEqual({
      idToken: 'forced.firebase.id.token',
      businessName: undefined,
      name: 'Grace',
      invitationToken: TOKEN,
    });
    // No business id, no role and no uid: nothing in this payload could steer the server.
    expect(Object.keys(mockFirebaseRegister.mock.calls[0][0]).sort()).toEqual([
      'businessName',
      'idToken',
      'invitationToken',
      'name',
    ]);

    await waitFor(() => expect(view.result.current.status).toBe('signedIn'));
    expect(view.result.current.token).toBe('app.jwt');
    // The invitation has done its job, so the device no longer holds it.
    expect(getPendingInvite()).toBeNull();
  });
});
