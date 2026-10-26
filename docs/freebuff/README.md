# Freebuff Audit Trail — scope, rules and navigation

> **FROZEN — last entry 2026-09-30. Read §0 before anything below.**
>
> **AUDIT / TRACEABILITY RECORD OF FREEBUFF ACTIVITY.**
> This directory is **not** the Inventory AI architecture, **not** the project history, **not** a
> specification, **not** a roadmap, **not** a security policy and **not** a replacement for
> `CLAUDE.md`. It is a forensic and handoff layer that records what the Freebuff agent did,
> observed, executed, changed and decided.
>
> **Authoritative sources remain, unchanged and unchallenged:**
> - `docs/SYSTEM_SPECIFICATION.md` — primary specification
> - `docs/DEVELOPMENT_ROADMAP.md` — phase order and shipped record
> - `CLAUDE.md` — project instructions and phase index
> - `docs/superpowers/specs/2026-09-18-firebase-auth-design.md` — Firebase design authority (§14 / §14A / §14B)
> - `docs/DESIGN_SYSTEM.md`, `docs/TS-MIGRATION-MANIFEST.md` — design and migration records
>
> Nothing in this directory overrides, corrects, restates or supersedes any of them.

---

## 0. This directory is frozen (added 2026-10-26)

It records one evaluation of Freebuff as a secondary agent, on the branch
`experiment/freebuff-evaluation` at HEAD `d8b693a` (Phase 32H). **That branch is not the project's
line of development, and every "current state" statement in these files is a snapshot of September
2026.** Specifically, and not exhaustively:

- the test counts (45 server suites, 15 mobile suites, 838/21 later) and the dependency state
  (Expo SDK 57) are superseded; `server/src` is now 160 TypeScript modules on Node 24 and mobile is
  Expo SDK 58;
- the Phase 32L unlink work these task records describe was **removed** (roadmap §27AA);
- the FB-D-101…FB-D-111 documentation-drift observations were mostly **fixed** afterwards — the
  mobile stack, the route inventory, the EAS build statements and the README endpoints among them.

**Where current state actually lives:** `CLAUDE.md` §1 and its open-items list,
`docs/DEVELOPMENT_ROADMAP.md`'s newest `§27…` record, and
`docs/AUTH_SECURITY_MASTER_CHECKLIST.md`. The audit layer was kept deliberately (roadmap §27AL, owner
decision P3-2) because it is the provenance record for that period, not because it describes today.
Two parts of it are still load-bearing and are not duplicated elsewhere:

| Kept for | Where |
| --- | --- |
| The mandatory *historical ≠ executed* labelling rule (FB-D-005) | §1 below |
| The measured Firebase facts — client `unlink()` of the **only** provider succeeds, so last-method protection must be server-side; `auth_time` is re-stamped by reauthentication and not by `getIdToken(true)`; provider unlink does not revoke refresh tokens | `tasks/FB-007-*`, `DECISIONS.md` FB-D-120 |
| Why a freshness refusal answers `409`, not `403` (403 is the client's session-loss signal) | `DECISIONS.md` FB-D-120 |
| The two test weaknesses the mutation pass found and then closed | `DECISIONS.md` FB-D-121/122 |

Do not extend this directory. New work is recorded in `docs/DEVELOPMENT_ROADMAP.md`.

---

## 1. Mandatory audit rule — HISTORICAL ≠ EXECUTED

**A `DOCUMENTED HISTORICAL RESULT` is NOT the same as `EXECUTED / VERIFIED BY FREEBUFF`.**

Freebuff may claim a test, build, Firebase behaviour, MongoDB behaviour, API behaviour, route count,
lint, typecheck, EAS result, deployment or any other verification as **verified** *only* when Freebuff
actually executed the relevant verification in this repository.

- Every result copied from a Claude Code document, phase report, README entry or commit message must
  carry the label:
  `DOCUMENTED HISTORICAL RESULT — NOT REPRODUCED BY FREEBUFF`
- Every result Freebuff actually ran must carry: the exact command, the mode, the date and the raw
  outcome (pass/fail counts as printed).
- "It is documented as passing" is never written as "it passes".
- Reasoning about code is never written as verification. `REASONED, NOT VERIFIED` is the label for it.

This rule is binding on every future entry in this directory. *(Owner decision `FB-D-005`.)*

---

## 2. Provenance taxonomy (who made it)

| Label | Meaning |
| --- | --- |
| `PRE-EXISTING` | Present in the repository before Freebuff's first task (baseline captured at FB-002 = HEAD `d8b693a`). |
| `CLAUDE-CODE / HISTORICAL` | Attributed to Claude Code by project documentation or commit history. |
| `AUTHORSHIP UNKNOWN` | Present, but authorship cannot be established from the repository. |
| `FREEBUFF-CREATED` | Created by a Freebuff task (the creating task ID is always recorded). |
| `FREEBUFF-MODIFIED` | Changed by a Freebuff task (before/after and approval reference always recorded). |

Freebuff never claims authorship of Claude Code work, and no commit is ever reshaped to imply it.

## 3. Evidence taxonomy (how strongly it is known)

Recorded in `DECISIONS.md` for every entry, and used in task records:

| Label | Meaning |
| --- | --- |
| `OWNER DECISION` | Explicitly decided/approved by Jeffern (the approving words are quoted). |
| `DOCUMENTED FACT` | Stated by an authoritative repository document (path + section cited). |
| `SOURCE-CODE OBSERVATION` | Read directly from source at a stated commit (file/line cited). |
| `FREEBUFF INFERENCE` | Freebuff's own reasoning from evidence. **Never** promoted to policy. |
| `FREEBUFF RECOMMENDATION` | A proposed action. **Carries no authority** until the owner approves it. |

An inference is never converted into an architecture or project decision.

## 4. Protected working tree (inherited, immutable)

These five entries are intentionally dirty and must not be modified, formatted, normalized, staged,
reset, restored, stashed, renamed, deleted or committed without explicit approval:

```
mobile/eas.json
server/src/services/ai/providers/http.ts
server/test/phase06-ai-wire.test.mjs
docs/superpowers/plans/2026-09-11-phase-18c-core-list-screens.md
docs/superpowers/plans/2026-09-11-phase-18e-secondary-screens.md
```

Their baseline SHA-256 values are recorded in `BASELINE.md` §3 and re-checked before and after every
task. Content hashing is used because `git status` cannot detect a change to a protected *untracked*
file, and the LF→CRLF warning on the three tracked ones can mask a real diff.

## 5. Git discipline

- Freebuff runs **only** read-only Git commands: `branch --show-current`, `rev-parse HEAD`, `status`,
  `status --short`, `diff --stat`, `diff --name-only`, `log`, `branch -vv`.
- Freebuff stages, commits, pushes, resets, restores, cleans, stashes, rebases, merges, deletes
  branches, rewrites history or force-pushes **only** when Jeffern has given a separate, explicit
  authorization naming that exact action. Silence and a previous approval are not authorization.
- Creating files in `docs/freebuff/` **does not** authorize a commit. The repository is intentionally
  left uncommitted unless Jeffern gives a separate, explicit commit instruction.

## 6. Navigation

| File | Contents |
| --- | --- |
| `MASTER_LOG.md` | Append-only chronological ledger; one block per task; the single "did Freebuff touch this repo?" answer. |
| `BASELINE.md` | FB-002 snapshot: branch, HEAD, working tree, protected hashes, docs map, source map, dependency state, known warnings, historical context index. |
| `DECISIONS.md` | `FB-D-NNN` register of owner decisions and Freebuff observations/inferences, each with its evidence class. |
| `TEST_BASELINE.md` | Test inventory + provenance + executed/not-executed status; rule for Freebuff-created tests. |
| `HANDOFF.md` | Operational "what happened / inspect this first" for the next primary agent. |
| `tasks/FB-XXX-*.md` | One full record per task. |
| `tasks/_TEMPLATE.md` | The blank skeleton every task record follows. |

## 7. Entry protocol for a new task

*(From the owner's safety protocol; restated here, not legislated by Freebuff.)*

```
RECON → UNDERSTAND → CLASSIFY RISK → CHECK PROTECTED FILES → CHECK CURRENT DIFF
→ READ RELEVANT EXISTING TESTS → PREPARE PLAN → STOP → WAIT FOR EXPLICIT GO
→ IMPLEMENT ONLY APPROVED SCOPE → VERIFY → FULL DIFF REVIEW
→ UPDATE FREEBUFF AUDIT RECORD → HANDOFF REPORT
```

The approval checkpoint is never skipped for a risky change. Silence, a previous approval and an
inferred intention are **not** approval for a new risky action.

## 8. Conventions

*(Allowlist and planned-vs-actual conventions are the owner's, from the safety protocol §19/§18.)*

- **Task IDs:** `FB-NNN`, sequential, never reused.
- **Task files:** `tasks/FB-NNN-<short-description>.md`.
- **Test naming (owner-approved 2026-09-21):** a test created by Freebuff is named
  `fb-<task-id>-<topic>.test.mjs`, e.g. `fb-002-audit-trail.test.mjs`.
  *Because `server/scripts/run-tests.mjs` exits 2 when a `*.test.mjs` file is unclassified, creating a
  test also requires registering it there — that second file must be in the task's approved allowlist.*
- **File allowlist:** every implementation task declares `Allowed:` paths; everything else is
  implicitly protected. A file needed but not allowlisted means **STOP and request approval**.
- **Planned vs actual:** every task compares its frozen plan against the real diff and reports
  `PLANNED` / `IMPLEMENTED` / `UNPLANNED`.

## 9. Bootstrap note

`FB-001` (planning) and `FB-002` (creating this directory) both precede the existence of this trail
and are therefore marked **RETROACTIVE ENTRY** in `MASTER_LOG.md`. The audit record cannot log its own
creation in real time; that limitation is recorded rather than hidden.

## 10. What this directory must never contain

- Secrets of any kind: API keys, Firebase service-account JSON or private keys, JWT secrets, database
  URIs/passwords, OAuth secrets, tokens (including password-reset links carrying a token), cookies,
  certificates, `.env` values. Only "variable exists" / "credential configured" is ever written.
- Host-identifying absolute paths (e.g. user-profile paths appearing in tool error output).
- A copy of the architecture, the RBAC matrix, the schema, the Firebase policy or any phase definition.
  Cite the authoritative document instead.
