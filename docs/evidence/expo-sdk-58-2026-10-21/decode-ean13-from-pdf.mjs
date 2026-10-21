// Decode the EAN-13 barcode that the app actually put in the printed PDF.
//
// The print path renders the label as vector rectangles (Skia), so the bars are
// `re` (rectangle) operators in the page content stream — no image to OCR and no
// scan of paper needed for THIS check: if the bars in the PDF decode back to the
// product's barcode, the printed geometry is right (the F-1 clipping failure put
// a cut-off bar pattern into the PDF instead).
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';

const buf = readFileSync(process.argv[2] ?? 'label-print.pdf');
const latin = buf.toString('latin1');

/** Every `N 0 obj ... endobj` body, keyed by object number, as latin1 text. */
const objects = new Map();
const objRe = /(\d+) 0 obj([\s\S]*?)endobj/g;
for (const m of latin.matchAll(objRe)) objects.set(Number(m[1]), m[2]);

/** The decoded stream inside an object, or null when the object has none. */
function streamOf(body) {
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
  } catch (err) {
    return null;
  }
}

// The page's /Contents is an array of references; join their decoded streams.
const page = [...objects.values()].find((body) => /\/Contents\s+\d+ 0 R/.test(body) && /\/MediaBox/.test(body));
if (!page) throw new Error('no page object');
const contentsRef = Number(page.match(/\/Contents\s+(\d+) 0 R/)[1]);
const contentsBody = objects.get(contentsRef);
let content;
if (/^\s*\[/.test(contentsBody.trim())) {
  const refs = [...contentsBody.matchAll(/(\d+) 0 R/g)].map((m) => Number(m[1]));
  content = refs.map((n) => streamOf(objects.get(n)) ?? '').join('\n');
} else {
  content = streamOf(contentsBody) ?? '';
}
if (!content) throw new Error('no content stream');

if (process.argv.includes('--dump')) {
  console.log(content);
  process.exit(0);
}

// ── Collect the filled rectangles ───────────────────────────────────────────
// Skia emits the label's bars as paths of `x y w h re` followed by `f`, all in
// device space, so the operator order is enough: take every `re` subpath and
// keep the ones that belong to one barcode (same bottom/top, thin and tall).
const rects = [];
const reRe = /(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+re\b/g;
for (const m of content.matchAll(reRe)) {
  const [x, y, w, h] = m.slice(1).map(Number);
  rects.push({ x, y, w, h });
}

// Bars: the tallest repeated height. Labels draw a quiet zone, so bars share a
// height distinct from the text's glyph boxes.
const byHeight = new Map();
for (const r of rects) {
  const key = r.h.toFixed(2);
  byHeight.set(key, (byHeight.get(key) ?? 0) + 1);
}
const barHeight = [...byHeight.entries()].sort((a, b) => b[1] - a[1])[0];
const bars = rects.filter((r) => r.h.toFixed(2) === barHeight[0] && r.w < r.h);
bars.sort((a, b) => a.x - b.x);
console.log(`rectangles ${rects.length}, tallest-height group ${barHeight[0]} has ${barHeight[1]}, bars ${bars.length}`);
if (!bars.length) {
  console.log('no bars found — dumping rectangles');
  console.log(rects.slice(0, 40));
  process.exit(1);
}

// ── Turn bar geometry into a module string ──────────────────────────────────
// EAN-13 is 95 modules; bars and spaces alternate. Cluster distinct x edges so
// anti-aliasing/rounding cannot split one module into two.
const unit = (bars[bars.length - 1].x + bars[bars.length - 1].w - bars[0].x) / 95;
const modules = [];
let cursor = bars[0].x;
for (const bar of bars) {
  const gap = Math.round((bar.x - cursor) / unit);
  for (let i = 0; i < gap; i += 1) modules.push('0');
  const width = Math.max(1, Math.round(bar.w / unit));
  for (let i = 0; i < width; i += 1) modules.push('1');
  cursor = bar.x + bar.w;
}
const bits = modules.join('');
console.log(`module width ${unit.toFixed(4)}, modules ${bits.length}`);

const L = { 0: '0001101', 1: '0011001', 2: '0010011', 3: '0111101', 4: '0100011', 5: '0110001', 6: '0101111', 7: '0111011', 8: '0110111', 9: '0001011' };
const G = { 0: '0100111', 1: '0110011', 2: '0011011', 3: '0100001', 4: '0011101', 5: '0111001', 6: '0000101', 7: '0010001', 8: '0001001', 9: '0010111' };
// R (right-hand set) is the BITWISE COMPLEMENT of L, not L reversed — L reversed is G.
const R = Object.fromEntries(Object.entries(L).map(([d, p]) => [d, p.split('').map((c) => (c === '0' ? '1' : '0')).join('')]));
const PARITY = { LLLLLL: '0', LLGLGG: '1', LLGGLG: '2', LLGGGL: '3', LGLLGG: '4', LGGLLG: '5', LGGGLL: '6', LGLGLG: '7', LGLGGL: '8', LGGLGL: '9' };

function digitOf(table, pattern) {
  const hit = Object.entries(table).find(([, p]) => p === pattern);
  return hit ? hit[0] : null;
}

const clean = bits.replace(/^0+/, '').slice(0, 95);
if (clean.length !== 95) throw new Error(`expected 95 modules, got ${clean.length}`);
if (clean.slice(0, 3) !== '101' || clean.slice(-3) !== '101' || clean.slice(45, 50) !== '01010') {
  throw new Error(`guard patterns not found in ${clean}`);
}
const left = clean.slice(3, 45);
const right = clean.slice(50, 92);
let parity = '';
const digits = [];
for (let i = 0; i < 6; i += 1) {
  const chunk = left.slice(i * 7, i * 7 + 7);
  const l = digitOf(L, chunk);
  if (l != null) { parity += 'L'; digits.push(l); continue; }
  const g = digitOf(G, chunk);
  if (g != null) { parity += 'G'; digits.push(g); continue; }
  throw new Error(`left group ${i} undecodable: ${chunk}`);
}
for (let i = 0; i < 6; i += 1) {
  const chunk = right.slice(i * 7, i * 7 + 7);
  const d = digitOf(R, chunk);
  if (d == null) throw new Error(`right group ${i} undecodable: ${chunk}`);
  digits.push(d);
}
const first = PARITY[parity];
if (first == null) throw new Error(`parity ${parity} unknown`);
const code = first + digits.join('');
const expected = process.argv[3];
console.log(`decoded ${code}${expected ? (code === expected ? ' — MATCHES ' + expected : ' — EXPECTED ' + expected) : ''}`);
if (expected && code !== expected) process.exit(1);
