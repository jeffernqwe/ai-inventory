# FB-011 — Phase 1 blocker verification + RNFirebase P2 persistence architecture freeze

> Audit record of a Freebuff task. **Not** architecture, **not** project history, **not** a
> specification. Authoritative sources: `docs/SYSTEM_SPECIFICATION.md`, `docs/DEVELOPMENT_ROADMAP.md`,
> `CLAUDE.md`, `docs/superpowers/specs/2026-09-18-firebase-auth-design.md`.
>
> Written **during** the task (documentation phase), so no `RETROACTIVE ENTRY` marker is required.

## Task Metadata

| Field | Value |
| --- | --- |
| Task ID | FB-011 |
| Date | 2026-09-24 — host clock read at close |
| Branch | `experiment/freebuff-evaluation` |
| Starting HEAD | `9917447ec3b0f70846a60547d3e5a9ff10625ed6` (`docs: sync Phase 32L-A post-commit records`) |
| Ending HEAD | **none — no commit** |
| Request source | Owner message: Phase 1 blocker verification, then the P2 approval and the freeze instruction |
| Explicit approval status | **APPROVED.** P2 quoted verbatim in the decision record §1 and in `DECISIONS.md` FB-D-124. Documentation scope authorized; a commit explicitly not |

## Requested Objective

1. Perform a **read-only** technical verification of the two Phase 1 blocking items: RNFirebase
   compatibility with Expo SDK 57 / RN 0.86.3, and whether RNFirebase can preserve the current
   non-durable Firebase Auth persistence model.
2. Following the owner's approval of **P2**, document the decision as an **APPROVED / FROZEN**
   architecture record, record the superseded Phase 32D decision and its rationale, and mark the
   `inMemoryPersistence` requirement **SUPERSEDED, not deleted**.
3. **Do not implement RNFirebase.** No packages, no Console, no MongoDB, no protected files,
   no unrelated decisions, no commit.

## Scope

**Allowed files:**
```
docs/superpowers/specs/2026-09-24-rnfirebase-p2-persistence-decision.md   (new)
docs/superpowers/specs/2026-09-18-firebase-auth-design.md                  (additive cross-reference only)
docs/freebuff/DECISIONS.md                                                 (append)
docs/freebuff/MASTER_LOG.md                                                (append)
docs/freebuff/tasks/FB-011-rnfirebase-p2-persistence-freeze.md             (new)
```

## Out of Scope

- Any source file under `server/` or `mobile/` — in particular `mobile/lib/firebase.ts`, whose Phase 32D
  persistence comment is **superseded in documentation, not edited in code**.
- `package.json`, `package-lock.json`, `app.json`, `eas.json`, `.env`, `.env.example`.
- Firebase Console, MongoDB data/schema, EAS, installs, builds.
- The five protected working-tree entries.
- `CLAUDE.md`, `README.md`, `docs/DEVELOPMENT_ROADMAP.md`, `docs/SYSTEM_SPECIFICATION.md` — their
  historical phase records are left in place, per the repository's supersede-don't-rewrite convention.
- Any commit, stage, push, reset, restore, stash or clean.

## Initial Repository State

```
git branch --show-current
experiment/freebuff-evaluation

git rev-parse HEAD
9917447ec3b0f70846a60547d3e5a9ff10625ed6

git status --short
 M README.md                                ?? docs/freebuff/tasks/FB-010-phase-32l-b-mobile-unlink.md
 M docs/DEVELOPMENT_ROADMAP.md              ?? docs/superpowers/plans/2026-09-11-phase-18c-core-list-screens.md
 M docs/freebuff/DECISIONS.md               ?? docs/superpowers/plans/2026-09-11-phase-18e-secondary-screens.md
 M docs/freebuff/HANDOFF.md                 ?? mobile/__tests__/firebase-registration-onboarding.test.tsx
 M docs/freebuff/MASTER_LOG.md              ?? mobile/__tests__/google-auth-flow.test.tsx
 M docs/freebuff/TEST_BASELINE.md           ?? mobile/__tests__/google-auth.test.ts
 M docs/freebuff/tasks/FB-006-…md           ?? mobile/__tests__/native-intent-oauth-callback.test.ts
 M mobile/.env.example                      ?? mobile/__tests__/phase32l-b-confirm-signin.test.ts
 M mobile/__tests__/firebase.test.ts        ?? mobile/__tests__/phase32l-b-disconnect-screen.test.tsx
 M mobile/app.json                          ?? mobile/__tests__/phase32l-b-disconnect-session.test.tsx
 M mobile/app/(app)/_layout.tsx             ?? mobile/__tests__/register-firebase-screen.test.tsx
 M mobile/app/(app)/profile.tsx             ?? mobile/app/(app)/disconnect-firebase.tsx
 M mobile/app/login.tsx                     ?? mobile/app/+native-intent.ts
 M mobile/eas.json                          ?? mobile/app/register-firebase.tsx
 M mobile/lib/api.ts
 M mobile/lib/auth.tsx
 M mobile/lib/config.ts
 M mobile/lib/firebase-auth.ts
 M mobile/package-lock.json
 M mobile/package.json
 M server/src/services/ai/providers/http.ts
 M server/test/phase06-ai-wire.test.mjs

git diff --stat
22 files changed, 2032 insertions(+), 61 deletions(-)
```

- Protected-file SHA-256 (pre-task): `10c5ff2e…` × 5 — `mobile/eas.json` `10c5ff2e`,
  `server/src/services/ai/providers/http.ts` `23e91610`, `server/test/phase06-ai-wire.test.mjs`
  `83767f8b`, `…phase-18c-…md` `52d3afef`, `…phase-18e-…md` `d000a5d3` (see `BASELINE.md` §3).
- Relevant environment observations: the working tree was **already dirty** with pre-existing 32I/32J/
  32K/32L-B work and prior audit-trail edits. This task adds only documentation. No secret recorded.

## Files Inspected

Read-only: `docs/superpowers/specs/2026-09-18-firebase-auth-design.md` (§12, §14, §14A.5, §14A.6,
phase table), `docs/freebuff/{README.md,DECISIONS.md,MASTER_LOG.md,tasks/_TEMPLATE.md}`,
`docs/freebuff/tasks/FB-010-…md`, and — via `grep` — the `inMemoryPersistence` references across
`CLAUDE.md`, `README.md`, the design doc, `mobile/lib/{firebase.ts,firebase-auth.ts,auth.tsx}` and the
mobile tests. External (read-only web/registry): RNFirebase `setPersistence` reference, RNFirebase
auth usage page, migrating-to-v26 page, Expo "Using Firebase" guide, Expo SDK 57 changelog, RN 0.82
New-Architecture announcements, and npm registry metadata for `@react-native-firebase/{app,auth}` and
`@react-native-google-signin/google-signin`.

## Existing Architecture Understood

Option B is frozen and unchanged: a verified Firebase ID token is exchanged once at
`POST /api/auth/firebase/exchange` for an Inventory AI HS256 JWT (`sub` + `jti`) naming a server-side
`sessions` row; MongoDB remains authoritative for `businessId`, role, status and permissions. The only
question this task resolves is the **mobile client's Firebase persistence mode**. Cited rather than
restated — see the Firebase design authority §3/§5.

## Existing Tests Discovered

**PRE-EXISTING (Claude Code / historical) — not Freebuff's:** the Firebase/authorization/session
suites listed in `TEST_BASELINE.md` (`phase03-*`, `phase22/23/24-*`, `phase26a/26b-*`, `phase32b/c/e/h/k/l-*`)
and the mobile Firebase suites.

**FREEBUFF-CREATED:** none this task.

**FREEBUFF-MODIFIED:** none this task.

**TESTS RUN BY FREEBUFF:** none — and **none is applicable**. Checked read-only that no test reads the
`docs/` tree: the only `readFileSync` callers over documentation-adjacent paths are the source/guard
suites reading `server/src` and `mobile/lib`. Verification was therefore integrity-based.

## Plan

Frozen before execution:

1. Capture pre-state (`git status`, `git diff --stat`, `sha256sum` × 5).
2. Create `docs/superpowers/specs/2026-09-24-rnfirebase-p2-persistence-decision.md` — the freeze.
3. Add a **dated, additive** cross-reference in design doc §12 and a status update to the §14A.5 `O-4`
   row; delete nothing.
4. Append `FB-D-124` to `DECISIONS.md` and the `FB-011` block to `MASTER_LOG.md`; create this record.
5. Verify protected hashes, the diff scope, and that no source/config file changed.
6. Report; **do not commit**.

## Approval

> *"I approve P2: React Native Firebase will use its native durable Firebase Auth persistence. This
> formally supersedes the previous Phase 32D `inMemoryPersistence` decision. We accept that the device
> may hold two durable credentials… We also accept the resulting threat-model change and will redesign
> logout, cold-start restoration, reauthentication, Firebase unlink, and session reconciliation
> accordingly."*
>
> *"Do NOT commit yet unless I explicitly approve the commit."*

Silence, a previous approval and an inferred intention are **not** approval for a new risky action. The
approval above authorizes documentation only.

## Actions

1. Read the design authority, the audit-trail conventions, the trail README/DECISIONS/MASTER_LOG and the
   task template.
2. Read-only external verification of RNFirebase compatibility and native persistence (see `Changes`).
3. Created the decision record.
4. Applied two additive edits to the design authority (§12 banner; §14A.5 `O-4` status).
5. Appended `FB-D-124` to `DECISIONS.md`.
6. Appended the `FB-011` block to `MASTER_LOG.md`.
7. Created this record.
8. Post-task verification (protected hashes, diff scope).

Failed attempts recorded: one `ripgrep` invocation failed with `ENOENT` for the vendored binary (host
path redacted); retried with `grep` via the terminal. One response stream was interrupted mid-tool-call
and the step was restarted. Neither had any repository effect.

## Changes

| File | Change | Why |
| --- | --- | --- |
| `docs/superpowers/specs/2026-09-24-rnfirebase-p2-persistence-decision.md` | **New.** The APPROVED/FROZEN P2 decision record: superseded Phase 32D decision, why P1 is unsupported, approved P2 behaviour, the threat-model table, the §6 obligations (logout, cold start, reauth, unlink, session reconciliation), §7 what does **not** change, §8 open items | The owner asked for the decision documented as a formal, discoverable record |
| `docs/superpowers/specs/2026-09-18-firebase-auth-design.md` | **Two additive, dated edits.** (a) A 2026-09-24 banner under the §12 heading pointing at the new decision record. (b) The §14A.5 `O-4` row annotated **RESOLVED 2026-09-24**. **No existing text removed** — the `O-4` cell is annotated **in place**, retaining every one of its original tokens, so Git records that one line as replaced | So a reader of the mobile-integration section cannot miss the supersession |
| `docs/freebuff/DECISIONS.md` | **Appended** `FB-D-124` (`OWNER DECISION`) before Part 3 | Register rule: an owner decision is a new entry; the earlier recommendation is not promoted on its own |
| `docs/freebuff/MASTER_LOG.md` | **Appended** the `FB-011` ledger block before the correction log | Log rule: one block per task |
| `docs/freebuff/tasks/FB-011-rnfirebase-p2-persistence-freeze.md` | **New.** This record | Convention: one full record per task |

**Behavioural effect:** none. **Security implications:** none directly — the decision records an accepted
threat-model change and creates obligations; it implements nothing. **Compatibility implications:** the
compatibility finding (PASS) and the persistence finding (`P2 REQUIRED`) are recorded so Phase 1 can be
scoped without re-litigating them.

## Verification

| Check | Command | Mode | Executed? | Result |
| --- | --- | --- | --- | --- |
| Protected files unchanged | `sha256sum <5 paths>` | n/a | **YES** | all five byte-identical pre→post |
| Diff scope | `git status --short` / `git diff --stat` | n/a | **YES** | only the five planned documentation files added/modified by this task |
| No source/config changed by this task | `git diff --stat` review | n/a | **YES** | no `server/` or `mobile/` source, config, manifest or test file added to the diff by FB-011 |
| Doc-reading tests exist? | `grep readFileSync` over `server/test` | n/a | **YES** | **no test reads `docs/`** — no doc-consistency suite to run |
| Test suite | — | n/a | **NO** | **NOT RUN** — no code changed; no test is applicable |
| Typecheck / lint | — | n/a | **NO** | **NOT RUN** — no code changed |

**Not verified, stated plainly:** the RNFirebase version-compatibility and native-persistence findings
are **`REASONED FROM AUTHORITATIVE DOCUMENTATION + REGISTRY METADATA, NOT VERIFIED ON A DEVICE.** No
package was installed, no build was produced, and no Android or iOS runtime was exercised. The Phase 1
build-time items (`compileSdk` alignment, Google library choice) remain **`[EXTERNAL VERIFICATION
REQUIRED]`**.

## Failures / Unexpected Results

- Transient `ripgrep` `ENOENT` (vendored binary) — retried with `grep`; no effect.
- One streaming interruption mid-response — step restarted; no effect.
- No accidental modification, no failed restore, no protected-file violation.

## Final Diff Review

```
git status --short
<see Verification and the report's "files changed" listing>

git diff --stat
<documentation files only; see the report>
```

- `PLANNED`: the five files in `Scope`.
- `IMPLEMENTED`: the same five files.
- `UNPLANNED`: **none.**
- Protected-file violations: **none.**
- Unrelated modifications: **none.**

## Final Outcome

`SUCCESS`

Documentation-only. The owner-approved P2 decision is recorded and the Phase 32D `inMemoryPersistence`
requirement is marked **SUPERSEDED, not deleted**. Phase 1 was not started and no commit was made.

## Claude Code Handoff

- **Changed:** a new decision record (P2 durable persistence) plus two additive cross-references in the
  Firebase design authority and two audit-trail appends. **Documentation only.**
- **Not changed:** all source code, all configuration, all manifests, all tests, `CLAUDE.md`, `README.md`,
  `docs/DEVELOPMENT_ROADMAP.md`, `docs/SYSTEM_SPECIFICATION.md`, and the five protected entries.
- **Inspect first:** `docs/superpowers/specs/2026-09-24-rnfirebase-p2-persistence-decision.md` §1 (the
  decision), §6 (the obligations), §8 (what still blocks Phase 1).
- **Unresolved questions:** `google-services.json` / `GoogleService-Info.plist` storage; the Google
  Sign-In library choice; `compileSdk`/`targetSdk` alignment; Firebase Console state; iOS build
  capability.
- **Known risks:** the P2 threat-model change — two durable credentials, a durable Firebase session that
  can outlive Inventory AI sign-out, and iOS Keychain persistence that may survive reinstall.
- **Tests to trust:** **none. Nothing was executed.** No test applies to this change.
- **Tests still needing a run:** every suite listed in `TEST_BASELINE.md`, whenever code next changes.
