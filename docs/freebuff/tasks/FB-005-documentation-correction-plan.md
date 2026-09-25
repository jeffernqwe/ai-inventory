# FB-005 — Documentation correction plan and implementation

> Audit record. Not architecture, not project history, not a specification.
> This record has two written phases: the **planning phase** (recorded below) was frozen before any
> edit; the **implementation and verification phases** are appended at the end of this file in a
> post-verification pass, following the FB-002 precedent (authored before verification; results
> appended, earlier text not rewritten).

## Task Metadata

| Field | Value |
| --- | --- |
| Task ID | FB-005 |
| Date | Planning approved 2026-09-22; implementation started `2026-09-21 19:42 UTC` (host clock, read at the first pre-check; host-local zone label `MPST`) |
| Branch | `experiment/freebuff-evaluation` |
| Starting HEAD | `d8b693a43fa778c984301656d437b087f5e0a5bc` — Phase 32H |
| Ending HEAD | none — no commit authorized (owner decisions 5 and 6 leave both `docs/freebuff/` and the design doc uncommitted) |
| Request source | Jeffern: the FB-005 plan, then the approval "FB-005 — GO FOR IMPLEMENTATION" |
| Explicit approval status | **APPROVED**, with six owner decisions: (1) keep the register append-only — `FB-D-112` as a correction entry, FB-D-105 untouched; (2) include B-1.3 (the missing auth-surface table row); (3) keep implementation under FB-005 (no FB-006); (4) include the A-8 TEST_BASELINE §4 clarification; (5) do **not** commit `docs/freebuff/`; (6) do **not** commit the design doc yet — commit authorization is a separate future instruction |

## Requested Objective

Correct the documentation findings from FB-003 and FB-004: the eight trail-internal findings
(W-1…W-8) and the one authoritative-document drift (design doc §2.6 says 67 routes; source and the
Phase 23 declarations give 68). Documentation only.

## Scope

**Allowed files (closed allowlist, verbatim from the approval):**

```
docs/freebuff/README.md
docs/freebuff/MASTER_LOG.md
docs/freebuff/DECISIONS.md
docs/freebuff/HANDOFF.md
docs/freebuff/TEST_BASELINE.md
docs/freebuff/tasks/FB-003-audit-the-freebuff-audit-trail.md
docs/freebuff/tasks/FB-004-verify-route-inventory-drift.md
docs/freebuff/tasks/FB-005-documentation-correction-plan.md
docs/superpowers/specs/2026-09-18-firebase-auth-design.md
```

The design doc may change **§2.6 only**; line 1165 (historical `60 → 62` planning statement) stays
untouched; all sections outside §2.6 byte-identical; LF line endings; correction attributed and
dated as documentation-only.

## Out of Scope

Source code, tests, configuration, dependencies, schemas, Firebase implementation, MongoDB, EAS,
mobile code, all five protected working-tree files. Staging, committing, pushing, `git add -A`,
`git add .`, reset/restore/clean/stash/rebase/merge/history rewriting. Editing FB-001/FB-002
MASTER_LOG entries or FB-D-001…FB-D-111. Creating any additional architecture document.

## Initial Repository State

Recorded at the first pre-check: branch `experiment/freebuff-evaluation`, HEAD `d8b693a`, working
tree = the inherited baseline (3 modified protected tracked files, +137/−15, nothing staged) + 9
untracked `docs/freebuff/` files + the 2 protected untracked plan documents. All five protected
SHA-256 values equal to `BASELINE.md` §3. Design doc tracked, **clean**, LF-only (0 CR lines).

## Files Inspected (read-only, pre-implementation)

`docs/freebuff/README.md`, `MASTER_LOG.md`, `DECISIONS.md`, `HANDOFF.md`, `TEST_BASELINE.md`,
`tasks/_TEMPLATE.md` (anchors re-verified); the design doc (every `67` occurrence, §2.6 in full,
§14B.1, line 1165); `git status/diff`; `sha256sum` × 5; CR-byte checks on the target files.

## Existing Architecture Understood

Only the route inventory (FB-004's result). No architecture is restated here; the authoritative
sources are unchanged. The §2.6 correction reconciles a stale sentence with the shipped Phase 23
guard — it sets no policy and creates no count assertion.

## Existing Tests Discovered

None new. **None executed by FB-005** (no test/build/classifier is relevant to a documentation-only
change, and none was authorized).

## Plan (frozen planning phase)

The approved plan is the chat document "FB-005 Documentation Correction Plan". Frozen anchors at
planning close: README lines 44/36/104/116/87-88; MASTER_LOG lines 36/43/74/52/104; DECISIONS lines
203/212; HANDOFF line 6; TEST_BASELINE line 123; design doc lines 159/163-167/185; line 1165.
All anchors verified to exist immediately before implementation (see Verification table).

## Approval

Owner approval quoted above (six decisions + the closed allowlist + the execution order). The
approval is scoped to FB-005 only; staging and committing are explicitly excluded; a future commit
requires its own instruction.

## Actions

**Post-verification pass (appended after implementation and verification; the planning text above was not rewritten).** In order:

1. **Pre-checks (read-only):** `date -u`; Git × 5 (`branch --show-current`, `rev-parse HEAD`, `status --short`, `diff --stat`, `diff --name-only`); `sha256sum` × 5 protected files (all equal to `BASELINE.md` §3); anchor verification — every planned anchor string found at its expected location (README lines 44/36/104/116/87; MASTER_LOG lines 36/43/74/52/104; DECISIONS lines 203/212; HANDOFF line 6; TEST_BASELINE line 123; design doc lines 159/166/185; line 1165 confirmed present and untouched).
2. **Created** the three task records: `FB-003-audit-the-freebuff-audit-trail.md`, `FB-004-verify-route-inventory-drift.md`, `FB-005-documentation-correction-plan.md`.
3. **README.md edits (A-1.1…A-1.5):** FB-000 → "baseline captured at FB-002"; unconditional "never stages, commits, …" → conditional "only when Jeffern has given a separate, explicit authorization naming that exact action"; FB-D-005 attribution added to §1; owner-protocol attribution lines added to §7 and §8.
4. **MASTER_LOG.md (A-2.1…A-2.5):** appended FB-003, FB-004 and FB-005 blocks (FB-001/FB-002 blocks untouched) and two `CORRECTION OF FB-001/FB-002` entries in the Correction log (the FB-D-110 range and the "four authoritative docs"; the "Modified: none" clarification).
5. **DECISIONS.md (A-3.1, A-3.2):** appended `FB-D-112` (CORRECTION OF FB-D-105 — 68 current / 67 stale / Phase 32H cause / not an authorization defect) and `FB-D-113` (OWNER DECISION authorising the §2.6 correction). Entries FB-D-001…FB-D-111 untouched.
6. **HANDOFF.md (A-4.1…A-4.9):** refreshed header, §1 rows 1/2/3/5/7/12/15/17, §2 current state, §3 inspect-first, §6 risk table, §7 pending work.
7. **TEST_BASELINE.md (A-8):** §4 register heading marked "unchanged through FB-005"; executed count row extended; a dated status line appended.
8. **Design doc §2.6 (B-1.1…B-1.3):** count line 67 → 68 (47/11/10/0); 32F note completed with ", the total as of Phase 32F" plus the new Phase 32H paragraph ("47 + 11 + 10 = **68**, the current total", with the dated "Corrected 2026-09-22, documentation only, no behaviour change" attribution); added the `| POST | /api/auth/firebase/link | requireAuth (Phase 32H) |` table row after the `DELETE /api/auth/sessions/:id` row.
9. **Post-checks + full diff review (§Verification below).** Nothing staged, nothing committed, nothing pushed at any point.

## Changes

**Post-verification pass.**

| File | Change | Provenance |
| --- | --- | --- |
| `tasks/FB-003-…md` | added — retroactive record of the read-only trail audit + findings register W-1…W-8 | `FREEBUFF-CREATED` (FB-005) |
| `tasks/FB-004-…md` | added — retroactive record of the drift verification (68 vs 67, two counting methods, git trace) | `FREEBUFF-CREATED` (FB-005) |
| `tasks/FB-005-…md` | added — this record (planning frozen; implementation/verification appended) | `FREEBUFF-CREATED` (FB-005) |
| `README.md` | 5 edits (W-1, W-6, W-7 ×3) — rule corrections and attributions; no chronology touched | `FREEBUFF-MODIFIED` (FB-005, owner-approved) |
| `MASTER_LOG.md` | appended 3 task blocks + 2 correction entries; existing blocks byte-identical | `FREEBUFF-MODIFIED` (FB-005, owner-approved) |
| `DECISIONS.md` | appended FB-D-112 and FB-D-113; entries 001–111 byte-identical | `FREEBUFF-MODIFIED` (FB-005, owner-approved) |
| `HANDOFF.md` | refreshed current-state rows (operational doc, not an append-only ledger) | `FREEBUFF-MODIFIED` (FB-005, owner-approved) |
| `TEST_BASELINE.md` | §4 register status clarification only | `FREEBUFF-MODIFIED` (FB-005, owner-approved) |
| `docs/superpowers/specs/2026-09-18-firebase-auth-design.md` | §2.6 ONLY: count line 67→68 (47/11/10/0); 32F statement preserved as historical context and completed with the Phase 32H arithmetic; dated documentation-only correction note; missing auth-surface table row added | owner-authorized one-off (FB-D-113) |

**Behavioural / security / compatibility implications:** none. No source, test, configuration, dependency, schema, session, `businessId`, role/status, Firebase or EAS behaviour changed. The §2.6 correction makes a description match the shipped Phase 23 guard; the guard itself was not touched and no count assertion was added.

## Verification

**Post-verification pass.** All checks read-only; results as printed.

| Check | Command | Executed? | Result |
| --- | --- | --- | --- |
| Branch/HEAD unchanged | `git branch --show-current`, `git rev-parse HEAD` | YES | `experiment/freebuff-evaluation` @ `d8b693a…` — unchanged |
| Status shape | `git status --short` | YES | the three protected `M` rows + `M docs/superpowers/specs/2026-09-18-firebase-auth-design.md` + `?? docs/freebuff/` + the two protected `??` plans — nothing else |
| Diff names | `git diff --name-only` | YES | exactly 4: the design doc + the three protected |
| Diff stat | `git diff --stat` | YES | protected entries unchanged (+137/−15); design doc +14/−5 |
| Nothing staged | `git diff --cached --stat` | YES | empty |
| Protected files byte-identical | `sha256sum` × 5 | YES | all five equal to `BASELINE.md` §3, pre→post |
| Trail file count | `find docs/freebuff -type f \| wc -l` | YES | 12 (9 + 3 task records) |
| §2.6 count corrected | `grep -n "68 routes"` | YES | exactly 1 hit (line 159, §2.6) |
| No current-state `67` remains | `grep -n "67"` (design doc) | YES | 2 hits, both inside the §2.6 historical/correction note (line 166 = the preserved Phase 32F statement; line 172 = the correction note quoting it) — see Failures note 1 |
| Line 1165 untouched | `sed -n '1165p'` | YES | the historical "60 → 62" planning statement, byte-identical |
| Link-route mentions | `grep -n "firebase/link"` | YES | 3: §2.6 note, §2.6 table row, §14B.1 (the plan's "expect 2" undercounted §14B.1 — see Failures note 1) |
| Hunk boundaries | `git diff -U0 \| grep @@` | YES | 3 hunks: lines 159, 166–173, 191 — all inside §2.6 |
| Full design-doc diff reviewed | `git diff <design doc>` | YES | every changed line matches change map B-1.1…B-1.3; nothing outside §2.6 |
| Counts re-derived from source | `grep -rc "requirePermission(" server/src/routes/*.ts` summed; `auth.routes.ts` registrations | YES | 47 gated; 13 auth registrations — consistent with 68 = 47 + 11 + 10 + 0 |
| FB-000 / FB-D-110-range remnants | `grep -rn "FB-000" docs/freebuff`; `grep -rn "FB-D-101…FB-D-110"` | YES | remaining hits are ONLY the FB-003 findings register and the correction entries *describing* the original defects — the live rules no longer carry them |
| FB-001/FB-002 blocks intact | spot-string greps + heading scan | YES | original strings still present verbatim; blocks in order FB-001…FB-005 + Correction log with the 2 correction entries |
| Append-only conformance | re-read of MASTER_LOG/DECISIONS edits | YES | FB-001/FB-002 blocks and FB-D-001…FB-D-111 untouched; all additions are new blocks/entries |
| Line endings | CR-byte scan | YES | design doc 0 CR lines (LF preserved); `docs/freebuff/` all LF |
| Tests / typecheck / lint / build | — | **NO** | **NOT RUN, NOT AUTHORIZED** — documentation-only change; nothing executable changed |
| Database / Firebase / EAS / network | — | **NO** | **NOT RUN, NOT CONTACTED** |

## Failures / Unexpected Results

**Post-verification pass.** No command failed and no protected file was touched. Two plan-precision findings are recorded honestly:

1. **The plan's verification step 10 was miscalibrated, not the implementation.** The plan said `grep "67"` must return nothing in §2.6 and that the only permitted remainder would be line 1165. Both expectations were wrong: line 1165 contains "60 → 62" (no "67"), and the owner's own instruction to *preserve the historical Phase 32F statement* means "67" legitimately remains twice inside the §2.6 historical/correction note (lines 166 and 172). The implemented diff matches the approved change map exactly; only the check's wording was imprecise. The meaningful property — **no current-state figure says 67** — holds.
2. **The plan's check "`firebase/link` mentions → expect 2" undercounted.** The implemented state has 3 (§2.6 note, §2.6 table row, §14B.1). The plan's own change map added the table row to a document that already named the route in §14B.1, so 3 is the correct expectation; the check constant was stale.

Neither finding required any additional edit. No `UNPLANNED` file change exists (see Final Diff Review).

## Final Diff Review

**Post-verification pass.**

```
git status --short
 M docs/superpowers/specs/2026-09-18-firebase-auth-design.md
 M mobile/eas.json
 M server/src/services/ai/providers/http.ts
 M server/test/phase06-ai-wire.test.mjs
?? docs/freebuff/
?? docs/superpowers/plans/2026-09-11-phase-18c-core-list-screens.md
?? docs/superpowers/plans/2026-09-11-phase-18e-secondary-screens.md

git diff --stat
 .../specs/2026-09-18-firebase-auth-design.md | 14 ++-
 mobile/eas.json                              |  2 +-
 server/src/services/ai/providers/http.ts     | 50 ++++++++++++----
 server/test/phase06-ai-wire.test.mjs         | 100 ++++++++++++++++++++++++++++-
 4 files changed, 147 insertions(+), 19 deletions(-)

git diff --name-only
docs/superpowers/specs/2026-09-18-firebase-auth-design.md
mobile/eas.json
server/src/services/ai/providers/http.ts
server/test/phase06-ai-wire.test.mjs
```

(The three protected `M` rows are the inherited pre-existing modifications, unchanged at +137/−15 combined. The design doc's +14/−5 is FB-005's entire output on tracked files; the 12 `docs/freebuff/` files are untracked and do not appear in `git diff`.)

- `PLANNED`: 3 new task records; 5 trail-file edits; design doc §2.6 (3 hunks).
- `IMPLEMENTED`: exactly that — `find docs/freebuff -type f | wc -l` = 12; design-doc hunks at lines 159, 166–173, 191, all inside §2.6.
- `UNPLANNED`: **none.**
- Protected-file violations: **none** — all five SHA-256 values byte-identical pre→post; none staged, formatted, read for content or renamed.
- Unrelated modifications: **none** — the only tracked-file delta beyond the inherited baseline is the design doc.
- Staged/committed/pushed: **none** (owner decisions 5 and 6).

## Final Outcome

`SUCCESS` — the FB-003 findings W-1…W-8 are corrected in the trail by append-only means, the §2.6 route inventory is reconciled with the shipped Phase 23 guard (68 = 47 + 11 + 10 + 0, Phase 32H's +1 accounted for, historical 32F statement preserved, correction dated and attributed in place), everything is verified read-only, and both `docs/freebuff/` and the design doc are left **uncommitted** awaiting separate authorization.

## Claude Code Handoff

**Post-verification pass.**

- **Changed:** 12 untracked files under `docs/freebuff/` (9 from FB-002 + 3 task records); the four trail files edited in place (README/MASTER_LOG/DECISIONS/HANDOFF) + `TEST_BASELINE.md` §4; **design doc §2.6 only** (+14/−5, three hunks, LF preserved). Nothing else.
- **Not changed:** all source, tests, configuration, dependencies, schemas; the five protected working-tree entries (hash-verified); design-doc line 1165 and every section outside §2.6.
- **Inspect first:** this record's Verification/Final Diff Review; `DECISIONS.md` FB-D-112/FB-D-113; the design-doc `git diff` (3 hunks, §2.6 only).
- **Unresolved questions:** (a) commit authorization for the design-doc diff and, separately, for `docs/freebuff/` — both deliberate, both awaiting explicit instruction; (b) the remaining drift observations FB-D-101…104 and FB-D-106…111 (recorded, not scheduled).
- **Known risks:** the corrected 68 remains unguarded by design (Phase 23 asserts bucket membership, not counts) — a future phase adding routes must update §2.6 by hand; Freebuff has now edited a Claude-authored authority once (authorized, scoped, recorded — not a precedent).
- **Tests to trust:** none from FB-005 — nothing was executed; the Phase 23 guard was read, not run.
- **Tests still needing a run:** all of them (see `TEST_BASELINE.md`).

## Claude Code Handoff

*(To be appended in the post-verification pass below.)*
