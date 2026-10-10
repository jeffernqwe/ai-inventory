# TEST BASELINE — inventory, provenance and execution status

> Audit record. **Not** a test report for Claude Code's phases, and **not** a specification.
> Authoritative source for test **classification** is `server/scripts/run-tests.mjs`; for the
> DB-availability policy it is `server/test/testEnv.mjs`. This file records what Freebuff found and
> what Freebuff has (not) executed.

> **Annotated 2026-10-11 — two dispositions, no content changed.** (1) Every count below is a **frozen
> snapshot taken 2026-09-30**; it is deliberately left as the dated record it is. **CI is the single source
> of truth** for current test counts (`ci.yml`'s `server` and `mobile` jobs; roadmap §27AH, ISS-15) — the
> latest dated local figures live in that section, not here. (2) **This directory is retained** as the
> audit/provenance layer it was written as (P3-2): it duplicates no authoritative document, claims no
> authority, and deleting it would destroy provenance rather than tidy anything.

---

## 0. The binding rule on this page

> **`DOCUMENTED HISTORICAL RESULT` is NOT `EXECUTED / VERIFIED BY FREEBUFF`.**

- A count copied from a README/CLAUDE.md/roadmap entry is labelled
  **`DOCUMENTED HISTORICAL RESULT — NOT REPRODUCED BY FREEBUFF`**.
- Freebuff claims a result only with the exact command, the mode, the date and the printed outcome.
- Reasoning about code is labelled `REASONED, NOT VERIFIED`.

## 1. Authoritative classification (read from source, not inferred)

`server/scripts/run-tests.mjs` defines three lists and derives the run sets:

| Mode | Command | Files run | MongoDB |
| --- | --- | --- | --- |
| `full` | `npm test` | PURE_UNIT + PURE_DB + MIXED | **required**; a DB-backed suite that cannot connect becomes **one failing test** (never a silent skip) |
| `unit` | `npm run test:unit` | PURE_UNIT + MIXED | not required; DB-backed suites inside MIXED become **one visible skipped test** with a reason (`TEST_MODE=unit`) |
| `db` | `npm run test:db` | PURE_DB + MIXED | **required**; DB-independent suites become a visible skipped test |

**Enforced constraint (important for future Freebuff work):** the runner lists every `*.test.mjs` on
disk and **exits `2`** if any file is not classified. Therefore:

> **Creating any new `*.test.mjs` file breaks `npm test` until `server/scripts/run-tests.mjs` is
> updated.** That file is Claude-authored; it must be in the task's approved allowlist, otherwise the
> task **stops and requests approval** for it.

`mobile/` has no such runner registry: jest discovers `mobile/__tests__/**`.

## 2. Server test files — 45 total, all `PRE-EXISTING` / `CLAUDE-CODE / HISTORICAL`

**Executed by Freebuff: NO (every row).** Provenance is `PRE-EXISTING`; authorship is attributed to
Claude Code by project documentation, not by Freebuff.

### 2a. `PURE_UNIT` — 10 files (DB-independent)

| # | File | Executed by Freebuff |
| --- | --- | --- |
| 1 | `phase03-rbac.test.mjs` | NO |
| 2 | `phase06-ai-wire.test.mjs` *(**protected** working-tree entry — do not modify)* | NO |
| 3 | `phase07d-production-config.test.mjs` | NO |
| 4 | `phase20f-ai-conversation-index.test.mjs` | NO |
| 5 | `phase20g-list-sort-indexes.test.mjs` | NO |
| 6 | `phase21-product-archive-invariant.test.mjs` | NO |
| 7 | `phase22-authorization-contract.test.mjs` | NO |
| 8 | `phase23-authorization-contract.test.mjs` | NO |
| 9 | `phase26b-mail-service.test.mjs` | NO |
| 10 | `phase-ts-3-migration-guards.test.mjs` | NO |

### 2b. `PURE_DB` — 15 files (MongoDB required)

| # | File | Executed by Freebuff |
| --- | --- | --- |
| 1 | `phase03-auth.test.mjs` | NO |
| 2 | `phase04-catalog.test.mjs` | NO |
| 3 | `phase04-inventory.test.mjs` | NO |
| 4 | `phase06-ai-behavior.test.mjs` | NO |
| 5 | `phase06-ai-tools.test.mjs` | NO |
| 6 | `phase06-ai-security.test.mjs` | NO |
| 7 | `phase07a-inventory-compensation.test.mjs` | NO |
| 8 | `phase07b-auth-security.test.mjs` | NO |
| 9 | `phase19-transfers.test.mjs` | NO |
| 10 | `phase20-pagination-order.test.mjs` | NO |
| 11 | `phase20-pagination-contract.test.mjs` | NO |
| 12 | `phase20-filter-contract.test.mjs` | NO |
| 13 | `phase24-runtime-authorization-matrix.test.mjs` | NO |
| 14 | `phase26a-session-lifecycle.test.mjs` | NO |
| 15 | `phase32e-firebase-legacy-guard.test.mjs` | NO |

### 2c. `MIXED` — 20 files (unit + DB-backed suites in one file)

| # | File | Executed by Freebuff |
| --- | --- | --- |
| 1 | `phase06-ai-provider.test.mjs` | NO |
| 2 | `phase07c-http-security.test.mjs` | NO |
| 3 | `phase07d-db-reliability.test.mjs` | NO |
| 4 | `phase07e-ai-reliability.test.mjs` | NO |
| 5 | `phase08a-request-logging.test.mjs` | NO |
| 6 | `phase10-commercialization.test.mjs` | NO |
| 7 | `phase11-intelligence.test.mjs` | NO |
| 8 | `phase12a-barcode.test.mjs` | NO |
| 9 | `phase12d-barcode-generation.test.mjs` | NO |
| 10 | `phase13-suppliers.test.mjs` | NO |
| 11 | `phase13-purchase-orders.test.mjs` | NO |
| 12 | `phase13-receiving.test.mjs` | NO |
| 13 | `phase14-users.test.mjs` | NO |
| 14 | `phase15-account-security.test.mjs` | NO |
| 15 | `phase16-audit-viewer.test.mjs` | NO |
| 16 | `phase26b-password-recovery.test.mjs` | NO |
| 17 | `phase26b-password-recovery-http.test.mjs` | NO |
| 18 | `phase32b-firebase-admin.test.mjs` | NO |
| 19 | `phase32c-firebase-exchange.test.mjs` | NO |
| 20 | `phase32h-firebase-linking.test.mjs` | NO |

Also present in `server/test/` and **not** runnable test files (support modules, `PRE-EXISTING`):
`helpers.mjs`, `support.mjs`, `testEnv.mjs`, `sourceFiles.mjs`, `fakes/firebaseVerifier.mjs`.

## 3. Mobile test files — 15 total, all `PRE-EXISTING` / `CLAUDE-CODE / HISTORICAL`

**Executed by Freebuff: NO (every row).** Runner: jest (`jest-expo` + @testing-library/react-native).

`auth-firebase-flow.test.tsx` · `Badge.test.tsx` · `ean13.test.ts` · `firebase-auth.test.ts` ·
`firebase.test.ts` · `format.test.ts` · `login-registration-required.test.tsx` ·
`permissions.test.ts` · `reset-password-link-reset.test.tsx` · `screen-focus-load.test.tsx` ·
`screen-rbac-guard.test.tsx` · `useInventoryRow.test.tsx` · `usePagedList.test.tsx` ·
`useProductDetail.test.tsx` · `useRefetchOnFocus.test.tsx`

**Observation (`SOURCE-CODE OBSERVATION`, appended per FB-D-111):** the Phase 30A record documents
"jest 11 suites / 88 tests". **15** suite files are present at this baseline. The difference is
consistent with later phases adding suites; the **counts are not comparable without execution**, and
Freebuff ran nothing.

## 4. Freebuff test register

| Category | Count at FB-002 (unchanged through FB-005) | Details |
| --- | --- | --- |
| `FREEBUFF-CREATED` tests | **0** | none |
| `FREEBUFF-MODIFIED` tests | **0** | none — no pre-existing test file was touched |
| Tests **executed** by Freebuff | **0** | no test, typecheck, lint or build was run through FB-005 (FB-001–FB-005) |
| Tests **deleted** by Freebuff | **0** | none |

_Status updated by FB-005: the register remains empty through FB-005 — FB-003 and FB-004 were
read-only audits that executed nothing, and FB-005 executed no test, typecheck, lint or build. The
pre-existing inventory in §2/§3 is unchanged._

### 4a. FB-006 (Phase 32K) — the register's first non-zero entry

| Category | Count | Details |
| --- | --- | --- |
| `FREEBUFF-CREATED` tests | **2** | `server/test/phase32k-firebase-password-boundary.test.mjs` (node:test, `PURE_DB`, 12 cases, registered in `run-tests.mjs`); `mobile/__tests__/phase32k-password-capability-gating.test.tsx` (jest, 4 cases) — **renamed from `fb-006-*` by owner decision (FB-D-115)** |
| `FREEBUFF-MODIFIED` tests | **2** | `phase26a-session-lifecycle.test.mjs` and `phase32c-firebase-exchange.test.mjs` — both exact-allowlist guards updated for the additive `authMethods` field **and strengthened** with an explicit `firebaseUid`-absent assertion. Declared in `DECISIONS.md` **FB-D-114** (trail rule 5). No assertion was removed, relaxed or skipped |
| Tests **executed** by Freebuff | **YES — first execution since FB-002** | server: new suite 12/12; `npm test` **795 tests / 106 suites / 0 fail**; `npm run test:unit` 336 tests / 313 pass / 0 fail; `npm run typecheck` clean; `npm run lint` clean. mobile: new suite 4/4; `npx jest` **21 suites / 213 tests / 0 fail**; `npx tsc --noEmit` clean; `npx eslint .` clean |
| Mutation pass | **7 mutations**, each reverted | A change-password guard → cases 6, 10; B equalizer accepts → 3, 4, 5; C forgot guard → 7, 11; D reset guard → 8; E1 `toPublicUser` → 1, 12; E2 `requireAuth` → 12; F mobile Profile gate → mobile case 1. No mutated file left behind |
| Tests **deleted** by Freebuff | **0** | none |

**§2/§3 inventory note (amendment, not a rewrite):** the authoritative inventory in §2 and §3 is the
`FB-002` snapshot and remains historically accurate; it is **not** back-updated. As of FB-006 there are
**46** server test files (45 pre-existing + 1 Freebuff-created) and **16** mobile suite files (15
pre-existing + 1 Freebuff-created), and FB-006 is the first task in this trail to execute any test.
The pre-existing counts and every "Executed by Freebuff: NO" row above still describe the baseline and
should be read with that amendment.

### 4b. FB-007 (Phase 32L design) and FB-008 (Phase 32L-A implementation)

**FB-007 — four passes, none of which can produce a test result in this register.** Passes 1, 2 and 3
were analysis/documentation only; pass 4 ran a **real-Firebase runtime experiment** whose artifacts were
throwaway Node scripts outside the repository, deleted afterwards. **No repository test file was created,
modified, deleted or executed by any FB-007 pass**, and no file in `server/test/` or `mobile/__tests__/`
changed. The experiment's results are recorded in `DECISIONS.md` **FB-D-120** and are **not** a substitute
for a suite: they are measurements of *Firebase*, not of Inventory AI.

| Category | Count | Details |
| --- | --- | --- |
| `FREEBUFF-CREATED` tests | **1** | `server/test/phase32l-firebase-unlink.test.mjs` — node:test, **`MIXED`** (unit + DB-backed over the real `app.ts`), **43 cases / 3 suites**, registered in `run-tests.mjs` |
| `FREEBUFF-MODIFIED` tests | **3** | `phase23-authorization-contract.test.mjs` (declares the new route in the `AUTHENTICATED` bucket — the guard pins bucket *membership*, not counts); `phase26b-password-recovery.test.mjs` (a **tripwire** that forbids a field-removal operator was tripped by a *comment* — reworded, tripwire and logic untouched — plus a `User.save()` stub case pinned to the call R-4 replaced); `phase32b-firebase-admin.test.mjs` (pinned the verify seam's returned field set, which now includes `authTime`, plus one added narrowing case). **No assertion was removed, relaxed or skipped** (trail rule 5) |
| Tests **executed** by Freebuff | **YES** | `node --test test/phase32l-firebase-unlink.test.mjs` 43/43 pass; `npm test` **838 tests / 109 suites / 0 fail**; `npm run test:unit` 348 tests / **324 pass** / 0 fail (24 skipped by design); `npm run test:db` 540 tests / **514 pass** / 0 fail (26 skipped by design); `npm run typecheck` clean; `npm run lint` clean |
| Mutation pass | **10 mutations**, each reverted | M1 `auth_time` enforcement → DETECTED; M2 uid ownership (both layers, together) → DETECTED; M3 conditional write → DETECTED; **M4 new-password → NOT DETECTED, fixed, DETECTED**; M5 old-hash replacement → DETECTED; **M6 R-3 → NOT DETECTED, fixed, DETECTED**; M7 conditional reset completion → DETECTED; M8 session revocation → DETECTED; M9 `authMethods.firebase` → DETECTED; M10 audit row → DETECTED. Restore clean |
| Tests **deleted** by Freebuff | **0** | none |

**★ The two undetected mutations were real test weaknesses, and the fix was to strengthen the tests, not
to accept the result.** **M4** was invisible because the *controller validator* also rejects a bad
password, so removing the service-level check changed nothing observable over HTTP; a case was added that
calls the service **directly**, with no HTTP layer in front of it. **M6** was invisible because the R-3
case first ran a "while the account is linked" probe on the **same** token, which *spent* it — so the
later `usedAt: null` count was measuring the spending, not R-3's deletion; the probe now uses a
**separate** token and the assertion checks both the unused count (1 → 0) and that the specific row is
gone by hash. **M2** deliberately removes two layers at once because each is independently enforced —
removing either alone correctly leaves the suite green (defense-in-depth, matching §6 rule 6).

**§2/§3 inventory note (further amendment, not a rewrite):** as of FB-008 there are **47** server test
files (45 pre-existing + 1 FB-006 + 1 FB-008). The mobile suite count is **not** changed by FB-008 — no
mobile file was touched. The underlying §2/§3 snapshot remains the FB-002 baseline.

## 5. `DOCUMENTED HISTORICAL RESULT` claims in the repository

**Every figure below is `DOCUMENTED HISTORICAL RESULT — NOT REPRODUCED BY FREEBUFF`.** They are
recorded so a future agent can see what the project claims, with its source — never as current state.

| Claim as documented | Source document |
| --- | --- |
| Phase 04 — "verified by 65 integration tests" | `README.md` Phase Status |
| Phase 06 — "128 backend tests (Phase 06 suites included)" | `README.md` Phase Status |
| Phase 10 — lint 0/0; full backend suite 240/240 | `README.md` Phase Status |
| Phase 11 — lint 0/0; DB-free unit run 106 passed; full suite 257/257 | `README.md` Phase Status |
| Phase 15 — lint 0/0; `phase15` 7 cases; full suite 339/339 | `README.md` Phase Status |
| Phase 16 — DB-free unit run 107 passed; full suite 350/350 | `README.md` Phase Status |
| Phase 17 — full suite 350/350 (regression only, no server file changed) | `README.md` Phase Status |
| Phase 19 — `phase19-transfers` 24/24; re-run of `phase04-inventory` + `phase07a` 24/24 | `README.md` Phase Status |
| Phase 21 — suite 419 → 429 | `README.md` Phase Status |
| Phase 22 — suite 429 → 440 | `README.md` Phase Status |
| Phase 23 — suite 440 → 459; lint 0/0 | `README.md` Phase Status |
| Phase 24 — suite 459 → 469; `test:db` 320 → 330; `test:unit` 170; lint 0/0 | `README.md` Phase Status |
| Phase 27 — `test:unit` 209 pass / `test:db` 394 pass; lint exit 0 | `README.md` Phase Status |
| Phase 30A — jest 11 suites / 88 tests; `tsc --noEmit`; `eslint .`; `expo-doctor` 21/21 | `README.md` Phase Status |
| Phase 32H — 25 tests / 25 pass / 0 fail; `npm run typecheck` clean; `npm run lint` clean; phase22+phase23+TS-3 guards 60 pass / 0 fail; a seven-mutation pass | `CLAUDE.md` §7; `docs/DEVELOPMENT_ROADMAP.md` §27K |
| Phase 26B-4 snapshot — 36/36 HTTP cases, 39 recovery cases, 209 + 394 = 603 (explicitly **not** back-updated) | `docs/DEVELOPMENT_ROADMAP.md` §27B |

**Never claimable by Freebuff without execution:** MongoDB behaviour, Firebase behaviour, EAS build
results, live API behaviour, route counts produced by the classifier, and any lint/typecheck output.

**FB-006 status:** the binding rule in §0 now has its first `EXECUTED / VERIFIED BY FREEBUFF` figures —
see §4a. No historical claim in §5 is reproduced or upgraded by them.

## 6. Rules for tests Freebuff creates (owner-approved naming)

1. **Name:** `fb-<task-id>-<topic>.test.mjs` (FB-D-002).
2. **Register** the file in `server/scripts/run-tests.mjs` in its correct list (`PURE_UNIT` /
   `PURE_DB` / `MIXED`) — otherwise `npm test` fails with exit 2. That file must be allowlisted.
3. **Declare the mode honestly** via `dbSuite(...)` / `unitSuite(...)` / jest — never present a
   DB-backed assertion as DB-free.
4. **Record** it in `TEST_BASELINE.md` §4 and in the owning task record under `Files Added`.
5. **Never** modify, weaken, rename or delete a pre-existing test to make new work pass. If a
   pre-existing test appears wrong, document the concern in `DECISIONS.md` and flag it in
   `HANDOFF.md`; do not "fix" it.
6. **Never** remove a defensive/duplicate security layer because another layer looks redundant — the
   project treats defense-in-depth as intentional (owner rule 21).
