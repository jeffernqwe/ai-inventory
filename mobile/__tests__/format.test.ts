import { formatNumber, formatMoney, formatDate, formatDateTime, formatTime } from '../lib/format';

/**
 * `format.ts` is manual and locale-independent by design, so these assertions
 * hold on every device. Dates are built from local calendar parts (never from
 * an ISO string) so the expected output does not depend on the runner's
 * timezone.
 */
describe('formatNumber', () => {
  it('groups the integer part with thousands separators and keeps the decimals', () => {
    expect(formatNumber(1234567.89)).toBe('1,234,567.89');
  });

  it('returns an em dash for a value that is not a finite number', () => {
    expect(formatNumber('abc')).toBe('—');
  });
});

describe('formatMoney', () => {
  it('fixes two decimals and keeps the sign outside the grouped digits', () => {
    expect(formatMoney(-1234.5)).toBe('-1,234.50');
  });
});

describe('date and time formatting', () => {
  const when = new Date(2026, 8, 8, 14, 5); // Sep 8, 2026 14:05 local

  it('formats a date as "Sep 8, 2026"', () => {
    expect(formatDate(when)).toBe('Sep 8, 2026');
  });

  it('formats a date and time with zero-padded minutes', () => {
    expect(formatDateTime(when)).toBe('Sep 8, 2026 · 14:05');
  });

  it('formats a compact time of day', () => {
    expect(formatTime(when)).toBe('14:05');
  });

  it('returns an empty string for an unparseable date', () => {
    expect(formatDate('not-a-date')).toBe('');
  });
});
