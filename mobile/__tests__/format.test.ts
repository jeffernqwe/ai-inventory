import { formatNumber, formatMoney, formatDate, formatDateTime, formatTime, formatClock12 } from '../lib/format';

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

  // AI-17 — the chat footer's clock time. 12-hour with a suffix, because a bare "14:05"
  // in the corner of a reply was read as a metric rather than a time.
  it('formats an afternoon message time as "2:05 PM"', () => {
    expect(formatClock12(when)).toBe('2:05 PM');
  });

  it('keeps the minutes zero-padded and the hour unpadded', () => {
    expect(formatClock12(new Date(2026, 8, 8, 9, 7))).toBe('9:07 AM');
  });

  it('renders midnight as 12 AM and noon as 12 PM, never 0', () => {
    expect(formatClock12(new Date(2026, 8, 8, 0, 30))).toBe('12:30 AM');
    expect(formatClock12(new Date(2026, 8, 8, 12, 0))).toBe('12:00 PM');
  });

  it('returns an empty string for an unparseable clock time', () => {
    expect(formatClock12('not-a-date')).toBe('');
  });

  it('returns an empty string for an unparseable date', () => {
    expect(formatDate('not-a-date')).toBe('');
  });
});
