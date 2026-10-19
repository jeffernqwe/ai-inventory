import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { auditApi } from '../lib/api';
import { useSession } from '../lib/auth';
import { ThemeProvider } from '../lib/theme-context';

import AuditScreen from '../app/(app)/audit';

/**
 * THE AUDIT SCREEN, THROUGH THE SCREEN.
 *
 * `audit-label-parity.test.mjs` proves the table covers every server enum and
 * `audit-labels.test.ts` proves the lookups fall back honestly — but neither can
 * see the screen, and the defect found on the device (2026-10-17) lived exactly
 * there: the screen had its own table, so a row arrived labelled
 * `SESSION_CREATED` and nothing in the repository could notice. These cases mount
 * the real screen with a mocked API and assert what a person would read.
 *
 * Only the module boundaries are mocked (`expo-router`, `lib/auth`, `lib/api`);
 * the labels, the list hook and the components are the real ones.
 */
jest.mock('../lib/auth', () => ({ useSession: jest.fn(), isSessionError: () => false }));

const mockFocusCallbacks: (() => void | (() => void))[] = [];

jest.mock('expo-router', () => {
  const Stack = { Screen: () => null };
  return {
    Stack,
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
    useLocalSearchParams: () => ({}),
    useNavigation: () => ({ addListener: () => () => {} }),
    useFocusEffect: (cb: () => void | (() => void)) => {
      mockFocusCallbacks.push(cb);
    },
  };
});

jest.mock('../lib/api', () => ({
  auditApi: { list: jest.fn() },
}));

const mockedUseSession = useSession as jest.Mock;
const list = auditApi.list as jest.Mock;

const ROW = {
  id: 'audit-1',
  action: 'SESSION_CREATED',
  entityType: 'SESSION',
  entityId: 'sess-1',
  actor: { id: 'u1', name: 'Dana Owner' },
  createdAt: '2026-10-17T07:00:00.000Z',
  metadata: null,
};

// `render` is async in @testing-library/react-native v14; awaiting it is what
// makes the query helpers (`findByText`, `getByText`) available.
const mount = async () =>
  await render(
    <ThemeProvider>
      <AuditScreen />
    </ThemeProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockFocusCallbacks.length = 0;
  mockedUseSession.mockReturnValue({
    user: { id: 'u1', name: 'Dana Owner', role: 'OWNER' },
    token: 'token',
    signOut: jest.fn(),
  });
  list.mockResolvedValue({ items: [ROW], page: 1, limit: 25, total: 1, totalPages: 1 });
});

describe('the Audit screen renders labels, not enums', () => {
  it('shows a session event as "Signed in · Session"', async () => {
    const screen = await mount();

    // The exact two things the phone showed raw.
    expect(await screen.findByText('Signed in')).toBeTruthy();
    expect(screen.getByText('Session')).toBeTruthy();
    expect(screen.queryByText('SESSION_CREATED')).toBeNull();
    expect(screen.queryByText('SESSION')).toBeNull();
  });

  it('asks for the entity type the Sessions chip names', async () => {
    const screen = await mount();
    await screen.findByText('Signed in');

    fireEvent.press(screen.getByText('Sessions'));

    await waitFor(() => {
      const params = list.mock.calls.map((call) => call[1]);
      expect(params.some((p) => p?.entityType === 'SESSION')).toBe(true);
    });
  });

  it('denies the trail to a role without audit.view, and fetches nothing', async () => {
    mockedUseSession.mockReturnValue({
      user: { id: 'u2', name: 'Sam Staff', role: 'STAFF' },
      token: 'token',
      signOut: jest.fn(),
    });

    const screen = await mount();

    expect(await screen.findByText(/Only the business owner and admins/i)).toBeTruthy();
    expect(list).not.toHaveBeenCalled();
  });
});
