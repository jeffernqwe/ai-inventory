import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { aiApi, auditApi, dashboardApi, purchaseOrdersApi, usersApi } from '../lib/api';
import { useSession } from '../lib/auth';
import { ROLES } from '../lib/permissions';
import { ThemeProvider } from '../lib/theme-context';

import AiHubScreen from '../app/(app)/ai/index';
import AuditScreen from '../app/(app)/audit';
import DashboardScreen from '../app/(app)/dashboard';
import PurchaseOrdersScreen from '../app/(app)/purchase-orders/index';
import ReceiveStockScreen from '../app/(app)/purchase-orders/[id]/receive';
import EditPurchaseOrderScreen from '../app/(app)/purchase-orders/[id]/edit';
import EditUserScreen from '../app/(app)/users/[id]';
import UsersScreen from '../app/(app)/users/index';

/**
 * MOD-07 — the Rules-of-Hooks restructure must not move the RBAC boundary.
 *
 * Each of these four screens used to run data hooks *after* an authorization
 * early return, which is a Rules-of-Hooks violation. They were restructured into
 * a guard parent (the permission check, and nothing else) plus a child that owns
 * every hook. The property that restructure has to preserve is the one pinned
 * here: **a denied role renders the denied UI and issues no request at all.**
 * Hoisting the hooks instead of splitting would have satisfied the linter while
 * quietly turning every denied visit into an API call, so each screen is
 * asserted on both sides — denied mounts no child (no fetch), allowed does.
 *
 * Only the module boundary is mocked. Roles and permissions are the real
 * `lib/permissions`, so these cases cannot drift from the RBAC mirror.
 */

jest.mock('../lib/auth', () => ({
  useSession: jest.fn(),
  isSessionError: () => false,
}));

// The navigation object and the route params must keep a stable identity across
// renders, exactly as the real `useNavigation()`/`useLocalSearchParams()` do.
// Returning a fresh object literal per call would invalidate the dashboard's
// `useEffect([load, navigation])` on every render and spin it forever.
jest.mock('expo-router', () => {
  const navigation = { addListener: () => () => {} };
  const params = { id: 'po-1' };
  return {
    // The denied render still declares its header title, so `Stack.Screen`
    // must exist in the mock.
    Stack: { Screen: () => null },
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
    useNavigation: () => navigation,
    useLocalSearchParams: () => params,
    useFocusEffect: () => {},
  };
});

jest.mock('../lib/api', () => ({
  aiApi: { conversations: jest.fn(async () => ({ items: [], total: 0 })) },
  dashboardApi: { summary: jest.fn(async () => ({})) },
  purchaseOrdersApi: {
    list: jest.fn(async () => ({ items: [], total: 0 })),
    get: jest.fn(async () => ({ id: 'po-1', status: 'OPEN', items: [] })),
  },
  productsApi: { reorder: jest.fn(async () => ({ items: [] })) },
  usersApi: {
    list: jest.fn(async () => ({ items: [], total: 0 })),
    get: jest.fn(async () => ({ id: 'po-1', name: 'Target User', role: 'STAFF', status: 'ACTIVE' })),
  },
  auditApi: { list: jest.fn(async () => ({ items: [], total: 0 })) },
}));

const mockedUseSession = useSession as jest.Mock;
const list = purchaseOrdersApi.list as jest.Mock;
const get = purchaseOrdersApi.get as jest.Mock;
const summary = dashboardApi.summary as jest.Mock;
const conversations = aiApi.conversations as jest.Mock;
const userList = usersApi.list as jest.Mock;
const auditList = auditApi.list as jest.Mock;
const userGet = usersApi.get as jest.Mock;

const DENIED = 'Not allowed';

const signInAs = (role: string | null): void => {
  mockedUseSession.mockReturnValue({
    user: role ? { id: 'u1', name: 'Test User', role } : null,
    token: role ? 'token' : null,
    signOut: jest.fn(),
  });
};

const mount = (node: ReactNode) => render(<ThemeProvider>{node}</ThemeProvider>);

beforeEach(() => {
  jest.clearAllMocks();
  // Mirrors the real client: a refused call resolves to an empty page rather
  // than rejecting, so a mounted list settles into its empty state.
  list.mockResolvedValue({ items: [], total: 0 });
  get.mockResolvedValue({ id: 'po-1', status: 'OPEN', items: [] });
  summary.mockResolvedValue({});
  conversations.mockResolvedValue({ items: [], total: 0 });
  userList.mockResolvedValue({ items: [], total: 0 });
  auditList.mockResolvedValue({ items: [], total: 0 });
  userGet.mockResolvedValue({ id: 'po-1', name: 'Target User', role: 'STAFF', status: 'ACTIVE' });
});

describe('dashboard (dashboard.view — STAFF is the only denied role)', () => {
  it('renders the denied UI and fetches nothing for STAFF', async () => {
    signInAs(ROLES.STAFF);
    const { queryByText } = await mount(<DashboardScreen />);

    expect(queryByText(DENIED)).toBeTruthy();
    expect(queryByText('Only managers and above can view the dashboard.')).toBeTruthy();
    expect(summary).not.toHaveBeenCalled();
  });

  it('mounts the dashboard and loads the summary for MANAGER', async () => {
    signInAs(ROLES.MANAGER);
    const { queryByText } = await mount(<DashboardScreen />);

    expect(queryByText(DENIED)).toBeNull();
    expect(summary).toHaveBeenCalledTimes(1);
  });
});

describe('purchase orders list (purchase_orders.view — denied only without a role)', () => {
  it('renders the denied UI and fetches nothing when signed out', async () => {
    signInAs(null);
    const { queryByText } = await mount(<PurchaseOrdersScreen />);

    expect(queryByText(DENIED)).toBeTruthy();
    expect(queryByText('Your role does not allow viewing purchase orders.')).toBeTruthy();
    expect(list).not.toHaveBeenCalled();
  });

  it('mounts the list and pages through the API for STAFF', async () => {
    signInAs(ROLES.STAFF);
    const { queryByText } = await mount(<PurchaseOrdersScreen />);

    expect(queryByText(DENIED)).toBeNull();
    expect(list).toHaveBeenCalled();
  });
});

describe('receive stock (purchase_orders.receive — denied only without a role)', () => {
  it('renders the denied UI and fetches nothing when signed out', async () => {
    signInAs(null);
    const { queryByText } = await mount(<ReceiveStockScreen />);

    expect(queryByText(DENIED)).toBeTruthy();
    expect(queryByText('Your role does not allow receiving purchase orders.')).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });

  it('mounts the form and loads the order for STAFF', async () => {
    signInAs(ROLES.STAFF);
    const { queryByText } = await mount(<ReceiveStockScreen />);

    expect(queryByText(DENIED)).toBeNull();
    expect(get).toHaveBeenCalled();
  });
});

/**
 * The two screens MOD-07 did not reach. They checked permission AFTER their
 * hooks, so a denied visit still mounted the list hook and issued `GET
 * /api/audit` / `GET /api/users` — refused by the server, visible in its logs,
 * and pointless. Found while walking the four roles on 2026-10-17; the fix is
 * the same guard-parent/child split as the four screens above, and these cases
 * are what would have caught it.
 */
describe('users list (users.manage — MANAGER and STAFF are denied)', () => {
  it('renders the denied UI and fetches nothing for MANAGER', async () => {
    signInAs(ROLES.MANAGER);
    const { queryByText } = await mount(<UsersScreen />);

    expect(queryByText(DENIED)).toBeTruthy();
    expect(queryByText('Only the business owner and admins can manage users.')).toBeTruthy();
    expect(userList).not.toHaveBeenCalled();
  });

  it('renders the denied UI and fetches nothing for STAFF', async () => {
    signInAs(ROLES.STAFF);
    const { queryByText } = await mount(<UsersScreen />);

    expect(queryByText(DENIED)).toBeTruthy();
    expect(userList).not.toHaveBeenCalled();
  });

  it('mounts the list and loads it for OWNER', async () => {
    signInAs(ROLES.OWNER);
    const { queryByText } = await mount(<UsersScreen />);

    expect(queryByText(DENIED)).toBeNull();
    expect(userList).toHaveBeenCalled();
  });
});

describe('audit trail (audit.view — MANAGER and STAFF are denied)', () => {
  it('renders the denied UI and fetches nothing for STAFF', async () => {
    signInAs(ROLES.STAFF);
    const { queryByText } = await mount(<AuditScreen />);

    expect(queryByText(DENIED)).toBeTruthy();
    expect(queryByText('Only the business owner and admins can view the audit log.')).toBeTruthy();
    expect(auditList).not.toHaveBeenCalled();
  });

  it('mounts the trail and loads it for ADMIN', async () => {
    signInAs(ROLES.ADMIN);
    const { queryByText } = await mount(<AuditScreen />);

    expect(queryByText(DENIED)).toBeNull();
    expect(auditList).toHaveBeenCalled();
  });
});

describe('edit user (users.manage — the detail screen, not just the list)', () => {
  it('renders the denied UI and fetches nothing for STAFF', async () => {
    signInAs(ROLES.STAFF);
    const { queryByText } = await mount(<EditUserScreen />);

    expect(queryByText(DENIED)).toBeTruthy();
    expect(userGet).not.toHaveBeenCalled();
  });

  it('loads the target for OWNER', async () => {
    signInAs(ROLES.OWNER);
    const { queryByText } = await mount(<EditUserScreen />);

    expect(queryByText(DENIED)).toBeNull();
    expect(userGet).toHaveBeenCalled();
  });
});

describe('edit purchase order (purchase_orders.manage)', () => {
  it('renders the denied UI and fetches nothing for STAFF', async () => {
    signInAs(ROLES.STAFF);
    const { queryByText } = await mount(<EditPurchaseOrderScreen />);

    expect(queryByText(DENIED)).toBeTruthy();
    expect(queryByText('Only managers and above can manage purchase orders.')).toBeTruthy();
    expect(get).not.toHaveBeenCalled();
  });

  it('loads the order for MANAGER', async () => {
    signInAs(ROLES.MANAGER);
    const { queryByText } = await mount(<EditPurchaseOrderScreen />);

    expect(queryByText(DENIED)).toBeNull();
    expect(get).toHaveBeenCalled();
  });
});

describe('AI hub (ai.use — denied only without a role)', () => {
  it('renders the denied UI and fetches nothing when signed out', async () => {
    signInAs(null);
    const { queryByText } = await mount(<AiHubScreen />);

    expect(queryByText(DENIED)).toBeTruthy();
    expect(queryByText('Your role does not include access to the AI assistant.')).toBeTruthy();
    expect(conversations).not.toHaveBeenCalled();
  });

  it('mounts the hub and lists conversations for STAFF', async () => {
    signInAs(ROLES.STAFF);
    const { queryByText } = await mount(<AiHubScreen />);

    expect(queryByText(DENIED)).toBeNull();
    expect(conversations).toHaveBeenCalled();
  });
});
