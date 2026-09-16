import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import Badge, { PoStatusBadge, TypeBadge } from '../components/Badge';
import { ThemeProvider } from '../lib/theme-context';

/**
 * One small presentational component test to prove the renderer works. `Badge`
 * is a pure function of its props plus the theme, so it needs no mock beyond
 * the theme provider every screen already renders inside.
 *
 * `render` is awaited because @testing-library/react-native v14 made it async.
 */
const withTheme = (node: ReactNode) => render(<ThemeProvider>{node}</ThemeProvider>);

describe('Badge', () => {
  it('renders the text it is given', async () => {
    const { getByText } = await withTheme(<Badge text="Low stock" tone="low" />);
    expect(getByText('Low stock')).toBeTruthy();
  });
});

describe('status badges render state as text, not colour alone', () => {
  it('maps a purchase-order status to its label', async () => {
    const { getByText } = await withTheme(<PoStatusBadge status="OPEN" />);
    expect(getByText('Open')).toBeTruthy();
  });

  it('falls back to a neutral label for an unrecognised movement type', async () => {
    const { getByText } = await withTheme(<TypeBadge type="SOMETHING_NEW" />);
    expect(getByText('SOMETHING_NEW')).toBeTruthy();
  });
});
