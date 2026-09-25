# FB-012 — Phase 1 remaining owner decisions frozen (P-1 native config, P-2 Google Sign-In library)

> Audit record of a Freebuff task. **Not** architecture, **not** project history, **not** a
> specification. Authoritative sources: `docs/SYSTEM_SPECIFICATION.md`, `docs/DEVELOPMENT_ROADMAP.md`,
> `CLAUDE.md`, `docs/superpowers/specs/2026-09-18-firebase-auth-design.md`.
>
> Written **during** the task (documentation phase), so no `RETROACTIVE ENTRY` marker is required.

## Task Metadata

| Field | Value |
| --- | --- |
| Task ID | FB-012 |
| Date | 2026-09-24 — host clock read at close |
| Branch | `experiment/freebuff-evaluation` |
| Starting HEAD | `9917447ec3b0f70846a60547d3e5a9ff10625ed6` |
| Ending HEAD | **none — no commit** |
| Request source | Owner message: formal freeze of the two remaining Phase 1 owner decisions |
| Explicit approval status | **APPROVED.** P-1 and P-2 quoted verbatim in `DECISIONS.md` FB-D-125 and in §8.1 of the decision record. Documentation scope authorized; implementation and commit explicitly not |

## Requested Objective

Record **P-1** and **P-2** as **OWNER APPROVED / FROZEN**, preserve provenance labels, update only the
necessary architecture/audit-trail documentation, keep **P-3/P-4/P-5/P-6** recorded as
**EXTERNAL VERIFICATION REQUIRED / OPEN**, keep **P-7** recorded as **CLOSED (M1)**, and stop without
starting Phase 1.

## Scope

**Allowed files:**
```
docs/superpowers/specs/2026-09-24-rnfirebase-p2-persistence-decision.md   (amend: header + §8.1/§8.2)
docs/superpowers/specs/2026-09-18-firebase-auth-design.md                  (additive: §14A.5 O-7 + §12 banner)
docs/freebuff/DECISIONS.md                                                 (append FB-D-125)
docs/freebuff/MASTER_LOG.md                                                (append FB-012)
docs/freebuff/tasks/FB-012-phase-1-decisions-freeze.md                     (new)
```

## Out of Scope

- Any package installation; any `expo prebuild`; any EAS build.
- Firebase Console, MongoDB, application data.
- Any authentication implementation — `mobile/` and `server/` source are untouched.
- `package.json`, `package-lock.json`, `app.json`, `eas.json`, `.env`, `.env.example`.
- The five protected working-tree entries.
- `CLAUDE.md`, `README.md`, `docs/DEVELOPMENT_ROADMAP.md`, `docs/SYSTEM_SPECIFICATION.md`.
- Any commit, stage or push.

## Initial Repository State

```
git branch --show-current
experiment/freebuff-evaluation

git rev-parse HEAD
9917447ec3b0f70846a60547d3e5a9ff10625ed6

git status --short (excerpt)
 M docs/freebuff/DECISIONS.md
 M docs/freebuff/MASTER_LOG.md
 M docs/superpowers/specs/2026-09-18-firebase-auth-design.md   ← modified by FB-011
?? docs/freebuff/tasks/FB-011-rnfirebase-p2-persistence-freeze.md
?? docs/superpowers/specs/2026-09-24-rnfirebase-p2-persistence-decision.md
 …plus the pre-existing 32I/32J/32K/32L-B working-tree changes
```

- Protected-file SHA-256 (pre-task): `10c5ff2e` · `23e91610` · `83767f8b` · `52d3afef` · `d000a5d3`
  (see `BASELINE.md` §3).
- Relevant environment observations: the working tree was **already dirty** from earlier tasks and
  pre-existing phase work. This task adds documentation only. No secret recorded.

## Files Inspected

Read-only: `docs/superpowers/specs/2026-09-24-rnfirebase-p2-persistence-decision.md` (§1, §8, §9) and
`docs/superpowers/specs/2026-09-18-firebase-auth-design.md` (§12, §14A.5 rows `O-4`, `O-7`, `O-11`),
plus the `docs/freebuff/` trail conventions.

## Existing Architecture Understood

Option B remains frozen and unchanged (Firebase ID token exchanged once for an Inventory AI JWT naming a
server-side `sessions` row; MongoDB authoritative per request). This task resolves **mobile build
configuration** questions only, and touches no authentication behaviour. Cited rather than restated —
see the Firebase design authority §3/§5 and the P2 decision record §7.

## Existing Tests Discovered

**PRE-EXISTING (Claude Code / historical) — not Freebuff's:** per `TEST_BASELINE.md`.
**FREEBUFF-CREATED:** none this task. **FREEBUFF-MODIFIED:** none this task.
**TESTS RUN BY FREEBUFF:** none — and none is applicable. No test reads the `docs/` tree.

## Plan

Frozen before execution:

1. Capture pre-state (protected hashes, HEAD, `git status`).
2. Amend the decision record: header amendment line + new §8.1 (approvals) + restated §8.2 (remaining).
3. Additively annotate the design authority: §14A.5 `O-7` → RESOLVED, and extend the §12 banner.
4. Append `FB-D-125` to `DECISIONS.md` and `FB-012` to `MASTER_LOG.md`; create this record.
5. Verify protected hashes, HEAD, staged count and diff scope.
6. Report; **do not commit**; **do not start Phase 1**.

## Approval

> *"P-1 — Native Firebase configuration files. APPROVED: EAS build-time injection for:
> `google-services.json`, `GoogleService-Info.plist`. Do not commit these native Firebase configuration
> files to the repository unless a later explicit owner decision changes this."*
>
> *"P-2 — Google Sign-In library. APPROVED: `@react-native-google-signin/google-signin@16.1.5`. Reason:
> current free/public integration path and project free-tier-first constraint. Treat this as the selected
> Phase 1 integration path, subject to actual Android/iOS build and runtime verification."*
>
> *"Do not start Phase 1 implementation until I explicitly approve it."*

Silence, a previous approval and an inferred intention are **not** approval for a new risky action.

## Actions

1. Read the decision record §8/§9 and the design authority's open-decision rows.
2. Amended the decision record (header + §8.1 + §8.2).
3. Applied two additive edits to the design authority (`O-7` annotation; §12 banner extension).
4. Appended `FB-D-125` to `DECISIONS.md`.
5. Appended the `FB-012` block to `MASTER_LOG.md`.
6. Created this record.
7. Post-task verification (protected hashes, HEAD, staged count, diff scope).

## Changes

| File | Change | Why |
| --- | --- | --- |
| `…/2026-09-24-rnfirebase-p2-persistence-decision.md` | Header amendment line; §8 retitled and split into **§8.1** (P-1/P-2 APPROVED, with consequences) and **§8.2** (P-3…P-7 with corrected statuses); readiness paragraph updated | Records the decisions where a Phase 1 implementer will look |
| `…/2026-09-18-firebase-auth-design.md` | §14A.5 `O-7` cell annotated **RESOLVED 2026-09-24** in place; §12 banner extended to name the chosen library and the injection decision. **No existing text removed** | Keeps the canonical open-decisions table honest |
| `docs/freebuff/DECISIONS.md` | **Appended** `FB-D-125` (`OWNER DECISION`) | Register rule: an owner decision is a new entry |
| `docs/freebuff/MASTER_LOG.md` | **Appended** the `FB-012` ledger block | Log rule: one block per task |
| `docs/freebuff/tasks/FB-012-phase-1-decisions-freeze.md` | **New.** This record | Convention: one full record per task |

**Behavioural effect:** none. **Security implications:** none — the decisions add no credential path and
remove none; P-1's effect is that two Firebase configuration files stay **out** of version control.
**Compatibility implications:** none directly; P-2 selects a library whose integration is still
**unverified**.

## Verification

| Check | Command | Mode | Executed? | Result |
| --- | --- | --- | --- | --- |
| Protected files byte-identical | `sha256sum <5 paths>` | n/a | **YES** | all five unchanged pre→post |
| HEAD unchanged | `git rev-parse HEAD` | n/a | **YES** | `9917447ec3b0f70846a60547d3e5a9ff10625ed6` |
| Nothing staged | `git diff --cached --stat` | n/a | **YES** | empty |
| Diff scope | `git status --short` / `git diff --stat` | n/a | **YES** | documentation files only |
| No source/config/test/manifest/`.env` changed | `git diff --name-only` review | n/a | **YES** | **none added by FB-012** |
| Tests | — | n/a | **NO** | **NOT RUN** — no code changed; no test is applicable |
| Typecheck / lint | — | n/a | **NO** | **NOT RUN** — no code changed |

**Not verified, stated plainly:** nothing about the RNFirebase integration, the Google Sign-In library,
the EAS injection mechanism or the native configuration files was executed or tested here. Those remain
`REASONED, NOT VERIFIED` and, where noted, `[EXTERNAL VERIFICATION REQUIRED]`.

## Failures / Unexpected Results

None in this task. (A transient `ripgrep` `ENOENT` was recorded earlier in the session and worked around
with `grep`; no repository effect.)

## Final Diff Review

```
git status --short / git diff --stat
<documentation files only; see the report>
```

- `PLANNED`: the five files in `Scope`.
- `IMPLEMENTED`: the same five files.
- `UNPLANNED`: **none.**
- Protected-file violations: **none.**
- Unrelated modifications: **none.**

## Final Outcome

`SUCCESS`

Documentation-only freeze of P-1 and P-2. No package installed, no `expo prebuild`, no Console, no
MongoDB, no auth implementation, no commit. **Phase 1 has not started.**

## Claude Code Handoff

- **Changed:** the decision record's §8 (now §8.1 approvals / §8.2 remaining) and header; the design
  authority's `O-7` cell and §12 banner; the two audit-trail registers; this record.
- **Not changed:** all source, configuration, manifests, tests, `.env`, the protected entries, and every
  other architecture document.
- **Inspect first:** decision record §8.1 (P-1/P-2) and §8.2 (what is still outstanding).
- **Unresolved questions:** P-3 (Android `compileSdk`/`targetSdk` alignment), P-4 (Android
  `setPersistence` reachability; iOS Keychain survival across reinstall), P-5 (Firebase Console state),
  P-6 (iOS build capability).
- **Known risks:** the native config files must not be committed — and a `mobile/.gitignore` entry is not
  the mechanism for that; `.easignore` replaces rather than extends `.gitignore`. The Google Sign-In
  library selection is a **choice**, not evidence the integration works.
- **Tests to trust:** **none. Nothing was executed.**
- **Tests still needing a run:** every suite in `TEST_BASELINE.md`, whenever code next changes.
