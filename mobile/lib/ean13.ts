/**
 * EAN-13 rendering helpers for the mobile app (Phase 12D).
 *
 * The backend issues internal barcodes as EAN-13 values in the GS1
 * "restricted distribution" prefix-2 range and stores them on Product.barcode,
 * so the Phase 12A lookup / Phase 12B scanner already treat them like any other
 * code. The mobile app only needs to *render* them: an on-screen <View> preview
 * and an inline-SVG label for printing / sharing as a PDF.
 *
 * Everything here is pure (no React, no platform APIs) so the same module math
 * drives both surfaces. Encoding is the standard EAN-13 scheme — L / G (left)
 * and R (right) seven-module patterns selected by the leading digit's parity,
 * 3 + 42 + 5 + 42 + 3 = 95 modules plus the standard 11-module quiet zones.
 */

const L_PATTERNS: readonly string[] = [
  '0001101', // 0
  '0011001', // 1
  '0010011', // 2
  '0111101', // 3
  '0100011', // 4
  '0110001', // 5
  '0101111', // 6
  '0111011', // 7
  '0110111', // 8
  '0001011', // 9
];

const flip = (pattern: string): string =>
  pattern
    .split('')
    .map((b) => (b === '0' ? '1' : '0'))
    .join('');

/** Right-hand patterns are the logical complement of the L patterns. */
const R_PATTERNS: readonly string[] = L_PATTERNS.map(flip);
/** Left-hand G patterns are the reverse of the R patterns. */
const G_PATTERNS: readonly string[] = R_PATTERNS.map((p) => p.split('').reverse().join(''));

/** Leading digit -> which of the six left digits use L vs G. */
const FIRST_DIGIT_PARITY: Readonly<Record<string, string>> = {
  0: 'LLLLLL',
  1: 'LLGLGG',
  2: 'LLGGLG',
  3: 'LLGGGL',
  4: 'LGLLGG',
  5: 'LGGLLG',
  6: 'LGGGLL',
  7: 'LGLGLG',
  8: 'LGLGGL',
  9: 'LGGLGL',
};

export const QUIET_MODULES = 11; // required white space either side
export const MODULE_COUNT = 95; // 3 + 6*7 + 5 + 6*7 + 3
export const EAN13_PATTERN = /^\d{13}$/;

/** One alternating run of modules: `on` = bar, `len` = width in modules. */
export interface BarRun {
  on: boolean;
  len: number;
}

/** Options for {@link ean13Svg}. */
export interface SvgOptions {
  moduleWidth?: number;
  barHeight?: number;
  digitSize?: number;
}

/** Options for {@link barcodeLabelHtml}. */
export interface LabelOptions {
  productName?: string;
  sku?: string | null;
  width?: number;
  height?: number;
  moduleWidth?: number;
  barHeight?: number;
}

/** True when a stored barcode is exactly thirteen digits (renderable EAN-13). */
export function isEan13(code: unknown): boolean {
  return EAN13_PATTERN.test(String(code ?? ''));
}

/** Standard EAN-13 check digit for a 12-digit payload (3/1 weights). */
export function ean13CheckDigit(payload12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    const weight = (11 - i) % 2 === 0 ? 3 : 1;
    sum += Number(payload12[i]) * weight;
  }
  return (10 - (sum % 10)) % 10;
}

/** 95-module binary string (1 = bar) for a 13-digit EAN-13 value. */
export function ean13Bits(code13: string): string {
  if (!isEan13(code13)) {
    throw new Error(`Cannot render non-EAN-13 barcode: ${code13}`);
  }
  const digits = code13.split('').map(Number);
  const parity = FIRST_DIGIT_PARITY[digits[0]];
  let bits = '101'; // start guard
  for (let i = 0; i < 6; i += 1) {
    bits += (parity[i] === 'L' ? L_PATTERNS : G_PATTERNS)[digits[i + 1]];
  }
  bits += '01010'; // centre guard
  for (let i = 0; i < 6; i += 1) {
    bits += R_PATTERNS[digits[i + 7]];
  }
  bits += '101'; // end guard
  return bits; // MODULE_COUNT chars
}

/** Collapse the module string into alternating run lengths [{on, len}]. */
export function ean13Runs(code13: string): BarRun[] {
  const bits = ean13Bits(code13);
  const runs: BarRun[] = [];
  let current: BarRun = { on: bits[0] === '1', len: 1 };
  for (let i = 1; i < bits.length; i += 1) {
    const on = bits[i] === '1';
    if (on === current.on) {
      current.len += 1;
    } else {
      runs.push(current);
      current = { on, len: 1 };
    }
  }
  runs.push(current);
  return runs;
}

/**
 * Inline SVG rendering of a scannable EAN-13 (bars + quiet zones + digits).
 * Kept dependency-free so iOS `expo-print` can rasterize it (iOS print cannot
 * load local asset files, so the label is fully self-contained HTML).
 */
export function ean13Svg(
  code13: string,
  { moduleWidth = 4, barHeight = 120, digitSize = 22 }: SvgOptions = {},
): string {
  const quietPx = QUIET_MODULES * moduleWidth;
  let x = quietPx;
  let rects = '';
  for (const run of ean13Runs(code13)) {
    const w = run.len * moduleWidth;
    if (run.on) rects += `<rect x="${x}" y="0" width="${w}" height="${barHeight}" fill="#000" />`;
    x += w;
  }
  const width = x; // includes both quiet zones
  const textY = barHeight + Math.round(digitSize * 1.2);
  const height = textY + digitSize;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">` +
    `${rects}` +
    `<text x="${width / 2}" y="${textY}" text-anchor="middle" ` +
    `font-family="'Roboto Mono', 'Courier New', monospace" font-size="${digitSize}" ` +
    `letter-spacing="3" fill="#000">${code13}</text>` +
    `</svg>`
  );
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** The print page produced by {@link barcodeLabelHtml}. */
export interface BarcodeLabel {
  html: string;
  width: number;
  height: number;
}

/**
 * A self-contained label page (product name + SKU + a scannable EAN-13) ready
 * for `expo-print` (printAsync → system print; printToFileAsync → share/save
 * as PDF). Returns { html, width, height } where width/height are the print
 * page dimensions in points (defaults: a small label page, US-Letter-ish).
 */
export function barcodeLabelHtml(
  code13: string,
  { productName = '', sku = null, width = 595, height = 340, moduleWidth = 4, barHeight = 150 }: LabelOptions = {},
): BarcodeLabel {
  const svg = ean13Svg(code13, { moduleWidth, barHeight });
  const name = escapeHtml(productName);
  const skuLine = sku ? `<div style="font-size:16px;color:#111;margin-top:8px;">SKU ${escapeHtml(sku)}</div>` : '';
  const html =
    `<!doctype html><html><head><meta charset="utf-8" /></head>` +
    `<body style="margin:0;padding:0;width:${width}px;height:${height}px;background:#fff;` +
    `display:flex;align-items:center;justify-content:center;box-sizing:border-box;">` +
    `<div style="display:flex;flex-direction:column;align-items:center;text-align:center;">` +
    `<div style="font-family:system-ui,sans-serif;font-size:24px;font-weight:700;color:#000;` +
    `max-width:520px;overflow-wrap:break-word;">${name}</div>` +
    `${skuLine}` +
    `<div style="margin-top:16px;">${svg}</div>` +
    `</div></body></html>`;
  return { html, width, height };
}

export default {
  QUIET_MODULES,
  MODULE_COUNT,
  isEan13,
  ean13CheckDigit,
  ean13Bits,
  ean13Runs,
  ean13Svg,
  barcodeLabelHtml,
};
