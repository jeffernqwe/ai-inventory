#!/usr/bin/env node
/**
 * scripts/check-upgrade-watches.mjs — the deferred-upgrade watch list, as one command.
 *
 * WHY THIS EXISTS. The remaining deferred upgrades are not "not started": each is gated on something
 * outside this repository moving first, and the roadmap records each gate as prose to re-check by hand
 * (§27AH "Immediate next actions", §27AI Gate 0, §27AQ's measured blockers). Prose drifts; this reads
 * the registries and prints the same answers, so a session starts from a measurement instead of a
 * memory. It changes nothing — it is a read-only report.
 *
 * WHAT IT WATCHES, and what each one unblocks:
 *   1. `expo`               — `latest` must move to 58 before the SDK 58 train (§27AI) can run. The
 *                             gate is deliberately `latest`, not `next`: Expo promotes an SDK when it
 *                             is ready, and the runbook is written for that moment.
 *   2. `jest-expo`          — jest 30 arrives with the SDK 58 train: the SDK 57 line (57.0.5) depends on
 *                             `@jest/globals@^29.2.1`, while 58.0.9 — the newest 58.x — depends on
 *                             `^30.0.0`, so the promotion of SDK 58 is what delivers jest 30. This entry
 *                             exists because a first manual reading of `58.0.0` showed `^29.2.1` and the
 *                             line had moved by 58.0.9 within days: it reads the registry, not a note.
 *   3. `@typescript-eslint` — TypeScript 7 is blocked until the parser's `typescript` peer range admits
 *                             7. Measured 2026-10-11: the only line is 8.x, `>=4.8.4 <6.1.0`, in both
 *                             workspaces; there is no 9.x.
 *
 * HOW TO RUN. `node scripts/check-upgrade-watches.mjs` (add `--json` for machine output). It needs the
 * network and is deliberately NOT part of CI: a pipeline that fails when npm is unreachable would turn
 * an upstream outage into a red build. Exit code is 0 for "report produced" — a watch being READY is
 * news, not a failure of this script.
 *
 * WHAT IT DOES NOT DO: it never installs, never edits `package.json`, and never decides. `READY` means
 * the gate recorded in the roadmap can be started, nothing more.
 */

const REGISTRY = 'https://registry.npmjs.org';

/** The slice of semver this file needs — deliberately narrow, and stated rather than approximated. */
function majorOf(version) {
  const m = /^(\d+)\./.exec(version);
  return m ? Number(m[1]) : NaN;
}

/**
 * Does a simple range admit `version`? Handles exactly the forms the watched packages publish:
 * `^X.y.z`, `~X.y.z`, an exact version, and `>=A <B` (possibly `||`-joined). Anything else is
 * reported as "unparsed" rather than silently called a pass, because a wrong answer here would be
 * worse than no answer.
 */
function rangeAdmits(range, version) {
  const target = majorOf(version);
  if (Number.isNaN(target)) return { ok: false, unparsed: true };
  const clauses = String(range)
    .split('||')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const clause of clauses) {
    if (clause.startsWith('^')) {
      const floor = clause.slice(1);
      if (majorOf(floor) === target && compareMajorMinor(floor, version) <= 0) return { ok: true };
    } else if (clause.startsWith('~')) {
      const floor = clause.slice(1);
      if (majorOf(floor) === target && minorOf(floor) === minorOf(version) && compareMajorMinor(floor, version) <= 0) {
        return { ok: true };
      }
    } else if (/^\d+\.\d+\.\d+/.test(clause)) {
      if (clause === version) return { ok: true };
    } else if (clause.includes('>=') || clause.includes('<')) {
      const bounds = clause.split(/\s+/).filter(Boolean);
      let lowerOk = true;
      let upperOk = true;
      for (const bound of bounds) {
        if (bound.startsWith('>=') && compareSemver(bound.slice(2), version) > 0) lowerOk = false;
        if (bound.startsWith('<') && compareSemver(bound.slice(1), version) <= 0) upperOk = false;
      }
      if (lowerOk && upperOk) return { ok: true };
    } else {
      return { ok: false, unparsed: true, clause };
    }
  }
  return { ok: false };
}

function minorOf(version) {
  const m = /^\d+\.(\d+)\./.exec(version);
  return m ? Number(m[1]) : NaN;
}

/** Numeric compare of `a.b.c`-style versions (prerelease tags ignored — none are watched here). */
function compareSemver(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

const compareMajorMinor = (a, b) => compareSemver(a, b);

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

const scoped = (name) => name.replace('/', '%2f');

/** Each watch: what to read, what READY means, and what it unblocks. */
const WATCHES = [
  {
    name: 'expo',
    gate: 'SDK 58 train (§27AI) — `latest` must be 58',
    async read() {
      const tags = await getJson(`${REGISTRY}/-/package/expo/dist-tags`);
      const latest = tags.latest;
      return {
        detail: `dist-tags: latest=${latest} next=${tags.next ?? '(none)'}`,
        ready: majorOf(latest) >= 58,
        unblocks: 'the SDK 58 upgrade runbook',
      };
    },
  },
  {
    name: 'jest-expo',
    gate: 'jest 30 — a jest-expo release must depend on the jest 30 line',
    async read() {
      // `latest` AND `next`, because the finding this watch exists for is that the 58 line did not
      // move either — reading only `latest` would hide the SDK-58 train's own answer until promotion.
      const tags = await getJson(`${REGISTRY}/-/package/jest-expo/dist-tags`);
      const candidates = [...new Set([tags.latest, tags.next].filter(Boolean))];
      const lines = [];
      let ready = false;
      let unparsed = false;
      for (const version of candidates) {
        const manifest = await getJson(`${REGISTRY}/jest-expo/${version}`);
        const range = manifest.dependencies?.['@jest/globals'] ?? manifest.dependencies?.['babel-jest'];
        const verdict = rangeAdmits(range, '30.0.0');
        lines.push(`${version}: @jest/globals=${range ?? '(missing)'}${verdict.ok ? ' ← admits 30' : ''}`);
        if (verdict.ok) ready = true;
        if (verdict.unparsed) unparsed = true;
      }
      return { detail: lines.join(' | '), ready, unparsed, unblocks: 'jest 30 in mobile/' };
    },
  },
  {
    name: '@typescript-eslint/parser',
    gate: 'TypeScript 7 — the typescript peer range must admit 7',
    async read() {
      const manifest = await getJson(`${REGISTRY}/${scoped('@typescript-eslint/parser')}/latest`);
      const range = manifest.peerDependencies?.typescript;
      const verdict = rangeAdmits(range, '7.0.0');
      return {
        detail: `latest=${manifest.version}, peer typescript=${range ?? '(missing)'}`,
        ready: verdict.ok,
        unparsed: verdict.unparsed,
        unblocks: 'TypeScript 7 in mobile/ and server/',
      };
    },
  },
];

const results = [];
let failed = 0;
for (const watch of WATCHES) {
  try {
    const { detail, ready, unparsed, unblocks } = await watch.read();
    results.push({ package: watch.name, gate: watch.gate, detail, status: unparsed ? 'UNPARSED' : ready ? 'READY' : 'DEFERRED', unblocks });
    if (unparsed) failed += 1;
  } catch (error) {
    // A watch that cannot be read is reported as such, never as a pass.
    results.push({ package: watch.name, gate: watch.gate, detail: `unreadable: ${error.message}`, status: 'UNREADABLE', unblocks: '' });
    failed += 1;
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));
} else {
  console.log('[upgrade-watches] read-only report — re-read the roadmap gate before acting on it\n');
  for (const row of results) {
    console.log(`  ${row.status.padEnd(10)} ${row.package}`);
    console.log(`             gate:    ${row.gate}`);
    console.log(`             current: ${row.detail}`);
    if (row.unblocks) console.log(`             unblocks: ${row.unblocks}`);
    console.log('');
  }
  const ready = results.filter((r) => r.status === 'READY');
  console.log(
    ready.length
      ? `[upgrade-watches] ${ready.length} gate(s) open: ${ready.map((r) => r.package).join(', ')}`
      : '[upgrade-watches] every watch is still deferred — nothing to start today.'
  );
  if (failed) console.log(`[upgrade-watches] ${failed} watch(es) could not be read — reported above, not counted as a pass.`);
}
process.exit(0);
