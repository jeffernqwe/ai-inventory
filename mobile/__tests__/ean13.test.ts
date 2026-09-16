import {
  MODULE_COUNT,
  QUIET_MODULES,
  isEan13,
  ean13CheckDigit,
  ean13Bits,
  ean13Runs,
  ean13Svg,
} from '../lib/ean13';

/** A real, check-digit-valid EAN-13 used as the worked example throughout. */
const VALID = '4006381333931';
const VALID_PAYLOAD = VALID.slice(0, 12);

describe('isEan13', () => {
  it('accepts thirteen digits and rejects anything else', () => {
    expect(isEan13(VALID)).toBe(true);
    expect(isEan13('400638133393')).toBe(false); // 12 digits
    expect(isEan13(null)).toBe(false);
  });
});

describe('ean13CheckDigit', () => {
  it('computes the check digit of a 12-digit payload', () => {
    expect(ean13CheckDigit(VALID_PAYLOAD)).toBe(1);
  });
});

describe('ean13Bits', () => {
  it('produces the full 95-module pattern with guards at both ends and the centre', () => {
    const bits = ean13Bits(VALID);
    expect(bits).toHaveLength(MODULE_COUNT);
    expect(/^[01]+$/.test(bits)).toBe(true);
    expect(bits.slice(0, 3)).toBe('101');
    expect(bits.slice(45, 50)).toBe('01010');
    expect(bits.slice(-3)).toBe('101');
  });

  it('refuses a value that is not an EAN-13', () => {
    expect(() => ean13Bits('123')).toThrow(/non-EAN-13/);
  });
});

describe('ean13Runs and ean13Svg', () => {
  it('covers every module with strictly alternating runs', () => {
    const runs = ean13Runs(VALID);
    expect(runs.reduce((total, run) => total + run.len, 0)).toBe(MODULE_COUNT);
    expect(runs.every((run, i) => i === 0 || run.on !== runs[i - 1].on)).toBe(true);
  });

  it('draws one rect per bar run, offset by the leading quiet zone', () => {
    const runs = ean13Runs(VALID);
    const bars = runs.filter((run) => run.on).length;
    const svg = ean13Svg(VALID, { moduleWidth: 4 });
    expect(svg.match(/<rect /g)).toHaveLength(bars);
    // The first run is a bar, and it starts one quiet zone in.
    expect(svg).toContain(`<rect x="${QUIET_MODULES * 4}"`);
    expect(svg).toContain(VALID);
  });
});
