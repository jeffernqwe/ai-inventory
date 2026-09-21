# FB-NNN — <short task title>

> Audit record of a Freebuff task. **Not** architecture, **not** project history, **not** a
> specification. Authoritative sources: `docs/SYSTEM_SPECIFICATION.md`, `docs/DEVELOPMENT_ROADMAP.md`,
> `CLAUDE.md`, `docs/superpowers/specs/2026-09-18-firebase-auth-design.md`.
>
> Mark **`RETROACTIVE ENTRY`** here if this record was written after the task completed, and say why.

## Task Metadata

| Field | Value |
| --- | --- |
| Task ID | FB-NNN |
| Date | `<date/time + timezone; state the time source, or "not captured">` |
| Branch | `<branch>` |
| Starting HEAD | `<full sha + subject>` |
| Ending HEAD | `<full sha + subject, or "none — no commit">` |
| Request source | `<who asked, and where>` |
| Explicit approval status | `<approved / not approved — quote the approving words>` |

## Requested Objective

<What was explicitly asked for, in the requester's terms.>

## Scope

<What Freebuff was allowed to touch, including the explicit file allowlist.>

**Allowed files:**
```
<path>
```

## Out of Scope

<What was explicitly forbidden; what is protected; what requires separate approval.>

## Initial Repository State

```
git branch --show-current
<output>

git rev-parse HEAD
<output>

git status --short
<output>

git diff --stat
<output>
```

- Protected-file SHA-256 (pre-task): `<hash>` × 5 (see `BASELINE.md` §3)
- Relevant environment observations: `<no secrets; no host-absolute paths>`

## Files Inspected

<Read-only inspection list. Distinguish files read from files changed.>

## Existing Architecture Understood

<Only what was necessary for this task, in a few lines. Cite authoritative documents rather than
restating architecture. No schema, no RBAC matrix, no diagrams.>

## Existing Tests Discovered

**PRE-EXISTING (Claude Code / historical) — not Freebuff's:**
<list or reference to TEST_BASELINE.md>

**FREEBUFF-CREATED:** `<none | list>`

**FREEBUFF-MODIFIED:** `<none | list + before/after + approval reference>`

**TESTS RUN BY FREEBUFF:** `<none | file, mode, command, date, result>`

## Plan

<The frozen pre-execution plan: files, changes, verification approach, allowlist. Do not edit this
section after execution — an amendment is a new dated line.>

## Approval

<Quote the approval. Note explicitly that silence, a previous approval, an old approval, a general
"go ahead" and an inferred intention are NOT approval for a new risky action.>

## Actions

<Exact commands run (secret-free), file edits, additions, deletions, configuration changes, test
execution, verification, Git actions — in order. Record failed attempts too.>

## Changes

<Per file: what changed, why, behavioural effect, security implications, compatibility implications,
and provenance.>

## Verification

| Check | Command | Mode | Executed? | Result |
| --- | --- | --- | --- | --- |
| `<check>` | `<command>` | `<n/a>` | `<YES/NO>` | `<raw result or "NOT RUN">` |

<State plainly what was NOT verified. Never write "verified" for something only reasoned about;
label reasoning `REASONED, NOT VERIFIED`.>

## Failures / Unexpected Results

<Failed commands, surprising output, environment flakiness. Do not hide failures because the task
ultimately succeeded.>

## Final Diff Review

```
git status --short
<output>

git diff --stat
<output>

git diff --name-only
<output>
```

- `PLANNED`: `<list>`
- `IMPLEMENTED`: `<list>`
- `UNPLANNED`: `<none | list — STOP condition>`
- Protected-file violations: `<none | which + how — STOP condition>`
- Unrelated modifications: `<none | list>`

## Final Outcome

`SUCCESS` | `PARTIAL` | `BLOCKED` | `FAILED` | `STOPPED FOR SAFETY`

<One or two sentences.>

## Claude Code Handoff

- **Changed:** `<what a returning agent must know>`
- **Not changed:** `<explicitly untouched areas>`
- **Inspect first:** `<paths>`
- **Unresolved questions:** `<list>`
- **Known risks:** `<list>`
- **Tests to trust:** `<executed in this task, with command>`
- **Tests still needing a run:** `<anything only documented>`
