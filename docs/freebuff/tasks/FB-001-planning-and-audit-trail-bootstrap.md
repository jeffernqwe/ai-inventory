# FB-001 — Planning, handoff onboarding and audit-trail design

> **`RETROACTIVE ENTRY`** — written during FB-002, because `docs/freebuff/` did not exist while FB-001
> ran. The clock was not read during FB-001, so its time is recorded as *not captured* rather than
> guessed. In rare cases, an entry is written later; this marker exists for exactly that.
>
> Audit record. Not architecture, not project history, not a specification.

## Task Metadata

| Field | Value |
| --- | --- |
| Task ID | FB-001 |
| Date | 2026-09-21 — **exact time not captured** (retroactive; clock not read during the task) |
| Branch | `experiment/freebuff-evaluation` |
| Starting HEAD | `d8b693a43fa778c984301656d437b087f5e0a5bc` — "feat: establish firebase account linking boundary (Phase 32H)" |
| Ending HEAD | **none** — no commit was made or authorized |
| Request source | Jeffern, across a sequence of messages in one session |
| Explicit approval status | FB-001 itself was an instruction to inspect/plan/report (read-only). Its *plan output* was later **approved with six amendments** by the owner (see `DECISIONS.md` FB-D-001…FB-D-006) |

## Requested Objective

Four requests, in order:

1. A **read-only architectural audit** with emphasis on the authentication architecture and the
   recently completed **Phase 32H**, plus a structured report on 20 named topics and the Phase 32H
   test suite.
2. A **safety/working-tree protocol** for a secondary agent: confirm branch, base and protected
   working-tree entries before any implementation.
3. A **documentation-onboarding / handoff report** (sections A–J), including documentation-vs-source
   discrepancies and uncertainties.
4. A **plan** for a separate, permanent Freebuff audit trail at `docs/freebuff/` — planning only, with
   no implementation.

## Scope

Read-only inspection of the repository, plus reports delivered in chat. **No file, no test, no
configuration, no dependency and no Git state was to change.**

## Out of Scope

Any implementation; touching the five protected working-tree entries; running database commands or
connecting to MongoDB; connecting to Firebase; network calls; installing anything; modifying
`package.json`/lockfiles; running migrations; any destructive Git command; commits; branch operations;
taking ownership of Claude Code's architecture or history.

## Initial Repository State

(same baseline as recorded in `BASELINE.md` §4; the working tree was identical before FB-001)

```
branch:  experiment/freebuff-evaluation
HEAD:    d8b693a43fa778c984301656d437b087f5e0a5bc

 M mobile/eas.json
 M server/src/services/ai/providers/http.ts
 M server/test/phase06-ai-wire.test.mjs
?? docs/superpowers/plans/2026-09-11-phase-18c-core-list-screens.md
?? docs/superpowers/plans/2026-09-11-phase-18e-secondary-screens.md

3 files changed, 137 insertions(+), 15 deletions(-)   (tracked only; nothing staged)
```

- Protected-file content was **not read** (only diff `--stat`); intent `AUTHORSHIP UNKNOWN`.
- Environment: Windows host, bash tooling; a `ripgrep` invocation failed with `ENOENT`
  (host-absolute path deliberately not recorded).

## Files Inspected

**Server (read-only):** `src/app.ts`, `src/routes/auth.routes.ts`,
`src/controllers/firebaseAuth.controller.ts`, `src/services/firebaseLink.service.ts`,
`src/services/firebaseAuth.service.ts`, `src/services/auth.service.ts`, `src/services/session.service.ts`,
`src/services/firebase/{index,tokenVerifier,firebaseErrors,adminApp}.ts`, `src/config/{firebase,jwt}.ts`,
`src/middlewares/authenticate.ts`, `src/models/{user,session}.model.ts`, `src/constants/{roles,audit}.ts`,
`src/utils/validate.ts` (Firebase validators), `package.json`, `scripts/run-tests.mjs`, `test/testEnv.mjs`.

**Tests (read-only):** `test/phase32h-firebase-linking.test.mjs`, `test/phase32c-firebase-exchange.test.mjs`
(header), `test/fakes/firebaseVerifier.mjs`, `test/phase23-authorization-contract.test.mjs`
(bucket declarations), plus the full file listing of `server/test/`.

**Mobile (read-only):** `lib/firebase.ts`, `lib/firebase-auth.ts`, `lib/auth.tsx`, `lib/client.ts`,
`package.json`, plus the full file listing of `mobile/__tests__/`.

**Documentation (read-only):** `CLAUDE.md`, `README.md`, `docs/SYSTEM_SPECIFICATION.md` (§7, §29, §31,
§48), `docs/DEVELOPMENT_ROADMAP.md` (§3 and §27J/§27K region), the Firebase design doc (§7, §9–§14,
§14A, §14B, §15–§22), both Phase 18 plan documents, and the directory listings of `docs/`.

## Existing Architecture Understood

Only what the tasks required, and only by citation — the authoritative documents are
`docs/SYSTEM_SPECIFICATION.md`, `docs/DEVELOPMENT_ROADMAP.md`, `CLAUDE.md` and the Firebase design doc.
No architecture, schema, RBAC matrix or policy is restated in this record (owner decision FB-D-003).

## Existing Tests Discovered

45 server test files and 15 mobile test files, all classified `PRE-EXISTING` / `CLAUDE-CODE /
HISTORICAL`, with mode classification taken from `server/scripts/run-tests.mjs`
(`PURE_UNIT` 10 / `PURE_DB` 15 / `MIXED` 20). Full inventory in `TEST_BASELINE.md`.

**Tests created by Freebuff: none. Modified: none. Executed: none.**

## Plan

FB-001 was an inspection task, so its "plan" output is the audit-trail design that FB-002 implements.
Recorded here in summary (the full text was delivered in chat and approved with amendments):

1. Create only `docs/freebuff/` (no root `FREEBUFF.md`, no `AGENTS.md`, no alternative specs).
2. Files: `README.md`, `MASTER_LOG.md`, `BASELINE.md`, `DECISIONS.md`, `TEST_BASELINE.md`,
   `HANDOFF.md`, `tasks/` (+ optional `tasks/_TEMPLATE.md`, later approved).
3. Historical Claude Code work represented as **attributed index entries only**.
4. Existing tests recorded with provenance and a historical-vs-executed distinction.
5. Future Freebuff tests distinguished by provenance **and** a naming convention (later approved).
6. Every action logged in an append-only ledger plus a per-task record.
7. Git state captured with an identical read-only command set before and after every task, plus
   protected-file SHA-256 checks.
8. Protected files enforced by five layers (never allowlisted, hashes, STOP condition, no staging, verbatim restatement).
9. Planned vs actual compared as `PLANNED` / `IMPLEMENTED` / `UNPLANNED`, with an allowlist conformance rule.
10. Handoff written to answer the owner's 17 questions operationally.
11. Secrets excluded by rule (names only; never values; `.env` never read).
12. Authority headers + a no-duplication rule prevent this layer becoming a second source of truth.
13. Additional safety risks enumerated (bootstrap paradox, untracked-file collision, drift-as-spec,
    append-only contradictions, host-path leakage, the `run-tests.mjs` classification trap, LF/CRLF
    hazard, drift-fixing creep, timestamp integrity, DB-backed tests as risky-by-category, audit
    burden, my own audit becoming a spec, inference-as-policy).

## Approval

The FB-001 plan was reviewed and **approved with six decisions/amendments** (2026-09-21) — recorded as
`OWNER DECISION` FB-D-001…FB-D-006 and FB-D-007/008/009 in `DECISIONS.md`. The approval for FB-002's
implementation is quoted in the FB-002 task record.

## Actions

1. `git branch --show-current`, `git branch -vv`, `git status`, `git status --short`,
   `git diff --stat`, `git diff --cached --stat`, `git log --oneline -8` — read-only.
2. Read-only file inspection (full list above) and directory/glob reconnaissance.
3. Three chat reports produced: the architecture audit, the plan/safety protocol acknowledgment, and
   the documentation-onboarding report (A–J), followed by the audit-trail plan.

## Changes

**None.** No file was created, modified, renamed or deleted; nothing was staged; no branch, index or
working-tree state changed.

## Verification

| Check | Command | Executed? | Result |
| --- | --- | --- | --- |
| Branch/base identity | `git branch --show-current`, `git rev-parse HEAD` | YES | `experiment/freebuff-evaluation` @ `d8b693a…` |
| Working tree unchanged by FB-001 | `git status --short`, `git diff --stat` | YES | identical to the pre-FB-001 snapshot |
| Tests / lint / typecheck / build | — | **NO** | **NOT RUN.** No test, typecheck, lint or build was executed in FB-001 |
| Database / Firebase / EAS / network | — | **NO** | **NOT RUN, NOT CONTACTED** |
| Architecture claims | — | — | `SOURCE-CODE OBSERVATION` where cited to a file; otherwise `DOCUMENTED FACT`/`REASONED, NOT VERIFIED` |

All test/lint/build totals quoted in FB-001's reports were
`DOCUMENTED HISTORICAL RESULT — NOT REPRODUCED BY FREEBUFF`.

## Failures / Unexpected Results

1. A vendored `ripgrep` invocation failed with `ENOENT` (host-absolute path redacted); some searches
   had to be rephrased or re-scoped. **No repository effect.**
2. Several `code_search` calls returned nothing until the pattern/cwd was adjusted — an environment
   behaviour, not a repository finding.
3. No unexpected repository state was discovered: the working tree matched the documented baseline, and
   `docs/freebuff/` did not exist.

## Final Diff Review

```
git status --short
 M mobile/eas.json
 M server/src/services/ai/providers/http.ts
 M server/test/phase06-ai-wire.test.mjs
?? docs/superpowers/plans/2026-09-11-phase-18c-core-list-screens.md
?? docs/superpowers/plans/2026-09-11-phase-18e-secondary-screens.md

git diff --stat
 mobile/eas.json                          |   2 +-
 server/src/services/ai/providers/http.ts |  50 ++++++++++++----
 server/test/phase06-ai-wire.test.mjs     | 100 ++++++++++++++++++++++++++++++-
 3 files changed, 137 insertions(+), 15 deletions(-)
```

- `PLANNED`: no file changes.
- `IMPLEMENTED`: no file changes.
- `UNPLANNED`: **none.**
- Protected-file violations: **none** (files untouched; content not read).
- Unrelated modifications: **none.**

## Final Outcome

`SUCCESS` — documentation/planning only; the repository was not modified.

---

## FB-001 historical audit artifact

> **Captured under owner decision FB-D-003.** This section is a record of **Freebuff observations,
> documented discrepancies, evidence references and uncertainty notes** from the FB-001 audit. It is
> **NOT** an architecture specification, does **not** duplicate the Inventory AI architecture, and
> does **not** override any authoritative document. Where it names a fact, it names the evidence path.
> The architecture narrative Freebuff produced during FB-001 lives only in that session's chat report
> and is deliberately **not** copied here, precisely to avoid creating a competing specification.

### Observations and documented discrepancies (evidence references)

Each item below is one line; the full entry, evidence, confidence and classification live in
`DECISIONS.md`.

| ID | One-line observation | Class |
| --- | --- | --- |
| FB-D-101 | Documents describe the mobile app as JavaScript; the source is TypeScript (declared + ~100 `.ts`/`.tsx` files) | `SOURCE-CODE OBSERVATION` |
| FB-D-102 | Phase 18 plans say "no test runner"; mobile has jest + jest-expo with 15 suites | `SOURCE-CODE OBSERVATION` |
| FB-D-103 | The 18E plan says "not started" and prescribes an AI co-author trailer; the project now records 18E shipped and forbids such trailers | `DOCUMENTED FACT` |
| FB-D-104 | Phase 18 plans pin sha256 of `_layout.js`/`SignOutIcon.jsx`; the files are `.tsx` and the freeze was later lifted | `SOURCE-CODE OBSERVATION` |
| FB-D-105 | Design-doc route-count snapshots (60 → 62 / 6 → 8) vs a source-read count of 68 (47/11/10/0) — method caveat recorded | `SOURCE-CODE OBSERVATION` |
| FB-D-106 | Spec §48 and the 30A/32F narratives say no EAS build exists; the 32G record says three do — not verifiable from the repository | `DOCUMENTED FACT` + uncertainty |
| FB-D-107 | M1 vs M2 is recorded as an open decision; the shipped mobile code is the M2 (JS SDK) shape | `SOURCE-CODE OBSERVATION` |
| FB-D-108 | Spec §31 lists a `/api/businesses` module; no such mount exists | `SOURCE-CODE OBSERVATION` |
| FB-D-109 | README endpoint tables omit the recovery, Firebase, barcode and health sub-probe routes | `SOURCE-CODE OBSERVATION` |
| FB-D-110 | The roadmap's Phase Overview/body lack sections for Phases 12/13/14B (the roadmap itself says so) | `DOCUMENTED FACT` |
| FB-D-111 | Every test/lint/build count in the docs is historical; Freebuff reproduced none | `DOCUMENTED HISTORICAL RESULT` |

### Evidence references (what a reader can re-derive from source)

The audit's source-verified statements can be re-derived from, at minimum:
`server/src/routes/auth.routes.ts`, `server/src/controllers/firebaseAuth.controller.ts`,
`server/src/services/firebaseLink.service.ts`, `server/src/services/firebaseAuth.service.ts`,
`server/src/services/auth.service.ts`, `server/src/services/session.service.ts`,
`server/src/services/firebase/tokenVerifier.ts`, `server/src/config/jwt.ts`,
`server/src/middlewares/authenticate.ts`, `server/src/models/{user,session}.model.ts`,
`server/src/constants/roles.ts`, `server/src/app.ts`, `server/src/utils/validate.ts`,
`server/test/phase32h-firebase-linking.test.mjs`, `server/test/phase23-authorization-contract.test.mjs`,
`mobile/lib/{firebase,firebase-auth,auth,client}.ts`.

### Uncertainty and inference notes (not decisions — see `DECISIONS.md` Part 3)

| ID | Note | Confidence |
| --- | --- | --- |
| FB-I-01 | "Phase 32I" has **no defined scope** in the repository; equating it with Google Sign-In would be an inference | high |
| FB-I-02 | The two untracked protected plan documents read as historical phase-18 planning artifacts rather than a current queue | medium |
| FB-I-03 | The three tracked protected diffs look related to an AI-provider/test workflow by path; intent `AUTHORSHIP UNKNOWN` (content not read) | low-medium |
| — | Route totals (FB-D-105) came from **reading source**, not from executing the Phase 23 classifier; treat as indicative only | medium-high |
| — | EAS build history, Firebase project state, MongoDB behaviour and live API behaviour were **never contacted or verified** | n/a |

### What this artifact must not be used for

Do not cite it as authority for architecture, RBAC, schema, Firebase policy or phase scope. Do not
"fix" any drift it lists. Do not treat its route totals as canonical without running the classifier.

## Claude Code Handoff

- **Changed:** nothing.
- **Not changed:** the entire repository, including the five protected entries.
- **Inspect first:** nothing is required; FB-001 left the repository byte-identical.
- **Unresolved questions:** whether the owner wants the drift observations acted on (they are recorded,
  not scheduled).
- **Known risks:** none introduced by FB-001.
- **Tests to trust:** none from FB-001 — nothing was executed.
- **Tests still needing a run:** all of them (see `TEST_BASELINE.md`).
