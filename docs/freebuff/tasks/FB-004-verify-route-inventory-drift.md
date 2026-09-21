# FB-004 — Verify route inventory drift (67 vs 68)

> **`RETROACTIVE ENTRY`** — FB-004 was a read-only forensic audit and, by owner instruction, created
> no file and wrote nothing to this trail while it ran. This record is written during FB-005. It ran
> after FB-003 and before FB-005's approval; exact wall-clock time not captured.
>
> Audit record. Not architecture, not project history, not a specification.

## Task Metadata

| Field | Value |
| --- | --- |
| Task ID | FB-004 |
| Date | 2026-09-21/22 (between FB-003 and FB-005); exact time not captured |
| Branch | `experiment/freebuff-evaluation` |
| Starting HEAD | `d8b693a43fa778c984301656d437b087f5e0a5bc` — Phase 32H |
| Ending HEAD | same — no commit was made or authorized |
| Request source | Jeffern, explicit instruction ("FB-004 — VERIFY ROUTE INVENTORY DRIFT") |
| Explicit approval status | Approved as read-only; "Do not edit anything. Do not create an FB-004 file. Do not commit. Stop after the report." |

## Requested Objective

Determine whether the documented route inventory is stale by one route because Phase 32H added
`POST /api/auth/firebase/link`, or whether 67 vs 68 arises from a different counting methodology.

## Scope

Read-only: `app.ts`, all route modules, the Phase 23 guard (declaration lists counted, not prose),
git history for the link route and the design doc, and the route-count statements in every
authoritative document.

## Out of Scope

Any modification; tests/builds/classifier execution; DB/Firebase/network; Git mutation.

## Initial Repository State

Same as FB-003's post-state: baseline tree + nine trail files, HEAD `d8b693a`, nothing staged.

## Files Inspected

`server/src/app.ts` (12 mounts + `app.get('/')`); all 12 `server/src/routes/*.ts` (per-file
registration counts, `router.use(` absence); `server/test/phase23-authorization-contract.test.mjs`
(collector, `classifyRoute`, the three declared lists, the bucket-membership guards);
`docs/superpowers/specs/2026-09-18-firebase-auth-design.md` (§2.6, §14B.1, line 1165, §2.6 history);
`docs/DEVELOPMENT_ROADMAP.md` §27B; `README.md`; `CLAUDE.md`; git history (`git log -S`).

## Existing Architecture Understood

Only the route/authorization inventory needed for the count. Not restated; see the Phase 23 guard
and `docs/SYSTEM_SPECIFICATION.md` for authority.

## Existing Tests Discovered

None new. **None executed.** The Phase 23 guard was *read*, not run — all counts below are
`SOURCE-CODE OBSERVATION` (source-read, two independent methods), not `EXECUTED`.

## Plan

Count mounted routes from source; count the declared exemption lists; classify the remainder;
trace `firebase/link` through git; compare every documented figure; test each 67-vs-68 hypothesis
against repository evidence.

## Approval

Owner instruction FB-004 (read-only). Explicitly not an authorization to write.

## Actions

1. Pre-checks (Git × 5 + `sha256sum` × 5) — all matched the known baseline.
2. Registration counts per route module (sum 67) + `app.get('/')` = **68**; confirmed no nested
   routers (`router.use(` absent) and no orphan routers (all 12 modules mounted).
3. Block-level counts of the guard's declared lists: `PUBLIC_ROUTES` = 10, `AUTHENTICATED_ROUTES`
   = 11, `ROLE_GATED_ROUTES` = `[]`; independent gated count = **47** registrations carrying
   `requirePermission(` as handler #2. 47 + 21 = **68**; no overlaps (the guard's own `misdeclared`
   and "no longer exists" rules structurally forbid them).
4. `git log -S "firebase/link"` over `auth.routes.ts` + `phase23-…test.mjs` → exactly one commit:
   `d8b693a` (Phase 32H). `git log -S "47 + 10 + 10"` over the design doc → only `5d7d1df` (32F):
   §2.6 was never updated by 32H even though 32H edited the document.
5. Documentation sweep: every route-count statement located and classified (see §6 of the report).
6. Post-checks (Git × 5 + `sha256sum` × 5) — identical pre→post.

## Changes

**None.** No file was created, modified, deleted, staged or committed.

## Verification

| Check | Command | Executed? | Result |
| --- | --- | --- | --- |
| Branch/HEAD unchanged | `git branch --show-current`, `git rev-parse HEAD` | YES | unchanged pre→post |
| Protected files byte-identical | `sha256sum` × 5 | YES | all equal to `BASELINE.md` §3 |
| Tests / classifier / typecheck / lint | — | **NO** | **NOT RUN, NOT AUTHORIZED.** Counts are source-read (`SOURCE-CODE OBSERVATION`), cross-corroborated by two independent methods |

## Failures / Unexpected Results

None. One correction to this audit's own premise: the stale `67` statement is in the **Firebase
design doc §2.6**, not `docs/SYSTEM_SPECIFICATION.md` (which contains no route count at all).

## Final Diff Review

Pre = post for every check; `docs/freebuff/` still 9 files; nothing staged.

- `PLANNED`: no file changes. `IMPLEMENTED`: none. `UNPLANNED`: **none.**
- Protected-file violations: **none.** Unrelated modifications: **none.**

## Final Outcome

`SUCCESS` — **DOCUMENTATION DRIFT CONFIRMED**: the mounted route set and the guard's declaration
lists both give **68 = 47 gated + 11 authenticated + 10 public + 0 role-gated**; the design doc §2.6
says **67 = 47 + 10 + 10**, correct through Phase 32C and never updated after Phase 32H added the one
authenticated route. Not a counting-methodology difference: both figures share one basis that
includes the app-level `GET /`. Impact: documentation accuracy and auditability only — authorization
behavior is unchanged (the link route is correctly `requireAuth`-only and correctly classified; the
47-gated tier is unchanged).

## Claude Code Handoff

- **Changed:** nothing.
- **Inspect first:** the §5 hypothesis table of the FB-004 chat report (each hypothesis and its
  evidence); design doc §2.6 (lines 159–167) vs §14B.1 (line 1019) — the document's own internal
  inconsistency; the §2.6 auth-surface table (12 rows vs 13 registrations).
- **Unresolved questions:** whether/when to correct §2.6 (later approved under FB-005).
- **Known risks:** the corrected number remains unguarded by design (Phase 23 asserts bucket
  membership, not counts) — a future phase adding routes must update §2.6 by hand.
- **Tests to trust:** none from FB-004 — nothing was executed.
