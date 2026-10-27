# Server TypeScript Migration Manifest

**Campaign:** TS-1 … TS-2F-p — **complete and closed**
**Runtime:** Node **24**, native type stripping, ES Modules, **no build step**

This is the record of a finished migration, not a plan. It exists to state what the server *is*
now, the one module deliberately left in JavaScript, and the four compiler flags that make
"no build step" safe. Nothing here authorises further migration.

---

## 1. Final state

| Property | Value |
| --- | --- |
| Language | TypeScript — `.ts` is canonical |
| Module system | ES Modules (`"type": "module"`) |
| Runtime | Node **24** — `.nvmrc`, `engines.node` `>=24.0.0` |
| Execution | Node strips the types and runs the sources directly |
| Build step | **None** — no transpile, no bundle, no emit |
| `tsc`'s role | A checker only: `noEmit: true` |
| Entry point | `main: "src/index.ts"`, `start: "node src/index.ts"` |
| `.js` under `server/src` | **1** — `services/entitlement.service.js` (§3) |

The campaign closed at **94** `.ts` modules. `CLAUDE.md` states the current count, which is larger;
measure it rather than quoting a snapshot:

```bash
find server/src -name '*.ts' | wc -l
```

### The four flags that make type stripping safe

A checker and a runtime that disagree is a runtime error, so `tsconfig.json` removes the space
between them:

- **`erasableSyntaxOnly`** — rejects what Node cannot strip (`enum`, runtime `namespace`, parameter
  properties, `import x = require()`). A clean `tsc --noEmit` becomes a proof of erasure safety.
- **`verbatimModuleSyntax`** — forces `import type`; a type imported without it becomes a real
  runtime import of a binding that does not exist after stripping.
- **`allowImportingTsExtensions`** — specifiers name `.ts`, which is what Node's resolver needs.
  Legal only because nothing is emitted.
- **`module`/`moduleResolution: nodenext`** — matches `"type": "module"` and enforces
  extension-complete specifiers.

### Consequence for new work

New and modified server code is TypeScript. There is no "migrate it later" path: a new `.js` module
would be the only one, and `npm run typecheck` would not check it (`checkJs: false`).

---

## 2. Why the campaign was safe to run in steps

22 commits, each a rename plus its specifier updates. `allowJs: true` and `checkJs: false` were held
throughout, so the un-migrated remainder stayed parsed and importable and the server was runnable at
every commit — no big-bang rename, no uncommitted half-state.

The last increment (TS-2F-p) is the smallest by diff — +3/−3, a pure rename plus three
`package.json` path strings. Git history holds the per-commit detail; it is not duplicated here.

Two guards now hold the result, and neither needs the migration's history to be useful:

| Guard | Question |
| --- | --- |
| `npm run check:extensions` | Does any two modules share a stem, so a specifier could resolve to either? |
| `npm run check:specifiers` | Does every relative import resolve, by literal path or unambiguous candidate? |

Both report rather than assume: the specifier check counts literal and by-candidate resolutions
separately, and reports computed `import()` arguments as **unverified** instead of counting them as
resolved.

---

## 3. The one deferred module

**`server/src/services/entitlement.service.js` is deliberately JavaScript.**

- **No source importer.** Nothing under `server/src/` imports it; the only `src/` mentions are
  comments (its own header, and one line in `constants/plans.ts`). Its only real importer is
  `server/test/phase10-commercialization.test.mjs`.
- **Unreachable by a request.** Entitlement checks are Phase 10 groundwork for paid plans, which are
  deferred to V4. No request can reach it, so no runtime path can observe the extension.
- **Its specifiers are current.** They were updated to `.ts` as their targets migrated, so it
  participates in the module graph correctly.

Every place this repository names `services/entitlement.service.js` — `CLAUDE.md`,
`SYSTEM_SPECIFICATION.md`, `constants/plans.ts`, the Phase 10 record and the Phase 10 test's own
import — is **correct**. Those are not stale `.js` references and must not be rewritten to
`.ts`. Migrating the file belongs to the V4 work that will give it a call path.

---

## 4. Verification at close-out

Recorded as a **snapshot of the closing commit**, not as today's numbers. CI is the single source of
truth for the current suite.

| Check | Result at close-out |
| --- | --- |
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 problems |
| `npm run test:unit` | 259 tests / 74 suites — 239 pass, 0 fail, 20 skipped |
| Module graph | 240 modules, 0 duplicate stems; 1206 specifiers resolved, 0 stale, 0 unresolved |
| Runtime gates (out-of-repo harness) | startup 30/30, module graph 48/48 |
| Type-erasure oracle | emitted JavaScript byte-identical to the pre-migration build |

The 20 skips are the DB-backed suites, skipped because `test:unit` runs with `TEST_MODE=unit`. They
are visibly skipped, never silently green; `npm test` runs them against MongoDB.
