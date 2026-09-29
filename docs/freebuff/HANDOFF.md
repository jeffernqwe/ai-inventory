# HANDOFF — Freebuff → next primary agent (Claude Code)

> Operational summary. **Not** architecture, **not** project history, **not** a specification.
> Authoritative sources remain `docs/SYSTEM_SPECIFICATION.md`, `docs/DEVELOPMENT_ROADMAP.md`,
> `CLAUDE.md`, `docs/superpowers/specs/2026-09-18-firebase-auth-design.md`.
> Last updated by the **Phase 32N Firebase-only authentication design record** (2026-09-29) — the
> OpenRouter test-verification & documentation reconciliation,
> after the Phase 7 current-state reconciliation (2026-09-28). The historical blocks §1
> (FB-002 → FB-005), §1a (FB-006) and §1b (FB-007 / FB-008) are preserved as written; **FB-012** is the
> latest trail task.

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
| 16 | Committed? | **No** (as of FB-008). HEAD was unchanged at `8af1d49`; nothing staged; nothing pushed. FB-008's proposed message is recorded in its task record |
| 17 | Deployed / Console / schema touched? | **No** on every count. **No schema or index change** — the design is deliberately schema-free |

**The single most important answer:** the Phase 32L runtime experiment **refuted the project's own
recorded assumption** that Firebase refuses to remove the last provider — it succeeded, leaving an
account with zero providers (calibrated against `updatePassword`, which *was* refused at the same session
age). **The last-authentication-method rule must therefore be enforced server-side and never delegated
to Firebase.** See `DECISIONS.md` **FB-D-119** / **FB-D-120**.

## 2. Current state

| Field | Value |
| --- | --- |
| Branch | `main` |
| HEAD | `bbc29b4bbc96cfe204610875b0a5ef93a676fa2d` — "docs: reconcile the Phase 4B deployment and boundary findings" (the Phase 4B documentation reconciliation; preceded by `a95a461` (the ignore-boundary checkpoint), `d14ad86`, `0152f8a`, `d309252` (Phase 4A), `6e32717` and `751d796`). The historical chain recorded above (`8af1d49` → `6bac86e2` → `d8b693a`) is intact and fully contained in `main`. **Phase 32N's commit is the successor to `bbc29b4`** and is not yet reflected in this row — the same one-step self-reference lag every earlier reconciliation accepted rather than amending history |
| Freebuff-touched commits | `6bac86e2` (FB-005), `8af1d49` (FB-006), `01ae73f` and `9917447` (Phase 32L-A records) and `0c3f87d` (Phase B / 32I / 32J / 32L-B) — every commit that has touched `docs/freebuff/`. All are ancestors of `main` |
| Files added by Freebuff | **20 tracked files under `docs/freebuff/`** — six top-level trail files (`README`, `MASTER_LOG`, `BASELINE`, `DECISIONS`, `TEST_BASELINE`, `HANDOFF`) plus 14 under `tasks/` (`_TEMPLATE.md` and records FB-001 … FB-012). The directory is **tracked, committed and clean** |
| Files modified/deleted by Freebuff | **Modified (FB-005):** the four trail files in Q5 + `TEST_BASELINE.md` §4 + the design doc **§2.6 only**. **Modified (FB-006 – FB-012):** the surfaces recorded in §1a, §1b and the corresponding task records. **Deleted: none** |
| Tests run by Freebuff | **FB-006 and FB-008: yes** (see §1a, §1b). FB-001–FB-005 and FB-007: none. Later trail tasks (FB-009 … FB-012) are not summarized here — see their own task records |
| Repository commit state | **Committed and pushed.** `main`, `origin/main` and the live remote all stand at `bbc29b4` at the start of Phase 32N, **0 ahead / 0 behind**; the working tree is **fully clean** — no tracked change and nothing staged. (`?? .freebuff/` no longer appears: `.freebuff/` is now ignored by the repository, and the **two Phase 4B ignore-boundary decisions are CLOSED** — see §2 *Current phase* below.) This supersedes the "partially committed / nothing has been pushed" state recorded in §1a and §1b — `docs/freebuff/` is tracked and clean, and the Phase 32I / 32J / 32K / 32L work is committed |
| AI provider (current) | **OpenRouter** — an Anthropic-compatible gateway, selected server-side by `AI_PROVIDER` and requiring `OPENROUTER_API_KEY` + `OPENROUTER_BASE_URL` + `AI_MODEL_OPENROUTER` (no default model). The retired **AgentRouter** gateway has been removed. The integration **is working in test production**; the historical `server/test/phase-openrouter-provider.test.mjs` failure was **test isolation, not a production defect** — that suite runs against a local HTTP stub, never contacts the real API and cannot consume credits. Record: `docs/DEVELOPMENT_ROADMAP.md` §27S; fix commit `751d796` |
| Current phase | **No application phase is active.** Phases 1–7 of the earlier documentation-reconciliation programme, **Phases 1–2 of the OpenRouter test-verification thread** and **Phase 4 (4A, 4B) of the deployment-configuration thread** are committed and pushed, and **Phase 32L is fully shipped** — 32L-A in `01ae73f`, 32L-B in `0c3f87d`, recorded in `docs/DEVELOPMENT_ROADMAP.md` §27Q. Deployment configuration is recorded in `docs/DEVELOPMENT_ROADMAP.md` §27T and `docs/AUTH_SECURITY_MASTER_CHECKLIST.md` §38. **The two Phase 4B ignore-boundary decisions are closed** (`a95a461` added `.freebuff/` and `.claude/settings.local.json` to the root `.gitignore`; both verified). **Phase 4B's open password-recovery item is now ANSWERED BY A LOCKED DIRECTION but NOT implemented.** The separate read-only audit was performed and the owner has locked **Firebase-only authentication** in **Phase 32N** (documentation only): Firebase takes over reset/recovery, so the 26B/27 endpoints, the reset-token model and the Resend mail layer are on a **retirement path** — and **none of them was removed by that phase**. **Production password recovery remains non-functional on Render** (mail delivery is unconfigured, so `forgot-password` answers 503 by design), and **no `PASSWORD_RESET_URL` value is decided**. Records: design **§14C**, checklist **§39**, roadmap **§27U**. Still open: the Firebase-only register **OD-1…OD-8** plus **O-5**, **O-6**, **O-11**; and the action-link live test (L-17) is **only half done** — **N-2 (2026-09-29)** verified the Android app/OS half on the installed development build (`inventoryai://reset-password` resolves and routes, a query parameter is read) and found that the screen reads `?token=` while Firebase sends `?oobCode=`, but the **Firebase email side is UNVERIFIED** (no inbox or Console access), so the gate stays open and **iOS is entirely unverified**. The "32L-A uncommitted / 32L-B does not exist" state recorded above is superseded. **N-3 (2026-09-29) is implemented and NOT yet committed** — Firebase-native password recovery shipped **additively** on the mobile side: two native verbs (`sendPasswordResetEmail` with `ActionCodeSettings` for `inventoryai://reset-password`, and `confirmPasswordReset`), the Phase 1 `FORBIDDEN` verb map relaxed for **exactly one verb** with the reason written in place, `forgot-password` Firebase-first with the 26B endpoint reachable **only** on an unconfigured build, and `reset-password` redeeming `?oobCode=` through Firebase while `?token=` still uses `POST /api/auth/reset-password`. Enumeration resistance moved into the client (`auth/user-not-found` / `auth/user-disabled` answer **sent**), a failed redemption can never fall back to the server, and the `auth/*-continue-uri` family answers as a **configuration fault**. **No server file, route, permission, schema, dependency, environment variable, EAS or Firebase Console setting changed**, and the 26B/27 stack and the Resend mail layer are **untouched** (N-7 removes them). Verified: mobile **36 suites / 509 tests**, `tsc`/`eslint` clean (server suites were not run — no server file changed). **★ The action-link gate L-17 remains OPEN: no Firebase reset email was generated, received or inspected, no live project or device run was performed, so the phase's test items 2–7 are BLOCKED and the Firebase email/action-link behaviour is NOT verified.** A Firebase-native reset also **does not revoke Inventory AI sessions** (the credential-change bridge is N-4, designed and NOT implemented). Records: design **§14C.4.2**, roadmap **§27U**, checklist **§39** (F-8b, F-9, F-10, F-11). **★ An on-device run against the live project WAS then performed (2026-09-29), and it NARROWED the gate.** Driven by Metro into the **F2.9 development APK** on `PV4DDMIZZLTCIVSK`: a `?oobCode=` link **renders the reset form** (the `token`-vs-`oobCode` mismatch that dead-ended it is closed client-side, on a device), the legacy `?token=` path still works, `sendPasswordResetEmail` for `jeffern1233@owner.com` reached the project and answered **`onComplete:success`**, and a deliberately fake code produced `FirebaseAuthActionCodeException` → the screen's *"invalid or has expired"* copy. **The project ACCEPTED the custom-scheme `ActionCodeSettings`.** **Still unverified: delivery and the email's link**, because `onComplete:success` is returned even for an unknown address under email-enumeration protection and the screen deliberately cannot tell them apart; **items 3/6/7 remain BLOCKED and L-17 stays OPEN**. Two environment facts worth keeping: the device previously carried the **`preview`** APK (`4160dee1-…`, `4ca36c6`), which embeds its bundle and **cannot be driven by Metro**, so F2.9's dev APK was installed over it **by owner decision** (preview reinstallable from its EAS artifact URL); and **Metro was left running on `:8081`** because it is what loads this code. No real `oobCode` was ever obtained, used or recorded. This Freebuff entry records the phase itself; the FB-xxx task-record series and `MASTER_LOG` were deliberately **not** extended by it |

## 3. Inspect first

1. `docs/freebuff/MASTER_LOG.md` — the trail entries, now **FB-001 through FB-012** (FB-001–FB-004 are `RETROACTIVE ENTRY`).
2. `docs/freebuff/tasks/FB-002-create-freebuff-audit-trail.md` — exactly what FB-002 created and verified.
3. `docs/AUTH_SECURITY_MASTER_CHECKLIST.md` §32/§38 — the **current** protected-file integrity register. (`docs/freebuff/BASELINE.md` §3 holds the **historical FB-002** hashes and is not the live register — see BASELINE §13.)
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

Verified byte-identical before and after FB-002. The FB-002 SHA-256 values in `BASELINE.md` §3 are **historical evidence**, not the current register; current protected-file integrity is maintained in `docs/AUTH_SECURITY_MASTER_CHECKLIST.md` §32/§38. Their content was **not
read** by Freebuff; their intent is `AUTHORSHIP UNKNOWN`.

## 5. Project-side open items — references only (Freebuff decided nothing)

Freebuff lists these **only** so a returning agent knows they exist. They live in
`docs/SYSTEM_SPECIFICATION.md` §29 and `docs/superpowers/specs/2026-09-18-firebase-auth-design.md`
§14A.5 (`O-1` … `O-11`), with dispositions recorded in `docs/DEVELOPMENT_ROADMAP.md` §27B/§27D/§27E.
Freebuff neither restates nor resolves any of them. **Phase 32I is no longer undefined** — it shipped
with Phase 32J and 32L-B in `0c3f87d`; Freebuff simply never inferred it (`FB-I-01`).

## 6. Known risks Freebuff flags for the next agent

| Risk | Why it matters | Freebuff's mitigation |
| --- | --- | --- |
| Line-ending normalization on the protected tracked files | A `git add` or an edit could rewrite whole files and bury the real diff | Hashes recorded; never stage; never format |
| Blanket staging (`git add -A`) | This directory was untracked once and would have been swept in; it is now **tracked and committed** (20 files), but the protected files remain sensitive to a blanket add | Stage by explicit path only — never `git add -A` |
| Drift temptation | The drift list looks like a TODO list; it is not | `DECISIONS.md` FB-D-100 states it is observation only |
| Test-count drift in docs | Quoted totals are historical snapshots | `TEST_BASELINE.md` §0/§5 labelling rule |
| New test file breaks `npm test` | `scripts/run-tests.mjs` exits 2 on an unclassified file | Documented in `TEST_BASELINE.md` §1; allowlist that file if a task adds a test |
| Freebuff has now edited a Claude-authored authority (design doc §2.6) | A one-off, owner-authorized, minimal correction — not a precedent | FB-D-112/FB-D-113 record it; scope was §2.6 only; any further edit needs fresh authorization |
| Freebuff has now modified **pre-existing tests** (FB-006) | Trail rule 5 forbids modifying a pre-existing test to make new work pass, and two exact-allowlist guards genuinely failed against the authorized additive field | FB-D-114 records it; both were **strengthened, not weakened** (no assertion removed) — they remain the only such files |
| The **commit scope** was non-obvious at FB-006 | The changed files also carried Phase 32I/32J hunks, so committing the FB-006 set alone would have swept that work in | **Resolved.** The owner decided the scope and the commits landed; nothing from the FB-006 era remains uncommitted |
| FB-006 has **no runtime verification** | Everything it proves is a test/lint/typecheck result; the boundary has never been exercised on a device | Stated in the record, the roadmap §27M and the README entry — do not read it as observed behaviour |

## 7. Pending work

**FB-012 is the latest Freebuff trail task** (Phase 1 owner decisions frozen). The historical record of
what FB-006 executed, and of the FB-007 / FB-008 work, is preserved in §1a and §1b; **every change it
describes is now committed and pushed.**

Waiting on the owner, in priority order:

1. **The uncommitted work recorded at FB-006** — the Phase 32K README entry, roadmap §27M, Phase
   32I/32J, and the two FB-006 post-commit notes — **is resolved**: all of it is committed, and `main`
   equals `origin/main` at `0c28e74`.
2. **O-1** — the unlink policy and last-authentication-method protection. Phase 32L shipped under
   **Policy B** (`01ae73f` server, `0c3f87d` mobile; recorded in `docs/DEVELOPMENT_ROADMAP.md` §27Q)
   and the last-authentication-method invariant is enforced server-side. **O-1 is not declared
   formally closed here** — that belongs to the project's own authoritative security records.
3. **Phase 32L's authorization** — no longer undefined: the phase was authorized and shipped
   (`01ae73f` server, `0c3f87d` mobile).

The remaining FB-D drift entries are observations, not tasks. Any next task requires a fresh,
explicit approval naming its scope — an earlier approval is not transferable.
