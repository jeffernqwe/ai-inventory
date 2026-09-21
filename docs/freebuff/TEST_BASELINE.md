# TEST BASELINE — inventory, provenance and execution status

> Audit record. **Not** a test report for Claude Code's phases, and **not** a specification.
> Authoritative source for test **classification** is `server/scripts/run-tests.mjs`; for the
> DB-availability policy it is `server/test/testEnv.mjs`. This file records what Freebuff found and
> what Freebuff has (not) executed.

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
