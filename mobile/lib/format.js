/**
 * Small pure formatting helpers (dates, numbers, money). No i18n dependency —
 * manual, locale-independent output keeps behaviour identical on every device.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

/** Integer part with thousands separators; decimal part preserved when present. */
export function formatNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  const [int, dec] = String(num).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return dec !== undefined ? `${grouped}.${dec}` : grouped;
}

/** Number with up to 2 fixed decimals, thousands grouped, no currency symbol. */
export function formatMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  const [int, decRaw] = abs.toFixed(2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${grouped}.${decRaw}`;
}

function parseDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateToParts(d) {
  return {
    year: d.getFullYear(),
    month: MONTHS[d.getMonth()],
    day: d.getDate(),
    hours: pad(d.getHours()),
    minutes: pad(d.getMinutes()),
  };
}

/** e.g. "Sep 8, 2026". Invalid/absent input -> ''. */
export function formatDate(value) {
  const d = parseDate(value);
  if (!d) return '';
  const p = dateToParts(d);
  return `${p.month} ${p.day}, ${p.year}`;
}

/** e.g. "Sep 8, 2026 · 14:05". Invalid/absent input -> ''. */
export function formatDateTime(value) {
  const d = parseDate(value);
  if (!d) return '';
  const p = dateToParts(d);
  return `${p.month} ${p.day}, ${p.year} · ${p.hours}:${p.minutes}`;
}

/** Compact time-of-day, e.g. "14:05". Invalid/absent -> ''. */
export function formatTime(value) {
  const d = parseDate(value);
  if (!d) return '';
  const p = dateToParts(d);
  return `${p.hours}:${p.minutes}`;
}

/** Days since a date, used for relative labels like "2d ago" / "today". */
export function daysAgo(value) {
  const d = parseDate(value);
  if (!d) return '';
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((startToday - startThat) / 86400000);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'yesterday';
  return `${diff}d ago`;
}

export default { formatNumber, formatMoney, formatDate, formatDateTime, formatTime, daysAgo };
