# Freebuff MASTER LOG — append-only activity ledger

> Audit record of Freebuff activity. Not architecture, not project history, not a specification.
> Authoritative sources: `docs/SYSTEM_SPECIFICATION.md`, `docs/DEVELOPMENT_ROADMAP.md`, `CLAUDE.md`,
> `docs/superpowers/specs/2026-09-18-firebase-auth-design.md`.

**Log rules**
1. **Append-only.** An existing entry is never edited, reordered or deleted.
2. A correction is a **new** block that names the entry it corrects (`CORRECTION OF FB-NNN`).
3. Every task gets a unique, never-reused `FB-NNN` id.
4. `DOCUMENTED HISTORICAL RESULT` is always distinguished from `EXECUTED / VERIFIED BY FREEBUFF`
   (see `README.md` §1). No historical result is ever presented as reproduced.
5. Secrets are never recorded — see `README.md` §10.
6. Entries written after the fact carry the marker **`RETROACTIVE ENTRY`** and state why.

---

## FB-001 — Planning, handoff onboarding and audit-trail design

**`RETROACTIVE ENTRY`** — written during FB-002, because this directory did not exist while FB-001 ran.
The clock was not read during FB-001, so its time is recorded as unknown rather than guessed.

| Field | Value |
| --- | --- |
| Task ID | FB-001 |
| Date/time | 2026-09-21 — **exact time not captured (retroactive; clock not read during the task)** |
| Branch | `experiment/freebuff-evaluation` |
| Starting commit | `d8b693a43fa778c984301656d437b087f5e0a5bc` (Phase 32H) |
| Ending commit | none — no commit was made or authorized |
| Working-tree state before | 3 modified tracked + 2 untracked protected entries; nothing staged |
| Working-tree state after | **identical** — FB-001 created and modified nothing |
| Task requested | (a) read-only architectural audit of the auth surface incl. Phase 32H; (b) confirm branch/base and protected files; (c) documentation-onboarding report; (d) define a separate Freebuff audit trail and plan `docs/freebuff/` |
| Task classification | **SAFE** — read-only inspection, plus documentation drafts delivered in chat (nothing written to disk) |
| Plan status | Plan delivered for the audit trail; architecture audit delivered as a report |
| Approval status | Owner reviewed the plan and approved it with six decisions/amendments (see `DECISIONS.md` FB-D-001…FB-D-006). Approval is quoted in FB-002 |
| Actions performed | `git branch --show-current`; `git branch -vv`; `git status`; `git status --short`; `git diff --stat`; `git diff --cached --stat`; `git log --oneline -8`; read-only file inspection of server auth/Firebase/session modules, tests, mobile Firebase/session modules and the four authoritative docs; `list_directory`/`glob` reconnaissance |
| Files affected | **none** (no file created, modified or deleted; nothing staged) |
| Tests performed | **none** — no test, typecheck, lint or build was executed |
| Results | Audit + onboarding + audit-trail plan delivered as chat reports. All test/lint/build figures quoted were `DOCUMENTED HISTORICAL RESULT — NOT REPRODUCED BY FREEBUFF` |
| Errors | One tool-environment failure: a `ripgrep` invocation failed with `ENOENT` for the vendored binary (host-path redacted). Retried with a different invocation; some searches required rephrasing. No repository effect |
| Safety events | None. All five protected files untouched; no Git state changed; no DB, Firebase, network, install or build action |
| Final outcome | **SUCCESS** (planning/documentation only — no repository change) |
| Handoff notes | The audit-trail plan was approved in FB-002. The observed documentation/source discrepancies from FB-001 are recorded as `SOURCE-CODE OBSERVATION` entries in `DECISIONS.md` (FB-D-101…FB-D-110) and referenced from `BASELINE.md` §8 — as observations only; nothing was corrected |

**FB-001 artifact:** the earlier architecture audit is captured in
`tasks/FB-001-planning-and-audit-trail-bootstrap.md` **only** as Freebuff observations, documented
discrepancies, evidence references and uncertainty notes (owner decision 3). It is not an
architecture specification and does not duplicate or override any authoritative document.

---

## FB-002 — Create and bootstrap the Freebuff audit trail (`docs/freebuff/`)

**`RETROACTIVE ENTRY (self-recorded)`** — this entry is written *by the task it describes*, during the
task. The audit directory cannot exist before this task creates it, so the record of its own creation
is necessarily retroactive. The entry was authored **before verification**, and the final verification
results are appended as a post-verification addendum below (append-only; the block above it is not
rewritten).

| Field | Value |
| --- | --- |
| Task ID | FB-002 |
| Date/time | Pre-creation capture: `2026-09-21T18:58:35Z` UTC (`2026-09-22 02:58:35` host-local, zone label as reported by the host). Time source: the host clock, read by Freebuff |
| Branch | `experiment/freebuff-evaluation` |
| Starting commit | `d8b693a43fa778c984301656d437b087f5e0a5bc` |
| Ending commit | **none — no commit authorized; the repository is left uncommitted by design (owner decision 6)** |
| Working-tree state before | `M mobile/eas.json`, `M server/src/services/ai/providers/http.ts`, `M server/test/phase06-ai-wire.test.mjs`, `?? docs/superpowers/plans/2026-09-11-phase-18c-core-list-screens.md`, `?? docs/superpowers/plans/2026-09-11-phase-18e-secondary-screens.md`; `git diff --stat` = 3 files, +137/−15; nothing staged; `docs/freebuff/` absent |
| Working-tree state after | identical protected entries, **plus nine new untracked files under `docs/freebuff/` only** |
| Task requested | Create and bootstrap the separate `docs/freebuff/` audit trail per the approved FB-001 plan and the six owner amendments |
| Task classification | **SAFE** — creates new documentation inside a new directory; modifies no existing file; no code, config, dependency, DB, Firebase, network or build action |
| Plan status | Approved (`GO — implement the Freebuff audit trail.`) after review, with amendments |
| Approval status | **Explicit owner approval received** for FB-002 only, naming the exact nine allowed files. Approval does **not** extend to a commit, to any file outside `docs/freebuff/`, or to any later task |
| Actions performed | Pre-creation read-only capture + `sha256sum` of the five protected files; creation of the nine approved files; post-creation read-only verification; full new-file review |
| Files affected | **Added (9):** `docs/freebuff/README.md`, `MASTER_LOG.md`, `BASELINE.md`, `DECISIONS.md`, `TEST_BASELINE.md`, `HANDOFF.md`, `tasks/_TEMPLATE.md`, `tasks/FB-001-planning-and-audit-trail-bootstrap.md`, `tasks/FB-002-create-freebuff-audit-trail.md`. **Modified: none. Deleted: none** |
| Tests performed | **none** — no test, typecheck, lint or build executed (none is relevant to documentation-only creation, and none was approved) |
| Results | See the post-verification addendum below |
| Errors | See the post-verification addendum below |
| Safety events | None recorded; protected-file hashes unchanged pre→post (see addendum) |
| Final outcome | **SUCCESS** (documentation-only creation; repository left uncommitted) |
| Handoff notes | Entry point for the next agent is `docs/freebuff/HANDOFF.md`. `docs/freebuff/` is untracked and uncommitted by design. No later task may begin without a fresh explicit approval |

### FB-002 — post-verification addendum

**Appended after the post-creation verification pass, read at `2026-09-21T19:01:00Z` UTC**
(host-local `2026-09-22 03:01:00`). The FB-002 block above was authored *before* verification; this
addendum is the separate, later pass (the earlier text was not rewritten).

| Field | Value |
| --- | --- |
| Ending working-tree state | 3 modified protected entries (unstaged) + 11 untracked = the 2 protected plan documents + **exactly 9** new `docs/freebuff/` files |
| `git diff --stat` | **unchanged** from baseline: 3 files, +137/−15 |
| `git diff --name-only` | `mobile/eas.json`, `server/src/services/ai/providers/http.ts`, `server/test/phase06-ai-wire.test.mjs` — the protected three only |
| Protected hashes, post-task | **identical to baseline for all five** (values in `BASELINE.md` §3) |
| Files created | exactly the nine allowlisted paths; `find docs/freebuff -type f \| wc -l` = **9** |
| Files created/modified **outside** `docs/freebuff/` | **none** |
| Tests executed | **none** (no test, typecheck, lint, build, DB, Firebase, EAS or network action) |
| Errors | none during creation or verification; two authoring typos were found and corrected **inside files this task created** (see the FB-002 record §Actions item 4) |
| Safety events | **none** — no STOP condition was triggered |
| Staged / committed / pushed | **none** (owner decision FB-D-006) |
| Outcome | **SUCCESS** — documentation-only creation; repository left uncommitted |

---

## FB-003 — Audit the Freebuff audit trail

**`RETROACTIVE ENTRY`** — FB-003 was a read-only audit and, by owner instruction, created no file and
wrote nothing while it ran; this block is written during FB-005, which is why it is late.

| Field | Value |
| --- | --- |
| Task ID | FB-003 |
| Date/time | 2026-09-21 (UTC); host-local zone label `MPST`. Start time not captured; mid-task clock `2026-09-21 19:07 UTC` (host clock, read once) |
| Branch | `experiment/freebuff-evaluation` |
| Starting commit | `d8b693a43fa778c984301656d437b087f5e0a5bc` (Phase 32H) |
| Ending commit | none — no commit was made or authorized |
| Working-tree state before / after | identical: the inherited baseline (3 modified protected tracked, +137/−15, nothing staged) + the nine untracked `docs/freebuff/` files |
| Task requested | Read-only audit of the nine trail files: accuracy, architecture boundary, handoff quality, Git safety ("currently uncommitted" vs "must never be committed"), scope, duplication/drift, trail quality |
| Task classification | **SAFE** — read-only inspection only |
| Plan status | Delivered as the audit's own procedure (pre-checks → read all nine → verify claims against source → findings → post-checks) |
| Approval status | Owner instruction FB-003 (read-only, report only; explicitly not an authorization to write) |
| Actions performed | Git × 5 + `sha256sum` × 5 pre and post; full read of all nine files; targeted source verification of their claims (`run-tests.mjs`, `testEnv.mjs`, `phase23-…test.mjs`, `app.ts`, route modules, `mobile/lib`, `mobile/__tests__`, both `package.json`s, the design doc, `README.md`); CR-byte scan of `docs/freebuff` (all LF) |
| Files affected | **none** |
| Tests performed | **none** — nothing executed |
| Results | **PASS WITH WARNINGS** — 16 PASS checks; eight findings W-1…W-8 (FB-000 id, FB-D-110 range, FB-D-105 citation, "four authoritative docs", "Modified: none" ambiguity, unconditional "never commits" wording, missing rule attribution, stale handoff), no BLOCKER |
| Errors | none |
| Safety events | none; protected hashes byte-identical pre→post |
| Final outcome | **SUCCESS** (read-only audit; nothing changed) |
| Handoff notes | Findings recorded in full in `tasks/FB-003-…md`; all eight were uncorrected at FB-003 close and were later approved for correction under FB-005 |

---

## FB-004 — Verify route inventory drift (67 vs 68)

**`RETROACTIVE ENTRY`** — read-only forensic audit; wrote nothing while it ran; recorded here during
FB-005. Ran after FB-003 and before FB-005's approval; exact wall-clock time not captured.

| Field | Value |
| --- | --- |
| Task ID | FB-004 |
| Date/time | between FB-003 and FB-005's approval (2026-09-21/22); exact time not captured |
| Branch | `experiment/freebuff-evaluation` |
| Starting commit / Ending commit | `d8b693a…` / none — no commit was made or authorized |
| Working-tree state before / after | identical to FB-003's post-state |
| Task requested | Determine whether the documented route inventory is stale by one route because Phase 32H added `POST /api/auth/firebase/link`, or whether 67 vs 68 arises from a different counting methodology |
| Task classification | **SAFE** — read-only inspection only |
| Plan status | Delivered (count from source two independent ways; trace the route through git; compare every documented figure; test each hypothesis) |
| Approval status | Owner instruction FB-004 (read-only, report only) |
| Actions performed | Git × 5 + `sha256sum` × 5 pre and post; per-module registration counts (sum 67) + `app.get('/')` = **68**; `router.use(` absence confirmed; block-level counts of the guard's declared lists (10 public / 11 authenticated / `[]` role-gated; independent gated count **47**); `git log -S "firebase/link"` → only `d8b693a`; `git log -S "47 + 10 + 10"` over the design doc → only `5d7d1df` (32F); documentation sweep of every route-count statement |
| Files affected | **none** |
| Tests performed | **none** — the Phase 23 guard was *read*, not executed; all counts are `SOURCE-CODE OBSERVATION` (source-read, two independent methods), not `EXECUTED` |
| Results | **DOCUMENTATION DRIFT CONFIRMED** — mounted set and declaration lists both give **68 = 47 gated + 11 authenticated + 10 public + 0 role-gated**; design doc §2.6 says **67 = 47 + 10 + 10**, correct through Phase 32C and never updated after Phase 32H; not a methodology difference; documentation accuracy/auditability only, authorization behaviour unchanged |
| Errors | none; one premise correction — the stale figure is in the design doc §2.6, not `docs/SYSTEM_SPECIFICATION.md` (which contains no route count) |
| Safety events | none; protected hashes byte-identical pre→post |
| Final outcome | **SUCCESS** (read-only audit; nothing changed) |
| Handoff notes | The corrected number remains unguarded by design (Phase 23 asserts bucket membership, not counts); correction of §2.6 was later approved under FB-005 |

---

## FB-005 — Documentation correction plan and implementation

**Written during the task (self-recorded)** — the planning phase produced no write; the
implementation and verification phases wrote the files listed below. The full record is
`tasks/FB-005-documentation-correction-plan.md`; this block is the ledger summary.

| Field | Value |
| --- | --- |
| Task ID | FB-005 |
| Date/time | planning approved 2026-09-22; implementation started `2026-09-21 19:42 UTC` (host clock at the first pre-check) |
| Branch | `experiment/freebuff-evaluation` |
| Starting commit | `d8b693a43fa778c984301656d437b087f5e0a5bc` (Phase 32H) |
| Ending commit | **none — owner decisions 5 and 6 leave both `docs/freebuff/` and the design doc uncommitted; commit authorization is a separate future instruction** |
| Task requested | Correct the FB-003 findings (W-1…W-8) and the FB-004 drift (design doc §2.6: 67 → 68) under an explicit owner approval with six decisions |
| Task classification | **SAFE with one exceptional step** — trail-internal edits plus ONE edit to a Claude-authored authoritative document (design doc §2.6 only), explicitly authorized, dated and attributed in place |
| Plan status | Approved ("FB-005 — GO FOR IMPLEMENTATION"), closed allowlist of nine paths |
| Approval status | **Explicit owner approval received**, including: register stays append-only (FB-D-112 as a correction entry); B-1.3 included; implementation stays under FB-005; A-8 included; nothing committed |
| Actions performed | Pre-checks + anchor verification (all anchors present); created the FB-003/FB-004/FB-005 task records; applied the approved README/MASTER_LOG/DECISIONS/HANDOFF/TEST_BASELINE corrections; applied the §2.6-only design-doc correction; post-checks + full diff review |
| Files affected | **Added (3):** `tasks/FB-003-…md`, `tasks/FB-004-…md`, `tasks/FB-005-…md`. **Modified (6):** `README.md`, `MASTER_LOG.md`, `DECISIONS.md`, `HANDOFF.md`, `TEST_BASELINE.md` (A-8 only), and `docs/superpowers/specs/2026-09-18-firebase-auth-design.md` (§2.6 only) |
| Tests performed | **none** — none relevant to a documentation-only change, none authorized |
| Results | **SUCCESS.** Verified read-only: HEAD unchanged; exactly 4 tracked-file diffs (design doc §2.6 only, +14/−5, 3 hunks all inside §2.6) + 12 untracked trail files; nothing staged or committed; all five protected hashes byte-identical pre→post; 68 = 47 + 11 + 10 + 0 re-derived from source; line 1165 and all sections outside §2.6 untouched; LF endings preserved; FB-001/FB-002 blocks and FB-D-001…111 byte-identical |
| Errors | None. Two plan-precision findings recorded (no edit required): (1) the plan's "no `67` in §2.6" check was miscalibrated — the preserved Phase 32F statement and the correction note legitimately retain `67` twice; (2) the "expect 2 `firebase/link` mentions" constant undercounted §14B.1 — the correct expectation is 3 |
| Safety events | None — no STOP condition triggered; protected files untouched |
| Final outcome | **SUCCESS** — implementation and verification complete; repository deliberately left uncommitted (owner decisions 5 and 6) |
| Handoff notes | `docs/freebuff/` remains untracked and uncommitted by design (FB-D-006); the design doc's working-tree diff is intentional and awaits separate commit authorization |

---

## FB-006 — Firebase password authority boundary & timing-equalizer credential fix (Phase 32K)

**Written during the task (self-recorded).** The full record is
`tasks/FB-006-firebase-password-boundary.md`; this block is the ledger summary. It is placed with the
other task blocks, in chronological order, rather than after the correction log.

| Field | Value |
| --- | --- |
| Task ID | FB-006 |
| Date/time | 2026-09-23 — host clock read at the final pre-commit check: `2026-09-23 06:39 UTC` |
| Branch | `experiment/freebuff-evaluation` |
| Starting commit | `6bac86e2d128215c873874a05e6249aedf28ad64` (Phase 32J work uncommitted above `d8b693a`) |
| Ending commit | **none at the time of writing — no commit, no stage, no push.** The brief's §14 commit checkpoint was deferred because a commit of the changed files would also carry the uncommitted Phase 32I/32J hunks in the shared files. The owner then decided the scope (FB-006-clean files only) — see the **post-commit note** appended at the end of this block |
| Task requested | Implement the Phase 32K boundary — for every user with `firebaseUid`, Firebase is the sole authentication authority, so local password operations do not apply — plus the credential-integrity fix its audit found, with regression tests, mutation evidence, documentation and this record |
| Task classification | **RISKY — production authentication code.** Mitigated by: tests written and proven able to fail, seven mutations, full-suite runs, and no schema/dependency/session change. No unlink, no hash deletion, no Console change, no deploy |
| Plan status | The brief itself was the frozen plan; executed in the order it specifies (preflight → tests → fixes → capability → mobile → verify → document) |
| Approval status | **APPROVED** — the brief: *"This implementation is authorized as: `FB-006`"*. The commit step inside it was **not** taken unilaterally (see Ending commit) |
| Actions performed | Read-only preflight (branch/HEAD/status/staged/protected hashes/docs-freebuff); source reading of the auth, recovery, linking, session, audit, mail, route, controller, model and middleware modules plus the test helpers and fakes; `verifyPassword` + the `DUMMY_HASH` contract; the `change-password` / `forgot-password` / `reset-password` boundary; `authMethodsFor` published by `toPublicUser` **and** `requireAuth`; mobile `AuthUser` + Profile gating; one new server suite (`PURE_DB`, registered) and one new mobile suite; seven mutations (all reverted); `npm test`, `npm run test:unit`, `npm run typecheck`, `npm run lint`, `npx jest`, `npx tsc --noEmit`, `npx eslint .`; documentation updates; this record |
| Files affected | **Added (3):** `server/test/phase32k-firebase-password-boundary.test.mjs`, `mobile/__tests__/phase32k-password-capability-gating.test.tsx`, `tasks/FB-006-firebase-password-boundary.md`. **Modified (11):** `server/src/services/auth.service.ts`, `server/src/middlewares/authenticate.ts`, `server/src/services/passwordReset.service.ts`, `server/scripts/run-tests.mjs`, `server/test/phase26a-session-lifecycle.test.mjs`, `server/test/phase32c-firebase-exchange.test.mjs`, `mobile/lib/auth.tsx`, `mobile/app/(app)/profile.tsx`, `README.md`, `docs/DEVELOPMENT_ROADMAP.md`, `docs/SYSTEM_SPECIFICATION.md` — plus the trail files this task updates (`MASTER_LOG.md`, `DECISIONS.md`, `TEST_BASELINE.md`, `HANDOFF.md`). Nothing staged or committed |
| Tests performed | **EXECUTED BY FREEBUFF:** new server suite 12/12 pass; `npm test` **795 tests / 106 suites / 0 fail**; `npm run test:unit` 336 tests, 313 pass, 0 fail; `npm run typecheck` clean; `npm run lint` clean; new mobile suite 4/4 pass; `npx jest` **21 suites / 213 tests, 0 fail**; `npx tsc --noEmit` clean; `npx eslint .` clean. Re-run after the test-file rename: same figures |
| Results | **SUCCESS.** The credential defect is closed (the timing equalizer cannot be accepted as a password or as a `currentPassword`) and the Firebase password boundary is implemented. **Seven mutations** each reddened the intended cases (A→6,10; B→3,4,5; C→7,11; D→8; E1→1,12; E2→12; F→mobile 1); all reverted with no remnant. **Two pre-existing exact-allowlist tests were modified** and are declared (FB-D-114) |
| Errors | **Two failing pre-existing suites** appeared on the first full run: `phase26a-session-lifecycle.test.mjs` and `phase32c-firebase-exchange.test.mjs`, both pinning the exact key set of a user payload and therefore correctly rejecting the additive `authMethods`. Reported rather than worked around; both were updated **and strengthened** with an explicit `firebaseUid`-absent assertion. One earlier `npx node` invocation installed an unrelated `node` package (harmless; re-invoked as `node --test`) |
| Safety events | **none.** All five protected hashes byte-identical pre→post; no stage/commit/push/reset/restore/stash/clean; `docs/freebuff/` created-in-trail only; no `.env`, credential or token read or recorded; **Render not touched**; Firebase/Google Console not touched; **no schema change**; the Phase 32J test tenant not read or modified |
| Final outcome | **SUCCESS** — implemented and statically verified; **no runtime verification** (no build, no device, no live Firebase project); repository deliberately left **uncommitted** |
| Handoff notes | (1) Commit scope decided by the owner: the FB-006-clean files only, leaving the files that also carry Phase 32I/32J work uncommitted — **applied as commit `8af1d49` (15 files, +1488/−36) after this block was written; see the post-commit note below**. (2) The new tests were created as `fb-006-*` (trail rule 1) and **renamed by owner decision to the project series `phase32k-*`** (FB-D-115). (3) The two modified pre-existing tests are the only changes a reviewer should check by hand. (4) The timing property is **reasoned, not measured**; the recovery path's residual timing term is **unchanged** and still only partially mitigated |

**Post-commit note (appended after the commit).** The owner decided the commit scope during this task,
and Freebuff made the commit with the repository's configured Jeffern identity — reported, not changed:

```
8af1d49 feat: enforce firebase password authority boundary (Phase 32K)
15 files changed, 1488 insertions(+), 36 deletions(-)
```

Committed: the three server modules, `run-tests.mjs`, the two updated pre-existing suites, the two new
suites, `mobile/app/(app)/profile.tsx`, `docs/SYSTEM_SPECIFICATION.md` and the five `docs/freebuff/`
files. **Not committed** (each also carries unrelated Phase 32I/32J work, so committing it would have
extended the owner's scope): `README.md`, `docs/DEVELOPMENT_ROADMAP.md`, `mobile/lib/auth.tsx`,
`mobile/app/login.tsx`, `mobile/lib/firebase-auth.ts`. All five protected files byte-identical; nothing
pushed. The rows above are not rewritten.

---

## FB-007 — Firebase unlink & last-authentication-method protection: audit + policy design (Phase 32L)

**Written during the task (analysis-only phase).** The full record is
`tasks/FB-007-unlink-last-method-design.md`; this block is the ledger summary.

| Field | Value |
| --- | --- |
| Task ID | FB-007 |
| Date/time | 2026-09-23 — host clock read at preflight |
| Branch | `experiment/freebuff-evaluation` |
| Starting commit | `8af1d49f83b3f4d82c7e40d894c94ab61620ab80` — `feat: enforce firebase password authority boundary (Phase 32K)` |
| Ending commit | **none — no commit, no stage, no push.** Analysis-only phase; the brief states *"There should be no implementation commit for Phase 32L yet."* |
| Task requested | Design, before any unlink capability exists, the unlink policy and the last-authentication-method invariant that keeps Case A (lockout) and Case B (silent credential reactivation) unreachable — with a threat model, session/API/database recommendations, a test plan and this record |
| Task classification | **ANALYSIS / DESIGN — read-only.** No production file, test, model, dependency, configuration, `.env` or database document touched |
| Plan status | The brief was the frozen plan; executed read-only in its order (preflight → source trace → design → report → this record) |
| Approval status | **APPROVED FOR ANALYSIS** — the brief: *"Record this work as: `FB-007`"*, under an explicit read-only forbidden list. **No owner decision was taken on the requester's behalf** |
| Actions performed | Preflight (branch/HEAD/staged/protected hashes); repository-wide search for `unlink` (returns prose only — no route, service, helper, audit action, provider field, or mobile surface); source reading of the linking, exchange, auth, recovery, session, audit, model, middleware, route and controller modules plus `lib/api.ts`, `lib/auth.tsx`, `app/(app)/profile.tsx`; test inventory (32b 55, 32c 44, 32e 12, 32h 25, 32k 12) and the `run-tests.mjs` registry; reading of specification §29, design-document §14A.4/.5, §14B, §16 and roadmap §27K/§27M/§16; the policy design; this record and its trail entries |
| Files affected | **Added (1):** `tasks/FB-007-unlink-last-method-design.md`. **Trail updated:** `MASTER_LOG.md`, `DECISIONS.md`. **Production, test, model, config, dependency and `.env` files: none.** Nothing staged or committed |
| Tests performed | **NONE — and none are possible for this phase.** No code was written, so no test can exercise it. No suite was re-run, because the working tree is byte-identical to the one FB-006 already ran in full (server 795 tests / 106 suites / 0 fail; mobile 21 suites / 213 tests / 0 fail) |
| Results | **ANALYSIS COMPLETE.** The recommendation is **policy B** — unlink is one authenticated server operation on `firebaseUid` that **mandatorily establishes a fresh local password in the same conditional write**, replacing the retained hash rather than resurrecting it, revoking all sessions, and writing exactly two audit actions that carry no uid. **No schema change.** Reported as a **Freebuff RECOMMENDATION awaiting an OWNER DECISION**, not as policy |
| Errors | **none** |
| Safety events | **none.** All five protected hashes byte-identical pre→post; no stage/commit/push/reset/restore/stash/clean; no `.env`, credential, token or tenant read; **no database write of any kind**; Render not touched; Firebase/Google Console not touched; **no unlink executed against any account** |
| Final outcome | **SUCCESS (analysis).** O-1 is now a fully-specified decision rather than an open question — but it is **still OPEN until the owner records a decision**; no implementation exists and **no runtime verification is claimed** |
| Handoff notes | (1) **Phase 32H's link route has no mobile surface at all** — the client can link nothing today; do not assume otherwise. (2) **Firebase's own last-provider refusal is insufficient and must not be relied on** — it cannot see the Mongo-side `passwordHash` in either direction. (3) **Five decisions are owner-only** (policy B vs A; route/codes; session revocation; `authMethods` shape; whether unlink requires an ACTIVE business). (4) The unlink path is the **one** place a password may be written for a `firebaseUid` account, and must be documented as that deliberate exception to Phase 32K's boundary |

**Second-pass note (decision refinement, appended after the first pass — the rows above are not rewritten).**
A continuation of the same task ID, under the brief's §18 (*"This is a continuation of FB-007"*).
Still **analysis only**; the baseline was reconfirmed identical (HEAD `8af1d49`, staged 0, five protected
hashes unchanged). Findings added, now recorded in the task record's **Extension** section:

1. **Decision 1 is pre-decided by the middleware** `[SOURCE]`: `assertActiveBusiness` runs at
   `middlewares/authenticate.ts:138` **inside `requireAuth`**, so *every* authenticated route already
   refuses a non-ACTIVE business. The only remaining question is whether to make unlink a deliberate
   *exception*, which no consistency argument supports.
2. **`auth_time` is a documented, signed, server-verifiable claim** `[FIREBASE OFFICIAL DOC]`, and the
   decoded payload is already received at `tokenVerifier.ts:148` but discarded by `toVerifiedIdentity`
   — so server-side freshness enforcement is possible at the cost of widening a Phase 32B return type.
   `checkRevoked` is `false` by the approved 32A design.
3. **★ The Admin SDK *can* unlink providers** — recorded as **FB-D-118**. `firebase-admin@14.4.0` declares
   `UpdateRequest.providersToUnlink`, plus `getUser().providerData` and `revokeRefreshTokens`; **none is
   used in `src/`**. This corrects the specification §29 / design document §14B wording that the server
   "has no API for it" — a **capability** correction only; 32H's choice not to link server-side stands.
   Runtime semantics remain `[EXTERNAL VERIFICATION REQUIRED]`.
4. **Unlinking a provider makes a later sign-in with that provider create a NEW Firebase account**
   `[FIREBASE OFFICIAL DOC]` — decisive for sequencing: a Firebase-first order leaves an unrepairable
   split-brain, since the new uid can never match the Mongo `firebaseUid`.
5. **No "last provider" error code exists** in the installed `@firebase/auth` enum, so the project's
   assertion that Firebase refuses the last provider is `[EXTERNAL VERIFICATION REQUIRED]` and must not
   be depended on.
6. **`emailVerified` has no consumer** beyond persistence — safe to clear on unlink.
7. **`authMethods` consumers are absence-tolerant**, so adding `firebase` is backward compatible without
   touching `toPublicUser`, `/api/auth/me` or the mobile gate.

The **policy B recommendation stands**, with one refinement: the business-status question is already
answered, so only **five** decisions remain owner-only. No owner decision was taken on the requester's
behalf.

**Third- and fourth-pass note (ledger completion, appended during FB-008 — the rows above are not
rewritten).** The freeze record itself flagged that this ledger described FB-007 only through its
**second** pass. Two further passes of the *same* task ID had completed without a ledger entry, and are
recorded here rather than left as a dangling follow-up:

3. **Third pass — external verification (documentation-only).** Established, from official documentation
   and the installed SDKs, that `auth_time` is a real, signed, server-verifiable claim; that the
   Admin SDK's `providersToUnlink` compiles down to `deleteProvider` on Identity Toolkit
   `accounts:update` with **no** documented last-provider restriction; and that the widely-held
   "Firebase refuses to remove the last provider" belief had **no** error code in the installed
   `@firebase/auth` enum. **No production file changed; no experiment performed.**
4. **Fourth pass — ★ real-Firebase runtime experiment + decision freeze.** The experiment ran against
   the **real** project `inventoryai-d0d20` with the installed client SDK in Node, on dedicated
   throwaway `@example.com` accounts deleted in `finally` (post-sweep: 0 left behind). It **corrected
   the repository's own assumption**: client `unlink()` of the **last** provider **succeeded**, leaving
   the account with zero providers — and a **calibrated** companion run proved the harness *can* detect
   recency enforcement, since `updatePassword` at the same 390-second session age was **refused** with
   `auth/requires-recent-login` while `unlink` was **accepted**. `reauthenticateWithCredential()` was
   observed to **re-stamp `auth_time`** (a plain forced refresh moves only `iat`). The owner then froze
   the architecture: **Option D**, client-side-only provider unlink, dedicated codes, `authMethods =
   { password, firebase }`, inherited business status, **Policy B**, and a **mandated reset-token race
   contract**. Released as `tasks/FB-007-phase-32l-decision-freeze.md`. **Documentation only — no source,
   test, schema, `.env`, dependency, MongoDB, Render or Console change; no commit.**

---

## FB-008 — Firebase unlink backend foundation + last-authentication-method contract (Phase 32L-A)

**Written during the task (implementation phase).** The full record is
`tasks/FB-008-phase-32l-a-unlink-backend.md`; this block is the ledger summary.

| Field | Value |
| --- | --- |
| Task ID | FB-008 |
| Date/time | 2026-09-23 — host clock read at preflight |
| Branch | `experiment/freebuff-evaluation` |
| Starting commit | `8af1d49f83b3f4d82c7e40d894c94ab61620ab80` — `feat: enforce firebase password authority boundary (Phase 32K)` |
| Ending commit | **none — no commit, no stage, no push.** The brief says to stop and report the proposed message unless the workflow requires a checkpoint; the proposed message is recorded in the task record |
| Task requested | Implement the **server-side** Firebase unlink foundation exactly per the binding FB-007 freeze — `auth_time` verification, the unlink endpoint, the atomic transition, the last-method invariant, session revocation, audit, `authMethods`, the error contract, and the **mandatory R-3/R-4 reset-token race fix** — with tests, mutation evidence and this record. **Backend only; no mobile work** |
| Task classification | **RISKY — production authentication code.** Mitigated by: tests written and proven able to fail, a **ten-mutation** pass, a full-suite run, and no schema/dependency/session-architecture change. No mobile flow, no provider unlink, no Console change, no deploy |
| Plan status | The FB-007 freeze was the plan; executed in the order the brief specifies (preflight → seam → service → route → race fix → guards → tests → mutation → verify → document) |
| Approval status | **APPROVED** — the owner brief authorises Phase 32L-A and binds it to the FB-007 freeze. **One deliberate deviation recorded**: `FIREBASE_REAUTHENTICATION_REQUIRED` answers **409**, not the brief's suggested 403 — see Results |
| Actions performed | Preflight (branch/HEAD/staged/protected `sha256sum`); source reading of the verify seam, linking, exchange, auth, recovery, session, audit, route, controller, model, middleware, validator, error and test-helper modules; a direct driver probe proving MongoDB range comparisons are same-type only (which changed the R-4 filter shape); implementation of the eight required items; a new 43-case suite; `npm test`, `npm run test:unit`, `npm run test:db`, `npm run typecheck`, `npm run lint`; a ten-mutation pass with two misses investigated and fixed by **strengthening the tests**; this record and the ledger entries |
| Files affected | **Added (4):** `server/src/constants/firebase.ts`, `server/src/services/firebaseUnlink.service.ts`, `server/test/phase32l-firebase-unlink.test.mjs`, `tasks/FB-008-phase-32l-a-unlink-backend.md`. **Modified (12):** `server/src/services/firebase/tokenVerifier.ts`, `server/src/services/auth.service.ts`, `server/src/services/passwordReset.service.ts`, `server/src/middlewares/authenticate.ts`, `server/src/utils/validate.ts`, `server/src/controllers/firebaseAuth.controller.ts`, `server/src/routes/auth.routes.ts`, `server/src/constants/audit.ts`, `server/scripts/run-tests.mjs`, `server/test/phase23-authorization-contract.test.mjs`, `server/test/phase26b-password-recovery.test.mjs`, `server/test/phase32b-firebase-admin.test.mjs` — plus this ledger. **No mobile file changed.** Nothing staged or committed |
| Tests performed | **EXECUTED BY FREEBUFF:** new suite 43/43 pass; `npm test` **838 tests / 109 suites / 0 fail**; `npm run test:unit` 348 tests, 324 pass, 0 fail; `npm run test:db` 540 tests, 514 pass, 0 fail; `npm run typecheck` clean; `npm run lint` clean. Suite total moved 795→838 and 106→109 suites |
| Results | **SUCCESS (implementation + static verification).** The account can no longer reach a zero-method state; the retained hash is **replaced**, never resurrected; the identity is server-derived and cannot be steered by a client; freshness is enforced from the **signed** claim and fails closed; **R-3 and R-4 close the reset-token race with no schema change**. **★ The ten-mutation pass left two undetected (M4 new-password, M6 R-3), and both were real test weaknesses, not harmless redundancy** — M4 because the controller validator masked the service-level check (fixed by calling the service **directly**), M6 because an earlier probe on the **same** token spent it so the count measured spending rather than deletion (fixed with a separate token plus a by-hash row assertion). After the fixes: **10/10 detected, restore clean**. **Deviation:** the freshness refusal is **409**, not 403, because `mobile/lib/client.ts` treats 401/403 on a token-bearing request as **session loss** — a 403 would sign a user out merely for being asked to reauthenticate. The error **code** is exactly as frozen |
| Errors | **Two test failures appeared on the first full run**, both traced rather than worked around: `phase26b-password-recovery.test.mjs`'s **tripwire** asserts the reset service contains no field-removal operator (a comment of mine mentioned one — the comment was reworded, the tripwire and logic unchanged), and its `User.save()` stub case was pinned to the call R-4 replaced; `phase32b-firebase-admin.test.mjs` pinned the verify seam's returned field set, which now includes `authTime`. Both updated, no assertion weakened |
| Safety events | **none.** All five protected hashes byte-identical pre→post; no stage/commit/push/reset/restore/stash/clean; no `.env`, credential or token read or recorded; **no schema, index or migration change**; **Render not touched**; Firebase/Google Console not touched; the Phase 32J test tenant not read or modified |
| Final outcome | **SUCCESS** — implemented and statically verified; **runtime verification is `EXPERIMENT REQUIRED`** (no build, no device, no emulator, no live Firebase call, and no real unlink executed); repository deliberately left **uncommitted** |
| Handoff notes | (1) **Phase 32L-B is the mobile half** and does not exist yet, so the endpoint is reachable only by a client that implements the flow — reauth on refusal, then the server call, then Firebase sign-out, then **optional** provider cleanup, never provider-unlink-first. (2) `authMethods = { password, firebase }` is the surface the UI gates on; **no provider-specific field exists to consume**. (3) **Provider unlink is intentionally NOT implemented** — the freeze keeps it client-side, and Admin `providersToUnlink` is verified-but-future. (4) An **orphaned Firebase identity** remains possible after a server unlink (the O-6 class): the Firebase account survives, so re-registering with the same provider stays `EMAIL_IN_USE` and the only route back is explicit link. (5) **Federated re-sign-in after unlink is still unverified** and needs a live Google credential |

---

## FB-009 — Phase 32L-A independent verification: source review + real runtime (Phase 32L-A gate)

**Written during the task (verification-only phase).** The full record is
`tasks/FB-009-phase-32l-a-verification.md`; this block is the ledger summary.

| Field | Value |
| --- | --- |
| Task ID | FB-009 |
| Date/time | 2026-09-23 — host clock read at preflight |
| Branch | `experiment/freebuff-evaluation` |
| Starting commit | `8af1d49f83b3f4d82c7e40d894c94ab61620ab80` |
| Ending commit | **none — no commit, no stage, no push.** Verification-only phase; HEAD unchanged throughout |
| Task requested | Independently verify that the Phase 32L-A implementation matches the binding FB-007 freeze — by source/diff review **and** by real runtime verification (A–H) — and report any surviving mutation with its exact reasoning |
| Task classification | **VERIFICATION ONLY.** No production code, no test, no schema, no dependency, no `.env`, no Mongo design, no Console, no deploy. It **did** execute runtime against a real Firebase project with throwaway accounts |
| Plan status | Executed in the brief's order: preflight → source review → test review → suite runs → mutation pass → **Pass 2 runtime (A–H)** → cleanup → this record |
| Approval status | **APPROVED** — the owner brief. **No implementation was performed and no owner decision was taken** |
| Actions performed | Preflight (branch/HEAD/staged/protected `sha256sum`); a fresh line-by-line read of the unlink service, the `tokenVerifier` seam, the R-4 block and every 32L-A diff; direct reading of the two M4/M6 test fixes; `npm test` / `test:unit` / `test:db` / `typecheck` / `lint`; a **ten-mutation re-run** with a startup anchor guard; **Pass 2**: a runtime harness on the real app + real MongoDB + the **real Firebase verifier**, with 7 throwaway Firebase identities created and deleted; cleanup sweep; this record and its ledger entries |
| Files affected | **Added (1):** `tasks/FB-009-phase-32l-a-verification.md`. **Trail updated:** `MASTER_LOG.md`, `DECISIONS.md`. **Production, test, model, config and `.env` files: none.** Nothing staged or committed. All harness scripts lived outside the repository and were deleted |
| Tests performed | **EXECUTED BY FREEBUFF:** `npm test` **838 tests / 109 suites / 0 fail**; `npm run test:unit` 348 / 324 pass / 0 fail; `npm run test:db` 540 / 514 pass / 0 fail; new suite alone 43/43; `typecheck` and `lint` clean. **Plus 56 runtime checks, all passing** (A 10, AUD 3, C 8, D 4, E 5, F 6, G 2, H 3, B 15) |
| Results | **PASS with two findings.** The implementation **matches the freeze on every decision** (D-1…D-9 confirmed in source; business status inherited; no provider unlink; the frozen codes; `authMethods` on both surfaces; atomic conditional write; no zero-method state). Runtime proved the end-to-end contract, including the **stale-authentication refusal with two controls**: the same 315-second-old token still **verified** (`firebase/exchange` 200) yet the unlink refused `409 FIREBASE_REAUTHENTICATION_REQUIRED` with **no mutation and no session revocation**, and a **fresh** sign-in then made the **same endpoint succeed**. Two findings: **★ FB-008's "10/10 detected" is NOT reproducible** — **M7 survives every run** and **M3 is detected only sometimes**; and one `test:unit` run reported **323 pass / 1 fail** and has **not recurred in 13 runs** |
| Errors | **★ One accidental modification, reported in the record (§20):** the mutation harness was killed by a command timeout **while M10 was applied**, leaving `AUDIT_ACTIONS.FIREBASE_IDENTITY_UNLINKED_DISABLED` in `firebaseUnlink.service.ts` — the `finally` block could not run. Restored **surgically** (not by `git restore`/`reset`) and then **proven**: correct line present once, artifact absent, all ten anchors intact, lint + `tsc` clean, and **the full suite green at 838/0** including the very assertion the mutation had reddened. A later harness run then **refused to start**, because the anchor guard added for this scenario detected the missing line — which is why no later measurement ran against a mutated file |
| Safety events | **none.** All five protected hashes byte-identical pre→post; no stage/commit/push/reset/restore/stash/clean; **Render not touched**; Firebase/Google Console not touched; **no schema, index or migration change**; **no dependency change by this task**; **7 throwaway Firebase identities deleted, 0 leftovers**; no credential, token, password or key value printed; the Phase 32J test tenant not read or modified |
| Final outcome | **PASS (verification).** Phase 32L-A is **ready for architectural approval**; the qualification is about **evidence quality, not behaviour** |
| Handoff notes | (1) **Do not commit FB-008's "10/10" claim as written** — the corrected figures are **8/10 reliable, M3 flaky, M7 surviving**. (2) **M7's remedy, NOT applied:** add one DB-backed interleaving test per path using a hooked model call between the service's read and its write (`PasswordResetToken.deleteMany` for unlink, `bcrypt.hash` for reset); that also makes M3 deterministic. (3) **De-flake** *"two concurrent unlinks…"* by asserting the observable outcome (exactly one 200 and one 409). (4) Not exercised at runtime: `403 BUSINESS_NOT_ACTIVE`, live Google federated re-sign-in (O-6), and any device/emulator/APK behaviour. (5) Project-documentation close-out for Phase 32L remains outstanding and was **not** authorized here |

### ★ CORRECTION OF FB-008 — recorded during FB-009 (2026-09-23)

Per the standing rule, the FB-008 block above is **not rewritten**; the correction is recorded here and as
`DECISIONS.md` **FB-D-121**.

FB-008's Results row states: *"**10/10 mutations detected**"* with M3 and M7 both marked DETECTED. **That
claim does not reproduce.** Independent re-running, each mutation alone on a pristine copy with a startup
anchor guard:

| Mutation | FB-008 claimed | FB-009 observed |
| --- | --- | --- |
| **M3** — conditional unlink write made unconditional | DETECTED | **DETECTED IN ONE RUN, NOT IN ANOTHER** — the assertion that catches it (*"two concurrent unlinks leave exactly one success and one usable method"*) is **timing-dependent** |
| **M7** — conditional reset completion made blind | DETECTED | **NOT DETECTED — 2 of 2 runs** |
| M1, M2, M4, M5, M6, M8, M9, M10 | DETECTED | **DETECTED — reproduced** |

**Corrected figure: 8 of 10 reliably detected; one flaky; one surviving.** Both issues are **test
weaknesses, not code defects** — the M7 clause and the M3 filter clause are each genuinely load-bearing.
The remedy is recorded in FB-009 §15 and in the FB-009 handoff notes. **Read the FB-008 "10/10" statement as
superseded, not as still true.**

### FOLLOW-UP — mutation hardening: both gaps CLOSED (recorded during FB-009's addendum)

**Test files only; no production file touched** — proven by `sha256` on all ten 32L-A source files. Three
changes: a new DB-backed **stale-identity** test for the unlink path; a new DB-backed **R-4 LINK** test for
the reset path; and a **barrier-based** replacement for the concurrent-unlink assertion (both requests held
until the second arrives, then the exact statuses `[200, 409]` required). Both new tests interpose on
**`bcrypt.hash`** — the call both flows cross *between* reading the account and writing it — so "no sleeps"
holds.

| Mutation | FB-009 observed | After hardening |
| --- | --- | --- |
| **M3** — unlink filter uid clause removed | **FLAKY** | **DETECTED**, 2 assertions |
| **M7** — reset completion `firebaseUid: null` removed | **SURVIVED** | **DETECTED**, 1 assertion |
| **M11** — reset completion `passwordChangedAt: null` arm removed | not previously tested | **DETECTED** by two **pre-existing** tests |

**Result: 11 of 11 detected.** Determinism measured in the failing direction: with each clause removed the
targeted tests fail **5/5** runs; with the code pristine the three race tests pass **10/10** runs. Suites:
**840 / 109 suites / 0 fail**, `test:unit` 324 pass, `test:db` **542 / 516 pass**, `typecheck` and `lint`
clean. **Because no production behaviour changed, FB-009's 56/56 runtime evidence remains valid and was
deliberately not re-run.** Recorded as `DECISIONS.md` **FB-D-122**. **No commit, no push.**

---

## Correction log

### CORRECTION OF FB-001 — recorded during FB-005 (2026-09-22)

Two statements in the FB-001 block above are corrected, without editing that block (log rule 1):

1. **Drift-ledger range (FB-003 finding W-2).** The FB-001 "Handoff notes" row says the FB-001
   discrepancies are recorded as `FB-D-101…FB-D-110`. The register runs to **`FB-D-111`**; the
   correct range is **`FB-D-101…FB-D-111`**, as `BASELINE.md` §8, `DECISIONS.md` FB-D-008 and
   `HANDOFF.md` §3 already state.
2. **"The four authoritative docs" (FB-003 finding W-4).** The FB-001 "Actions performed" row says
   FB-001 inspected "the four authoritative docs". **Five** authoritative documents were read:
   `CLAUDE.md`, `README.md`, `docs/SYSTEM_SPECIFICATION.md`, `docs/DEVELOPMENT_ROADMAP.md` and
   `docs/superpowers/specs/2026-09-18-firebase-auth-design.md` — which the FB-001 task record's own
   §Files Inspected already lists.

### CORRECTION OF FB-002 — recorded during FB-005 (2026-09-22)

**"Modified: none" (FB-003 finding W-5).** The FB-002 block above (and the FB-002 task record's
§Changes) reads "**Modified: none. Deleted: none**". That means **no pre-existing file was modified**.
Four of the nine files FB-002 *created* were amended before task close (the authoring-typo pass and
the verification-results pass — FB-002 §Actions items 4 and 6). Read the FB-002 row as
"Modified (pre-existing files): none". No pre-existing document was touched by FB-002.
