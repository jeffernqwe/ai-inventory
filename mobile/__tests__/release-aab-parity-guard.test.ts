/**
 * The release-bundle guard runs, and still rejects what it is supposed to reject.
 *
 * WHY THIS EXISTS. `scripts/check-aab.mjs` is the only check that asks whether a store artifact is
 * the commit under review. It was written after the 2026-10-24 AABs were found to predate the in-app
 * account-deletion screen that Play requires — every packaging check (signing, permissions, the API
 * URL, the channel) had passed on both of them. It has two layers now, packaging and bundle parity,
 * and a gate with an unexercised layer is how it would rot unnoticed.
 *
 * A guard that is never executed rots silently: a parser change could make it report "nothing
 * missing" for every artifact, which is worse than having no guard. This runs its self-test, which
 * includes the negative case (a bundle missing the deletion copy is reported) and a check that each
 * probe is still copy that exists in `app/`/`components/`. It does NOT run the guard against a real
 * AAB: the artifact is not in the repository, and CI has no build to point it at.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('store-artifact gate', () => {
  it('passes its own controls, including the missing-deletion negative case', () => {
    const output = execFileSync(process.execPath, [join('scripts', 'check-aab.mjs'), '--self-test'], {
      cwd: join(__dirname, '..'),
      encoding: 'utf8',
    });

    expect(output).toContain('store-artifact gate self-test:');
    // The parser/ZIP controls plus one per probe that still exists in the app's source. The exact
    // number tracks the probe list, so only its floor is asserted.
    const controls = Number(/: (\d+) control\(s\) passed/.exec(output)?.[1] ?? 0);
    expect(controls).toBeGreaterThanOrEqual(10);

    // The negative case is what makes this a guard rather than a formality. If it were deleted,
    // the output above would still look healthy, so pin it at the source.
    const script = readFileSync(join(__dirname, '..', 'scripts', 'check-aab.mjs'), 'utf8');
    expect(script).toContain("'a missing deletion screen is reported'");
    expect(script).toContain("'only the missing sentences are reported'");
    // The packaging layer's two most consequential rules: the permission that was removed, and a
    // package id that would upload to the wrong listing.
    expect(script).toContain("'SYSTEM_ALERT_WINDOW is refused'");
    expect(script).toContain("'a wrong package id is reported'");
  });
});
