# HANDOFF — Freebuff → next primary agent (Claude Code)

> Operational summary. **Not** architecture, **not** project history, **not** a specification.
> Authoritative sources remain `docs/SYSTEM_SPECIFICATION.md`, `docs/DEVELOPMENT_ROADMAP.md`,
> `CLAUDE.md`, `docs/superpowers/specs/2026-09-18-firebase-auth-design.md`.
> Last updated by **FB-005** (covers FB-003, FB-004, FB-005).

---

## 1. "Did Freebuff touch this repository?" — the 17 answers

**The answers below are the FB-002 → FB-005 snapshot.** FB-006 changed several of them - see §1a.
The rows are not rewritten; a later task's answers belong in a later block.

| # | Question | Answer (as of FB-002) |
| --- | --- | --- |
| 1 | Did Freebuff touch the repository? | **Yes — documentation only.** Five tasks ran: FB-001 (read-only inspection/planning), FB-002 (created `docs/freebuff/`), FB-003 (read-only audit of the trail), FB-004 (read-only route-inventory verification), FB-005 (documentation corrections). No source, test or config file was ever changed; **one** existing project document changed under explicit authorization — `docs/superpowers/specs/2026-09-18-firebase-auth-design.md` **§2.6 only** (FB-D-113). |
| 2 | When? | FB-001: 2026-09-21, exact time not captured. FB-002: pre-creation capture `2026-09-21T18:58:35Z` UTC (host-local `2026-09-22 02:58:35`). FB-003: 2026-09-21, mid-task clock 19:07 UTC. FB-004: between FB-003 and FB-005's approval, time not captured. FB-005: implementation started 2026-09-21 19:42 UTC. |
| 3 | What task was it performing? | Audit/onboarding reconnaissance, creating the trail (explicitly approved), auditing the trail, verifying the route-inventory drift, and correcting the FB-003/FB-004 findings (explicitly approved). |
| 4 | What did it inspect? | Server auth/Firebase/session/RBAC modules, server + mobile tests, mobile Firebase/session modules, and the authoritative docs. See the two task records. |
| 5 | What did it change? | Nine new files under `docs/freebuff/` (FB-002); three more task records under `docs/freebuff/tasks/` (FB-003/FB-004/FB-005, created by FB-005); the approved trail-internal corrections in `README.md`, `MASTER_LOG.md`, `DECISIONS.md`, `HANDOFF.md`, `TEST_BASELINE.md` §4 (FB-005); **and §2.6 only** of the design doc (FB-005, owner decision FB-D-113). Nothing else. |
| 6 | Why? | To maintain a permanent, separate audit/handoff record of Freebuff activity (owner instruction). |
| 7 | Which files were affected? | `docs/freebuff/{README,MASTER_LOG,BASELINE,DECISIONS,TEST_BASELINE,HANDOFF}.md`, `docs/freebuff/tasks/{_TEMPLATE,FB-001-…,FB-002-…,FB-003-…,FB-004-…,FB-005-…}.md`, and `docs/superpowers/specs/2026-09-18-firebase-auth-design.md` (§2.6 only). |
| 8 | Which tests were executed? | **None.** |
| 9 | Which tests existed before Freebuff? | All of them: 45 server files + 15 mobile files (see `TEST_BASELINE.md`). |
| 10 | Which tests did Freebuff create? | **None.** |
| 11 | Which tests did Freebuff modify? | **None.** |
| 12 | What remains unresolved? | The §2.6 route inventory is corrected (FB-005); **FB-D-101…FB-D-104 and FB-D-106…FB-D-111 remain open observations** (no task authorized). Project-side open items are listed in §5 below (references only). |
| 13 | Were there failed attempts? | One tooling failure: `ripgrep` (`ENOENT`, host path redacted) during FB-001 and the onboarding pass; searches were rephrased/retried. No repository effect. |
| 14 | Were there warnings? | Git line-ending warning (`LF will be replaced by CRLF`) on the three tracked protected files — inherited, not caused by Freebuff. |
| 15 | Were there deviations from the plan? | **None.** FB-002 created exactly the nine approved files; FB-005 implemented exactly its approved plan (three records created, five trail files edited, §2.6 only in the design doc). The one intentional departure from FB-002's posture — editing a Claude-authored document — was itself the owner-approved plan (FB-D-113). |
| 16 | What should Claude Code inspect first? | §3 below ("inspect first"), plus `MASTER_LOG.md` FB-002 and `tasks/FB-002-….md`. |
| 17 | Anything Claude Code must not do? | Do not commit/stage Freebuff's files without an explicit instruction; do not "fix" the remaining drift observations in `DECISIONS.md`; do not treat this directory as authority; **do not revert the FB-005 §2.6 correction** (it matches the shipped Phase 23 guard); do not extend the "edit an authoritative doc" precedent without a fresh authorization. |

## 1a. FB-006 — the answers that changed (Phase 32K)

FB-006 is the first task in this trail to change **production code**. It is a phase-authorized
implementation (the brief states: *"This implementation is authorized as: `FB-006`"*), not an audit.

| Q | FB-006 answer |
| --- | --- |
| 5 — what did it change? | **Production source and tests, for the first time.** 11 modified files (3 server modules, `run-tests.mjs`, 2 pre-existing test files, 2 mobile files, 3 docs) + 3 added files (2 tests, this task's record) + the trail files this task updates. See the FB-006 record. |
| 8 — which tests were executed? | **Yes — the first execution in this trail.** `npm test` **795 tests / 106 suites / 0 fail**; `npm run test:unit` 336 tests / 313 pass / 0 fail; `npm run typecheck`, `npm run lint` clean; `npx jest` **21 suites / 213 tests / 0 fail**; `npx tsc --noEmit`, `npx eslint .` clean. |
| 10 — which tests did Freebuff create? | **2:** `server/test/phase32k-firebase-password-boundary.test.mjs` (`PURE_DB`, 12 cases, registered in `run-tests.mjs`), `mobile/__tests__/phase32k-password-capability-gating.test.tsx` (4 cases). Created as `fb-006-*`; renamed to the project series by owner decision (FB-D-115). |
| 11 — which tests did Freebuff modify? | **2 pre-existing exact-allowlist guards:** `phase26a-session-lifecycle.test.mjs` and `phase32c-firebase-exchange.test.mjs` — updated for the additive `authMethods` field **and strengthened** with an explicit `firebaseUid`-absent assertion. Declared in FB-D-114 (trail rule 5). **This is the one change a reviewer should check by hand.** |
| 12 — what remains unresolved? | **Commit scope and test naming were both decided by the owner** during FB-006 (commit the FB-006-clean files only; rename the tests to `phase32k-*`). Still open: **O-1 / Phase 32L** unlink + last-authentication-method. **O-2 is closed** by FB-006. |
| 15 — deviations from the plan? | The two pre-existing test files above were **not planned** (they failed against the correct implementation) and are declared rather than smuggled. Nothing else deviated. **Nothing was staged or committed.** |
| 17 — anything Claude Code must not do? | Do not weaken the two boundary guards (they are doubly checked and each has its own test). Do not delete a retained `passwordHash` without resolving O-1. Do not describe the recovery path's residual timing term as closed — it is unchanged and still only partially mitigated. |

- **Render was not touched by any task, including FB-006.**
- **No runtime verification** exists for FB-006: no build, no device, no live Firebase project.

## 1b. FB-007 / FB-008 — the answers that changed (Phase 32L)

| # | Question | Answer (as of FB-008) |
| --- | --- | --- |
| 3 | Files modified? | **Yes.** FB-007 modified **none** (four passes: analysis, refinement, documentation-only verification, then a runtime experiment whose scripts lived outside the repository). **FB-008 added 4 and modified 12** — see §2. No mobile file was touched |
| 8 | Tests created / modified? | **Yes, by FB-008 only.** One new server suite (43 cases, `MIXED`). Three pre-existing suites modified — one to **declare** the new route, two because a pinned injection point moved. No assertion was weakened (trail rule 5) |
| 9 | Tests executed? | **Yes, by FB-008:** full server suite **838 / 109 suites / 0 fail**, `test:unit` 348 (324 pass), `test:db` 540 (514 pass), typecheck and lint clean. FB-007 executed **no** repository test (its runtime experiment measured *Firebase*, not Inventory AI) |
| 10 | Runtime verified? | **No.** FB-008 was **not** runtime-verified — no build, no device, no emulator, no live API call, and **no real unlink executed**. The Phase 32L runtime experiment exercised the **real Firebase project**, not the Inventory AI endpoint |
| 16 | Committed? | **No.** HEAD is unchanged at `8af1d49`; nothing staged; nothing pushed. FB-008's proposed message is recorded in its task record |
| 17 | Deployed / Console / schema touched? | **No** on every count. **No schema or index change** — the design is deliberately schema-free |

**The single most important answer:** the Phase 32L runtime experiment **refuted the project's own
recorded assumption** that Firebase refuses to remove the last provider — it succeeded, leaving an
account with zero providers (calibrated against `updatePassword`, which *was* refused at the same session
age). **The last-authentication-method rule must therefore be enforced server-side and never delegated
to Firebase.** See `DECISIONS.md` **FB-D-119** / **FB-D-120**.

## 2. Current state

| Field | Value |
| --- | --- |
| Branch | `experiment/freebuff-evaluation` |
| HEAD | `8af1d49` — "feat: enforce firebase password authority boundary (Phase 32K)", the **first Freebuff commit ever made** (FB-006, owner-authorized scope). It sits above `6bac86e2`, which was HEAD through FB-001–FB-005 and in turn above `d8b693a` (Phase 32H). **Unchanged through FB-007 and FB-008** |
| Freebuff commits | **1:** `8af1d49` (FB-006) — 15 files, +1488/−36: the FB-006-clean set only. **FB-007 and FB-008 created none** (FB-008 stops before the commit and reports its proposed message) |
| Files added by Freebuff | **15:** 12 under `docs/freebuff/` — 9 at FB-002 + task records FB-003/004/005, all now **tracked** (committed by the `docs:` FB-005 commit `6bac86e2`) — plus, at FB-006, `server/test/phase32k-firebase-password-boundary.test.mjs`, `mobile/__tests__/phase32k-password-capability-gating.test.tsx` and `docs/freebuff/tasks/FB-006-firebase-password-boundary.md` |
| Files modified/deleted by Freebuff | **Modified (FB-005):** the four trail files in Q5 + `TEST_BASELINE.md` §4 + the design doc **§2.6 only**. **Modified (FB-006):** 11 production/doc files — see §1a. **Deleted: none** |
| Tests run by Freebuff | **FB-006 and FB-008: yes** (see §1a, §1b). FB-001–FB-005 and FB-007: none |
| Repository commit state | **Partially committed.** FB-006's clean set is in `8af1d49`. Everything else remains deliberately uncommitted, and each reason is recorded: `docs/freebuff/`'s post-commit notes are uncommitted by construction; `README.md` and `docs/DEVELOPMENT_ROADMAP.md` carry the Phase 32K entries **plus** uncommitted Phase 32I/32J work; `mobile/lib/auth.tsx`, `mobile/app/login.tsx` and `mobile/lib/firebase-auth.ts` are Phase 32J work. **FB-007 and FB-008 added more to that uncommitted set** — the FB-008 server files and the trail records — and are likewise uncommitted. Staging/committing any of it requires a separate explicit instruction. **Nothing has been pushed.** |
| Current phase | **Phase 32L-A is implemented but NOT committed and NOT runtime-verified.** The unlink endpoint exists server-side; **the mobile half (Phase 32L-B) does not exist**, so nothing in the running app can reach it yet |

## 3. Inspect first

1. `docs/freebuff/MASTER_LOG.md` — the FB-001 through FB-005 entries (FB-001–FB-004 are `RETROACTIVE ENTRY`; FB-005 is self-recorded).
2. `docs/freebuff/tasks/FB-002-create-freebuff-audit-trail.md` — exactly what FB-002 created and verified.
3. `docs/freebuff/BASELINE.md` §3 — the protected-file hashes, so you can confirm they are still intact.
4. `docs/freebuff/DECISIONS.md` — owner decisions vs Freebuff observations (FB-D-101…FB-D-111 are **observation only**; FB-D-112 is the corrected route-inventory observation; FB-D-113 authorises the §2.6 correction).
5. `docs/freebuff/TEST_BASELINE.md` §5 — every quoted test count is `DOCUMENTED HISTORICAL RESULT — NOT REPRODUCED BY FREEBUFF`.
6. `docs/freebuff/tasks/FB-004-verify-route-inventory-drift.md` — the drift evidence (68 vs 67, two independent counting methods).
7. `docs/freebuff/tasks/FB-005-documentation-correction-plan.md` — the §2.6 correction and its verification.
8. `docs/freebuff/tasks/FB-006-firebase-password-boundary.md` — the Phase 32K implementation: the two credential defects, the boundary, the seven-mutation pass, and the two pre-existing tests it had to update.
9. `server/src/services/auth.service.ts` → `verifyPassword` and `changePassword`, then `mobile/app/(app)/profile.tsx` — the FB-006 change surface a reviewer should read first.

## 4. Protected files — do not touch

```
mobile/eas.json
server/src/services/ai/providers/http.ts
server/test/phase06-ai-wire.test.mjs
docs/superpowers/plans/2026-09-11-phase-18c-core-list-screens.md
docs/superpowers/plans/2026-09-11-phase-18e-secondary-screens.md
```

Verified byte-identical before and after FB-002 (hashes in `BASELINE.md` §3). Their content was **not
read** by Freebuff; their intent is `AUTHORSHIP UNKNOWN`.

## 5. Project-side open items — references only (Freebuff decided nothing)

Freebuff lists these **only** so a returning agent knows they exist. They live in
`docs/SYSTEM_SPECIFICATION.md` §29 and `docs/superpowers/specs/2026-09-18-firebase-auth-design.md`
§14A.5 (`O-1` … `O-11`), with dispositions recorded in `docs/DEVELOPMENT_ROADMAP.md` §27B/§27D/§27E.
Freebuff neither restates nor resolves any of them, and **Phase 32I remains undefined** — Freebuff
did not infer it (`FB-I-01`).

## 6. Known risks Freebuff flags for the next agent

| Risk | Why it matters | Freebuff's mitigation |
| --- | --- | --- |
| Line-ending normalization on the protected tracked files | A `git add` or an edit could rewrite whole files and bury the real diff | Hashes recorded; never stage; never format |
| `docs/freebuff/` is untracked | A future `git add -A` would sweep the audit files in (and possibly the protected ones too) | Stage by explicit path only; this directory is intentionally uncommitted |
| Drift temptation | The drift list looks like a TODO list; it is not | `DECISIONS.md` FB-D-100 states it is observation only |
| Test-count drift in docs | Quoted totals are historical snapshots | `TEST_BASELINE.md` §0/§5 labelling rule |
| New test file breaks `npm test` | `scripts/run-tests.mjs` exits 2 on an unclassified file | Documented in `TEST_BASELINE.md` §1; allowlist that file if a task adds a test |
| Freebuff has now edited a Claude-authored authority (design doc §2.6) | A one-off, owner-authorized, minimal correction — not a precedent | FB-D-112/FB-D-113 record it; scope was §2.6 only; any further edit needs fresh authorization |
| Freebuff has now modified **pre-existing tests** (FB-006) | Trail rule 5 forbids modifying a pre-existing test to make new work pass, and two exact-allowlist guards genuinely failed against the authorized additive field | FB-D-114 records it; both were **strengthened, not weakened** (no assertion removed) — they remain the only such files |
| A **commit** is now overdue and its scope is non-obvious | The brief asked for a commit, but the changed files also carry uncommitted Phase 32I/32J hunks; committing sweeps that work in | Deliberately **not** taken unilaterally; the scope is the owner's call and was flagged in the FB-006 report |
| FB-006 has **no runtime verification** | Everything it proves is a test/lint/typecheck result; the boundary has never been exercised on a device | Stated in the record, the roadmap §27M and the README entry — do not read it as observed behaviour |

## 7. Pending work

**FB-006 is the last executed task** (Phase 32K — the Firebase password authority boundary). It is
implemented and statically verified; `docs/freebuff/` and every production change remain deliberately
**uncommitted**.

Waiting on the owner, in priority order:1. **The remaining uncommitted work** — the Phase 32K README entry and roadmap §27M are written but
   uncommitted because those files also carry Phase 32I/32J changes; so is all of Phase 32I/32J itself,
   and so are the two FB-006 post-commit notes.
2. **O-1 / Phase 32L** — the unlink policy and last-authentication-method protection. Now more
   pointed: a retained `passwordHash` is **inert while `firebaseUid` is set**, so clearing the uid
   without a last-method rule would make it live again.
3. **Whatever Phase 32L's authorization is** — not inferred by Freebuff (FB-I-01).

The remaining FB-D drift entries are observations, not tasks. Any next task requires a fresh,
explicit approval naming its scope — an earlier approval is not transferable.
