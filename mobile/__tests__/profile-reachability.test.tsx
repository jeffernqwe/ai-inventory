import { fireEvent, render } from '@testing-library/react-native';
import { readFileSync } from 'fs';
import path from 'path';

import ProfileIcon from '../components/ProfileIcon';
import { ThemeProvider } from '../lib/theme-context';

/**
 * PROFILE REACHABILITY — STAFF has no Dashboard, so the Inventory header is the
 * only place a Staff member can reach their own account.
 *
 * WHY THIS EXISTS. Walking the four roles on the device (2026-10-17) showed that
 * `defaultHomePath` sends STAFF to Inventory (correct — they do not hold
 * `dashboard.view`), and the Profile screen is reached from a tile on the
 * Dashboard. So the only header affordance on STAFF's landing screen was sign
 * out, and with it they could not change their password, review/end their active
 * sessions or edit their name. Nothing failed: every screen involved is
 * permission-correct, and the gap was a missing link between two screens that
 * both worked.
 *
 * Two assertions, because the gap had two halves: the icon must navigate to the
 * Profile route (behaviour), and the Inventory header must actually render it
 * (wiring). The source assertion is the only way to reach the second half without
 * rendering the whole native stack.
 */
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  router: { push: (href: string) => mockPush(href) },
}));

describe('ProfileIcon', () => {
  beforeEach(() => mockPush.mockClear());

  it('is an accessible button that opens the Profile screen', async () => {
    const { getByLabelText } = await render(
      <ThemeProvider>
        <ProfileIcon />
      </ThemeProvider>
    );

    const button = getByLabelText('Profile');
    expect(button.props.accessibilityRole).toBe('button');

    fireEvent.press(button);
    expect(mockPush).toHaveBeenCalledWith('/profile');
  });
});

describe('the Inventory header offers Profile, not only Sign out', () => {
  const layout = readFileSync(path.join(__dirname, '..', 'app', '(app)', '_layout.tsx'), 'utf8');

  it('renders ProfileIcon beside SignOutIcon on the inventory screen', () => {
    const start = layout.indexOf('name="inventory"');
    expect(start).toBeGreaterThan(-1);
    // The screen block runs to the next screen declaration, not to the first
    // `/>` — the header's own JSX closes tags long before the element ends.
    const block = layout.slice(start, layout.indexOf('<Stack.Screen', start));

    expect(block).toContain('<ProfileIcon');
    expect(block).toContain('<SignOutIcon');
  });
});
