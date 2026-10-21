#!/usr/bin/env node
/**
 * Does the label the app prints actually scan?
 *
 * WHY THIS EXISTS. The barcode on a product label is drawn as vector rectangles — an inline <svg> in
 * `mobile/lib/ean13.ts`, rasterised by the device's print pipeline into a PDF. A geometry mistake
 * there (a clipped edge, a wrong module width, a quiet zone counted twice) produces a label that
 * looks like a barcode, prints like a barcode, and cannot be scanned. The JS suites prove the
 * *pattern* is 95 modules and the *rect count* matches the runs; they cannot tell you what those
 * rectangles decode to. That is what this file does, from the bytes themselves.
 *
 * WHAT IT CHECKS. Two artifacts, one decoder:
 *
 *   --html --expect=CODE   the label HTML the app generates RIGHT NOW, decoded.
 *   --pdf=FILE --expect=CODE   a PDF the app actually printed (the recorded device artifact).
 *
 * WHY THE UNIT IS THE NARROWEST BAR, NOT THE TOTAL WIDTH. EAN-13's guards are single modules, so the
 * narrowest bar in any real drawing IS one module; dividing the span by 95 instead derives the unit
 * from an assumption about what the drawing should contain. The two agree on every artifact measured
 * here (both decode this PDF), so this is a design choice rather than a demonstrated fix: measure the
 * unit, then COUNT the modules, and let the 95-module, guard and check-digit rules decide. The
 * must-fail controls below (clipped, thickened, missing guard, stray bar, damaged digit) are what
 * make the decode meaningful in either case.
 *
 * EXIT CODES. 0 = decoded and matched. 1 = decoded something else, or the geometry is unusable.
 * 2 = could not check (missing file, unreadable module) — never reported as a pass.
 *
 * CONTROLS. The self-test runs on EVERY invocation, before the artifact is reported, and includes
 * must-fail cases (a clipped label, a widened bar, a damaged guard). A check that cannot fail is not
 * a check.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import zlib from 'node:zlib';

// ── EAN-13 tables ───────────────────────────────────────────────────────────────────────────────

const L_PATTERNS = [
  '0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011',
];
const flip = (p) => p.split('').map((c) => (c === '0' ? '1' : '0')).join('');
const R_PATTERNS = L_PATTERNS.map(flip);
const G_PATTERNS = R_PATTERNS.map((p) => p.split('').reverse().join(''));
const PARITY = {
  LLLLLL: '0', LLGLGG: '1', LLGGLG: '2', LLGGGL: '3', LGLLGG: '4',
  LGGLLG: '5', LGGGLL: '6', LGLGLG: '7', LGLGGL: '8', LGGLGL: '9',
};

const MODULE_COUNT = 95;

/** The standard EAN-13 check digit for the first twelve digits. */
function checkDigit(first12) {
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(first12[i]) * ((11 - i) % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
}

/**
 * Decode a 95-module string to the 13-digit value, or null when it is not a valid EAN-13.
 * Validity means: the start/centre/end guards, six L/G digits, six R digits, a known parity
 * pattern, and a matching check digit.
 */
export function decodeEan13Bits(bits) {
  if (typeof bits !== 'string' || bits.length !== MODULE_COUNT) return null;
  if (!/^[01]+$/.test(bits)) return null;
  if (bits.slice(0, 3) !== '101' || bits.slice(45, 50) !== '01010' || bits.slice(92) !== '101') return null;

  const left = bits.slice(3, 45);
  const right = bits.slice(50, 92);
  let parity = '';
  let digits = '';

  for (let i = 0; i < 6; i += 1) {
    const chunk = left.slice(i * 7, i * 7 + 7);
    const l = L_PATTERNS.indexOf(chunk);
    const g = G_PATTERNS.indexOf(chunk);
    if (l >= 0) {
      parity += 'L';
      digits += String(l);
    } else if (g >= 0) {
      parity += 'G';
      digits += String(g);
    } else {
      return null;
    }
  }

  const first = PARITY[parity];
  if (first === undefined) return null;

  for (let i = 0; i < 6; i += 1) {
    const chunk = right.slice(i * 7, i * 7 + 7);
    const r = R_PATTERNS.indexOf(chunk);
    if (r < 0) return null;
    digits += String(r);
  }

  const code = first + digits;
  if (Number(code[12]) !== checkDigit(code.slice(0, 12))) return null;
  return code;
}

/**
 * Turn filled bar rectangles into the module string.
 *
 * `rects` are `{ x, width, height }` in one coordinate space, in any order. The bars are the tallest
 * group (text glyph boxes and rules are shorter), and one module is the narrowest bar — see the
 * header for why that matters.
 */
export function bitsFromRects(rects) {
  const bars = rects
    .filter((r) => Number.isFinite(r.x) && Number.isFinite(r.width) && Number.isFinite(r.height))
    .filter((r) => r.height > 0 && r.width > 0 && r.width < r.height);

  if (bars.length < 20) return null;

  // The bar height is the height the most rectangles share — NOT the tallest rectangle on the page.
  // A printed page also carries glyph boxes and rules (the label PDF has one 3300-unit rule), and a
  // decoder that took the maximum would filter every bar away. Rounding to 0.1pt keeps Skia's
  // floating-point noise from splitting one group in two.
  const groups = new Map();
  for (const r of bars) {
    const key = r.height.toFixed(1);
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  const [barHeight, count] = [...groups.entries()].sort((a, b) => b[1] - a[1])[0];
  if (count < 20) return null;
  // 2% of the bar height tolerates anti-aliasing and still excludes a different rule.
  const tall = bars.filter((r) => Math.abs(r.height - Number(barHeight)) <= Number(barHeight) * 0.02);
  if (tall.length < 20) return null;

  tall.sort((a, b) => a.x - b.x);
  const unit = Math.min(...tall.map((r) => r.width));
  if (!(unit > 0)) return null;

  let bits = '';
  let cursor = tall[0].x;
  for (const bar of tall) {
    const gap = Math.round((bar.x - cursor) / unit);
    const width = Math.round(bar.width / unit);
    // A gap or a bar that is not a whole number of modules is a broken drawing, not a barcode.
    if (gap < 0 || width < 1) return null;
    if (Math.abs(bar.x - cursor - gap * unit) > unit * 0.15) return null;
    if (Math.abs(bar.width - width * unit) > unit * 0.15) return null;
    bits += '0'.repeat(gap) + '1'.repeat(width);
    cursor = bar.x + bar.width;
  }

  return { bits, unit, bars: tall.length };
}

/** Decode the label HTML the app generates (inline SVG, one `<rect>` per bar run). */
export function decodeEan13FromHtml(html) {
  const rects = [];
  const re = /<rect\s+x="([\d.]+)"\s+y="([\d.]+)"\s+width="([\d.]+)"\s+height="([\d.]+)"/g;
  for (const m of html.matchAll(re)) {
    rects.push({ x: Number(m[1]), y: Number(m[2]), width: Number(m[3]), height: Number(m[4]) });
  }
  const measured = bitsFromRects(rects);
  if (!measured) return null;
  const code = decodeEan13Bits(measured.bits);
  return code ? { code, ...measured, modules: measured.bits.length } : null;
}

/** Every decoded stream of a PDF, joined for the page that holds the label. */
function pdfContent(buffer) {
  const latin = buffer.toString('latin1');
  const objects = new Map();
  for (const m of latin.matchAll(/(\d+) 0 obj([\s\S]*?)endobj/g)) objects.set(Number(m[1]), m[2]);

  const streamOf = (body) => {
    if (!body) return null;
    const at = body.indexOf('stream');
    if (at < 0) return null;
    let start = at + 'stream'.length;
    if (body[start] === '\r') start += 1;
    if (body[start] === '\n') start += 1;
    const end = body.lastIndexOf('endstream');
    const raw = Buffer.from(body.slice(start, end), 'latin1');
    if (!/FlateDecode/.test(body.slice(0, at))) return raw.toString('latin1');
    try {
      return zlib.inflateSync(raw).toString('latin1');
    } catch {
      return null;
    }
  };

  const page = [...objects.values()].find((b) => /\/Contents\s+\d+ 0 R/.test(b) && /\/MediaBox/.test(b));
  if (!page) return null;
  const ref = Number(page.match(/\/Contents\s+(\d+) 0 R/)[1]);
  const body = objects.get(ref);
  if (!body) return null;
  if (/^\s*\[/.test(body.trim())) {
    return [...body.matchAll(/(\d+) 0 R/g)]
      .map((m) => streamOf(objects.get(Number(m[1]))))
      .filter(Boolean)
      .join('\n');
  }
  return streamOf(body);
}

/** Decode a PDF the app printed: bars are `x y w h re` subpaths in the page content stream. */
export function decodeEan13FromPdf(buffer) {
  const content = pdfContent(buffer);
  if (!content) return null;
  const rects = [];
  for (const m of content.matchAll(/(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+re\b/g)) {
    rects.push({ x: Number(m[1]), y: Number(m[2]), width: Number(m[3]), height: Number(m[4]) });
  }
  const measured = bitsFromRects(rects);
  if (!measured) return null;
  const code = decodeEan13Bits(measured.bits);
  return code ? { code, ...measured, modules: measured.bits.length } : null;
}

// ── Controls ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Synthetic bars, built the way the app builds them: one run per alternating span, starting a quiet
 * zone in. Used by the controls so they exercise the decoder, not a copy of its output.
 */
function syntheticRects(code, { moduleWidth = 4, barHeight = 150, quiet = 11, x0 = 0 } = {}) {
  const bits = syntheticBits(code);
  const rects = [];
  let x = x0 + quiet * moduleWidth;
  let i = 0;
  while (i < bits.length) {
    const on = bits[i] === '1';
    let len = 1;
    while (i + len < bits.length && bits[i + len] === on) len += 1;
    if (on) rects.push({ x, y: 0, width: len * moduleWidth, height: barHeight });
    x += len * moduleWidth;
    i += len;
  }
  return rects;
}

function runSelfTest() {
  const failures = [];
  const ok = (name, condition, detail = '') => {
    if (!condition) failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  };

  const CODE = '2000053337540';
  const rects = syntheticRects(CODE);
  const base = okJson(() => decodeEan13FromRectsForTest(rects));

  ok('a clean label decodes to its own code', base && base.code === CODE, base ? `got ${base.code}` : 'no decode');
  ok('the pattern is exactly 95 modules', base && base.modules === 95, base ? `got ${base.modules}` : 'no decode');
  ok('one module is the narrowest bar', base && base.unit === 4, base ? `got ${base.unit}` : 'no decode');

  const shifted = syntheticRects(CODE, { x0: 137 });
  const shiftedDecoded = okJson(() => decodeEan13FromRectsForTest(shifted));
  ok('a quiet zone does not shift the decode', shiftedDecoded && shiftedDecoded.code === CODE);

  const wide = syntheticRects(CODE, { moduleWidth: 7 });
  const wideDecoded = okJson(() => decodeEan13FromRectsForTest(wide));
  ok('a different module width decodes identically', wideDecoded && wideDecoded.code === CODE);

  // A printed page carries other rectangles too — a page rule, glyph boxes, a background. The
  // tallest rectangle on the page is not the bar height, and taking it as such discarded every bar.
  const withFurniture = [
    ...syntheticRects(CODE),
    { x: 0, y: 0, width: 595, height: 3300 },
    { x: 20, y: 20, width: 40, height: 792 },
    { x: 30, y: 30, width: 12, height: 1056 },
    { x: 40, y: 40, width: 30, height: 618.75 },
  ];
  const furnitureDecoded = okJson(() => decodeEan13FromRectsForTest(withFurniture));
  ok('page furniture taller than the bars does not derail the decode', furnitureDecoded && furnitureDecoded.code === CODE);

  // ── must-fail controls: the states this check exists to catch ──
  const clipped = syntheticRects(CODE);
  clipped.splice(clipped.length - 4, 4);
  ok('a clipped label is refused, not rescaled', okJson(() => decodeEan13FromRectsForTest(clipped)) === null);

  const widened = syntheticRects(CODE).map((r, i) => (i === 3 ? { ...r, width: r.width + 3 } : r));
  ok('a thickened bar is refused', okJson(() => decodeEan13FromRectsForTest(widened)) === null);

  // Losing the first bar shifts every group, so this is refused by the digit tables rather than by
  // the explicit guard test; the control pins the OUTCOME (refusal), which is what matters.
  const noStart = syntheticRects(CODE).slice(1);
  ok('a drawing that lost its first bar is refused', okJson(() => decodeEan13FromRectsForTest(noStart)) === null);

  // The control that pins the unit rule: a span-based decoder rescales this into 95 modules and
  // decodes it; a counted one sees 96 and refuses it.
  const last = syntheticRects(CODE).at(-1);
  const stray = [...syntheticRects(CODE), { ...last, x: last.x + last.width + 8 }];
  ok('a stray bar beyond the end guard is refused', okJson(() => decodeEan13FromRectsForTest(stray)) === null);

  // A damage that still forms a VALID right-hand pattern — so the only thing that can reject it is
  // the check digit. Flipping a bit inside a group would be rejected by the pattern lookup instead
  // and would prove nothing about the checksum.
  const bits = syntheticBits(CODE);
  const lastDigit = Number(CODE[12]);
  const substituted = `${bits.slice(0, 85)}${R_PATTERNS[(lastDigit + 1) % 10]}${bits.slice(92)}`;
  ok('a substituted last digit is caught by the check digit', decodeEan13Bits(substituted) === null);

  ok('a non-EAN length is refused', decodeEan13Bits('1010101') === null);

  return failures;
}

/** Helper for the controls: decode from rectangles only, without a PDF or HTML wrapper. */
function decodeEan13FromRectsForTest(rects) {
  const measured = bitsFromRects(rects);
  if (!measured) return null;
  const code = decodeEan13Bits(measured.bits);
  return code ? { code, ...measured, modules: measured.bits.length } : null;
}

/**
 * The label's geometry against the page it is printed on — the defect class a decode cannot see.
 *
 * A label whose bars are complete decodes perfectly whether or not it has quiet zones, and whether
 * or not it fits its page: the module pattern is all a decoder reads. But EAN-13 needs 11 modules
 * of white space on BOTH sides of the pattern for a scanner to find its guards, and a label wider
 * than its page is the F-1 failure — the print pipeline cuts the edge bars off. Both were real
 * defects here, found by writing these checks: the printed SVG had 11 modules of quiet zone on the
 * left and none on the right (`width` stopped at the last bar), and a caller asking for a wider
 * module got 702pt of label on a 595pt page.
 *
 * Returns a list of problems, empty when the label is sound.
 */
function checkLabelGeometry(barcodeLabelHtml, code, moduleWidth = 4) {
  const problems = [];
  const label = barcodeLabelHtml(code, { moduleWidth });

  const svg = label.html.match(/<svg[^>]*width="([\d.]+)" height="([\d.]+)"/);
  if (!svg) return ['the label HTML carries no <svg> dimensions'];
  const svgWidth = Number(svg[1]);
  const svgHeight = Number(svg[2]);

  const rects = [
    ...label.html.matchAll(/<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/g),
  ].map((m) => ({ x: Number(m[1]), width: Number(m[2]) }));
  if (!rects.length) return ['the label HTML draws no bars'];

  const quiet = 11 * moduleWidth;
  const first = Math.min(...rects.map((r) => r.x));
  const last = Math.max(...rects.map((r) => r.x + r.width));
  const near = (a, b) => Math.abs(a - b) <= 1e-6;

  if (!near(first, quiet)) problems.push(`left quiet zone is ${first}pt, expected ${quiet}pt`);
  if (!near(svgWidth - last, quiet)) {
    problems.push(`right quiet zone is ${svgWidth - last}pt, expected ${quiet}pt`);
  }
  // The page has to hold the label: a page narrower or shorter clips it at the edge.
  if (svgWidth > label.width + 1e-6) {
    problems.push(`a ${svgWidth}pt label on a ${label.width}pt page would be clipped`);
  }
  if (svgHeight > label.height + 1e-6) {
    problems.push(`a ${svgHeight}pt label on a ${label.height}pt page would be clipped`);
  }

  return problems.map((p) => `module ${moduleWidth}pt: ${p}`);
}

/** The 95-module pattern, written here so the controls do not import the code under test. */
function syntheticBits(code) {
  const digits = code.split('').map(Number);
  const parity = PARITY;
  const patternFor = Object.entries(parity).find(([, d]) => d === String(digits[0]));
  if (!patternFor) throw new Error(`bad leading digit in ${code}`);
  const parityString = patternFor[0];
  let bits = '101';
  for (let i = 0; i < 6; i += 1) {
    const table = parityString[i] === 'L' ? L_PATTERNS : G_PATTERNS;
    bits += table[digits[i + 1]];
  }
  bits += '01010';
  for (let i = 0; i < 6; i += 1) bits += R_PATTERNS[digits[i + 7]];
  bits += '101';
  return bits;
}

function okJson(fn) {
  try {
    return fn();
  } catch {
    return null;
  }
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────────────

function fail(message, code = 1) {
  console.error(`✖ ${message}`);
  process.exit(code);
}

async function main(argv) {
  const args = new Map();
  for (const a of argv) {
    const [k, ...rest] = a.replace(/^--/, '').split('=');
    args.set(k, rest.join('=') || true);
  }

  const selfTestFailures = runSelfTest();
  if (selfTestFailures.length) {
    console.error('✖ the decoder\'s own controls failed — refusing to report on an artifact:');
    for (const f of selfTestFailures) console.error(`  - ${f}`);
    process.exit(1);
  }

  const expect = typeof args.get('expect') === 'string' ? args.get('expect') : null;
  const pdfPath = typeof args.get('pdf') === 'string' ? args.get('pdf') : null;
  const useHtml = args.has('html');

  if (!expect) fail('--expect=CODE is required (the barcode the label should carry)');
  if (Boolean(pdfPath) === useHtml) fail('pass exactly one of --html or --pdf=FILE');

  let decoded = null;
  let label = '';

  if (useHtml) {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    let barcodeLabelHtml;
    try {
      ({ barcodeLabelHtml } = await import(pathToFileURL(join(root, 'mobile', 'lib', 'ean13.ts')).href));
    } catch (err) {
      fail(`cannot import the app's label generator: ${err.message}`, 2);
    }
    // Geometry first: a complete pattern is not the same as a printable label.
    // Module 8 asks for a label wider than the default page, which is how the page-growth rule
    // is held to account; module 4 is what the product screen actually prints.
    for (const moduleWidth of [4, 8]) {
      const problems = checkLabelGeometry(barcodeLabelHtml, expect, moduleWidth);
      if (problems.length) {
        fail(`the generated label is not printable at module ${moduleWidth}pt:\n  - ${problems.join('\n  - ')}`);
      }
    }
    decoded = decodeEan13FromHtml(barcodeLabelHtml(expect).html);
    label = 'the label HTML the app generates now';
    console.log('✔ label geometry: both quiet zones inside the label box, and the page holds it');
  } else {
    let buffer;
    try {
      buffer = readFileSync(resolve(pdfPath));
    } catch (err) {
      fail(`cannot read ${pdfPath}: ${err.code ?? err.message}`, 2);
    }
    decoded = decodeEan13FromPdf(buffer);
    label = pdfPath;
  }

  if (!decoded) fail(`${label} does not contain a decodable EAN-13 (clipped, thickened or damaged geometry)`);
  if (decoded.code !== expect) fail(`${label} decodes to ${decoded.code}, expected ${expect}`);

  console.log(
    `✔ ${label}: ${decoded.code} — ${decoded.modules} modules, ${decoded.bars} bars, ` +
      `module ${decoded.unit}pt`,
  );
  process.exit(0);
}

// `await` at module top level is fine in ESM, and keeps main() linear.
if (process.argv[1] && process.argv[1].endsWith('verify-label-barcode.mjs')) {
  await main(process.argv.slice(2));
}

