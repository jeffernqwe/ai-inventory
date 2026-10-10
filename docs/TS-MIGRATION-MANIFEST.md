# Server TypeScript Migration Manifest

**Campaign:** TS-1 … TS-2F-p — **complete and closed**
**Runtime:** Node **24**, native TypeScript type stripping, ES Modules, **no build step**
**Recorded by:** TS-2F-q (documentation, manifest and verification-guard close-out)

This document is the migration record for `server/`. It states what the server is now,
how it got there, the one module deliberately left in JavaScript, and the verification
baseline that holds at close-out. It is a record of work already committed — it is not a
plan, and nothing in it authorises further migration.

---

## 1. Final State

`server/src` holds **94 `.ts` modules and exactly one `.js` module**. *(Annotated 2026-10-10: `main` now holds **117** `.ts` modules; the single deferred `.js` module is unchanged. This figure is a close-out snapshot, not a current count.)*

| Property | Value |
| --- | --- |
| Language | TypeScript (`.ts` is canonical) |
| Module system | ES Modules (`"type": "module"` in `server/package.json`) |
| Runtime target | Node **24** — `.nvmrc` pins `24`, `engines.node` is `>=24.0.0` |
| Execution model | Node's native TypeScript type stripping — sources run directly |
| Build step | **None.** No transpile, no bundle, no emit |
| `tsc`'s role | A *checker* only — `noEmit: true` |
| Entry point | `main: "src/index.ts"`, `start: "node src/index.ts"`, `dev: "node --watch src/index.ts"` |
| `.ts` in `server/src` | 94 |
| `.js` in `server/src` | 1 — `services/entitlement.service.js` (see §3) |

### No build step, by construction

`server/tsconfig.json` does not compile anything: `noEmit` is set, so `tsc` is a checker
and never a compiler. The server runs its sources directly, which means the compiler and
the runtime have to be kept in exact agreement rather than merely similar. Four flags do
that:

- **`erasableSyntaxOnly`** — rejects precisely the syntax Node cannot strip (`enum`,
  runtime `namespace`, parameter properties, `import x = require()`). It turns what would
  be a runtime `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` into a compile error, so a clean
  `tsc --noEmit` is a proof of erasure safety rather than a style preference.
- **`verbatimModuleSyntax`** — forces `import type`. A type imported without the keyword
  becomes a real runtime import of a binding that does not exist after stripping.
- **`allowImportingTsExtensions`** — specifiers name `.ts` explicitly, which is what
  Node's resolver needs. Legal only because `noEmit` is set.
- **`module` / `moduleResolution: nodenext`** — matches `"type": "module"` and enforces
  the extension-complete specifiers native ESM requires.

### Consequence for future work

New and modified server code is written in TypeScript. There is no "migrate it later"
path to fall back to: a new server module that is `.js` would be the only one, and
`npm run typecheck` would not check it (`checkJs: false`).

---

## 2. Campaign History

The campaign ran as 22 commits. `allowJs: true` and `checkJs: false` were held throughout,
so the un-migrated remainder stayed parsed and importable while each increment landed —
the server was runnable at every commit, and no commit was a big-bang rename.

> **On phase labels.** Commits from TS-2F-f onward carry their phase tag in the commit
> subject. The earlier commits do not — their subjects say only what was migrated. The
> phase labels shown for them are the campaign's own names for those increments, matched
> to the commit by content; the commit hash and subject are the authoritative record.

| Phase | Commit | Subject | Commit scope |
| --- | --- | --- | --- |
| TS-1 | `9900e9f` | chore: add TypeScript tooling foundation and harden source-text guards | 9 files, +756 / −64 |
| TS-2B | `af6430c` | feat(server): migrate models to TypeScript | 59 files, +156 / −156 |
| TS-2C | `08b27ad` | feat(server): migrate leaf modules to TypeScript | 78 files, +159 / −109 |
| TS-2D | `0fe068d` | feat(server): migrate utils to TypeScript | 45 files, +282 / −172 |
| TS-2 | `5d59550` | chore(server): declare Node 24 runtime and add TS migration guards | 7 files, +734 / −4 |
| TS-2E | `463ccca` | feat(server): migrate config and middleware modules to TypeScript | 40 files, +465 / −129 |
| TS-2F-a | `d5f278a` | feat(server): migrate inventory service to TypeScript | 7 files, +235 / −49 |
| TS-2F-b | `e22724f` | feat(server): migrate product domain to TypeScript | 8 files, +199 / −65 |
| TS-2F-c | `56a81b7` | feat(server): migrate reference domain to TypeScript | 9 files, +211 / −88 |
| TS-2F-d | `201b308` | feat(server): migrate dashboard domain to TypeScript | 6 files, +117 / −26 |
| TS-2F-e | `af75de4` | feat(server): migrate audit domain to TypeScript | 13 files, +192 / −109 |
| TS-2F-f | `d777b19` | feat(server): migrate inventory domain to TypeScript (TS-2F-f) | 8 files, +188 / −90 |
| TS-2F-g | `641ff48` | feat(server): migrate users domain to TypeScript (TS-2F-g) | 5 files, +191 / −64 |
| TS-2F-h | `885f12f` | feat(server): migrate purchase-orders domain to TypeScript (TS-2F-h) | 7 files, +450 / −131 |
| TS-2F-i | `18b65ec` | feat(server): migrate mail services to TypeScript (TS-2F-i) | 8 files, +104 / −26 |
| TS-2F-j | `d996c8f` | feat(server): migrate auth core to TypeScript (TS-2F-j) | 15 files, +219 / −60 |
| TS-2F-k | `41acffd` | feat(server): migrate password recovery to TypeScript (TS-2F-k) | 5 files, +82 / −19 |
| TS-2F-l | `39f3719` | feat(server): migrate ai provider layer to TypeScript (TS-2F-l) | 13 files, +311 / −109 |
| TS-2F-m | `5f48f81` | feat(server): migrate ai tools to TypeScript (TS-2F-m) | 5 files, +168 / −32 |
| TS-2F-n | `b2c77af` | feat(server): migrate ai orchestration to TypeScript (TS-2F-n) | 7 files, +122 / −40 |
| TS-2F-o | `8dfea43` | feat(server): migrate app bootstrap to TypeScript (TS-2F-o) | 12 files, +33 / −14 |
| TS-2F-p | `b7315e6` | feat(server): migrate server entry point to TypeScript (TS-2F-p) | 2 files, +3 / −3 |

"Commit scope" is the whole commit — migrated modules plus the tests, guards and
documentation that moved with them — and is not a count of migrated modules.

**TS-2F-p** is the campaign's end. It is the smallest increment by diff (+3 / −3: a pure
rename plus three `package.json` path strings) and the only one with no specifier ripple
at all, because `package.json` addresses the entry point by string rather than by import.

---

## 3. Deferred Exception

**`server/src/services/entitlement.service.js` is deliberately left in JavaScript.**

It is the single remaining `.js` module in `server/src`, and its deferral is a decision,
not an oversight:

- **No source importer.** Nothing under `server/src/` imports it. The only `src/`
  references to it are comments — its own header and one explanatory line in
  `server/src/constants/plans.ts`. Its only real importer is
  `server/test/phase10-commercialization.test.mjs`, which imports it directly.
- **Deferred, not dropped.** Entitlement checks are Phase 10 groundwork for paid-plan
  enforcement, which is **deferred to V4**. The module therefore has no production call
  path today, which is what makes leaving it alone safe: no request can reach it, so no
  runtime path can observe its extension.
- **The remaining documentation references are intentional.** Where this repository names
  `services/entitlement.service.js` — in `CLAUDE.md`, `README.md` and the roadmap's Phase
  10 record — the reference is correct, because the file really is `.js`. Those mentions
  are **not** stale `.js` references and must not be rewritten to `.ts`.

Its own imports were updated to `.ts` specifiers as their targets migrated (last by
TS-2F-j, `d996c8f`), so it participates in the module graph correctly. When entitlement
work is scheduled for V4, migrating this file is part of that work — not a loose end of
this campaign.

---

## 4. Verification Baseline

Measured at close-out. The typecheck, lint, unit and module-graph rows were re-run during
TS-2F-q; the two runtime rows are the figures recorded by the TS-2F-p audit, which they
close.

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | **0 errors** |
| Lint | `npm run lint` (`eslint .`) | **0 problems** |
| Unit baseline | `npm run test:unit` | **259 tests / 74 suites — 239 pass, 0 fail, 20 skipped** |
| Module graph — duplicates | `npm run check:extensions` | **240 modules scanned, 0 duplicate module stems** |
| Module graph — specifiers | `npm run check:specifiers` | **240 files scanned, 1206 relative specifiers resolved (540 literal, 666 by candidate extension), 0 stale, 0 unresolved** |
| Runtime startup gate (Gate 6) | out-of-repo harness | **30 / 30** |
| Runtime module-graph gate (Gate 7) | out-of-repo harness | **48 / 48** |
| Type-erasure oracle (Gate 8) | `gate8/oracle.sh` | **emit byte-identical** — `index.ts` and its pre-migration `index.js` compile to the same 90 bytes, `sha256=2ca4c2a3125f5fe7` |

Three notes that keep these numbers honest:

- **The unit baseline grew by exactly four tests during TS-2F-q** — from 255 tests / 73
  suites (235 pass, 0 fail) at the TS-2F-p audit to 259 / 74 here. The addition is the four
  entry-point assertions in the `Phase TS-2F-p — the package.json entry point` block of
  `server/test/phase-ts-3-migration-guards.test.mjs`; no pre-existing test changed, and the
  failure count is 0 on both sides of the change.
- **The 20 skipped tests are the DB-backed suites**, skipped because `test:unit` runs with
  `TEST_MODE=unit`. They are visibly skipped, never silently green; `npm test` or
  `npm run test:db` exercises them against MongoDB.
- **Two dynamic `import()` calls are reported as unverified** by the specifier guard
  (`phase23-authorization-contract.test.mjs`, computed arguments). They are reported rather
  than assumed correct, and are not counted as resolved.

### Gate 8 compares against an explicit revision

The migration **deleted** `server/src/index.js`, so an oracle hardcoded to `HEAD:` can no
longer produce a BEFORE side — it would compare nothing against nothing and still print a
pass. The oracle therefore takes the revision explicitly and resolves it to a full SHA:

```sh
gate8/oracle.sh              # auto: the last revision that still contains index.js
gate8/oracle.sh b7315e6^     # the migration commit's parent (8dfea43)
```

A revision that does not contain the pre-migration JavaScript exits `2` with a FATAL
message instead of reporting a comparison it did not make. The check itself is unchanged:
identical explicit `tsc` flags plus `--removeComments` on both sides, then a byte
comparison of the emitted JavaScript.
