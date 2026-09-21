# DECISIONS — Freebuff decision, observation and inference register

> Audit record. **Not** a decision record for the Inventory AI product, and **not** a specification.
> Product decisions live in `docs/superpowers/specs/2026-09-18-firebase-auth-design.md` §14A and
> `docs/DEVELOPMENT_ROADMAP.md` §27E. Authoritative sources remain those documents.

**Register rules**

1. Every entry declares **exactly one** evidence class:
   `OWNER DECISION` · `DOCUMENTED FACT` · `SOURCE-CODE OBSERVATION` · `FREEBUFF INFERENCE` ·
   `FREEBUFF RECOMMENDATION`.
2. **An inference is never promoted to project policy.** A `FREEBUFF RECOMMENDATION` carries no
   authority until the owner approves it, at which point a *new* entry records the approval.
3. Entries are append-only; a revision is a new entry that references the one it revises.
4. `DOCUMENTED HISTORICAL RESULT` is never treated as `EXECUTED / VERIFIED BY FREEBUFF`.

---

## Part 1 — Owner decisions (authority: Jeffern)

### FB-D-001 — Include a task template · `OWNER DECISION`
- **Date:** 2026-09-21 (owner review of the FB-001 plan)
- **Context:** FB-001 proposed an optional `tasks/_TEMPLATE.md`.
- **Decision:** Include `docs/freebuff/tasks/_TEMPLATE.md`.
- **Evidence:** owner message, decision 1.
- **Resulting action:** the template exists; every task record follows it.
- **Freebuff interpretation:** none required — the decision is explicit.

### FB-D-002 — Freebuff-created test naming convention · `OWNER DECISION`
- **Question:** How are tests created by Freebuff distinguished from Claude Code's phase suites?
- **Decision:** `fb-<task-id>-<topic>.test.mjs` (examples given by the owner:
  `fb-002-audit-trail.test.mjs`, `fb-003-firebase-verification.test.mjs`).
- **Evidence:** owner message, decision 2.
- **Resulting action:** recorded in `README.md` §8 and `TEST_BASELINE.md`.
- **Freebuff observation (not a decision):** `server/scripts/run-tests.mjs` exits `2` when a
  `*.test.mjs` file on disk is unclassified, so creating a test also requires registering it there.
  That second file must be in a task's approved allowlist, or the task must stop and ask.

### FB-D-003 — Capture the earlier audit as an observations artifact · `OWNER DECISION`
- **Decision:** The earlier Freebuff architecture audit is captured **only** as Freebuff observations,
  documented discrepancies, evidence references and uncertainty/inference notes. It must **not** become
  an architecture specification, must **not** duplicate the Inventory AI architecture, and must **not**
  override existing authoritative documents.
- **Evidence:** owner message, decision 3.
- **Resulting action:** `tasks/FB-001-...md` §"FB-001 historical audit artifact" contains observations
  and pointers only; no architecture narrative, no schema, no RBAC matrix.

### FB-D-004 — Protected-file hashing approved · `OWNER DECISION`
- **Decision:** SHA-256 hashes of the five protected files are approved for `BASELINE.md` and for
  integrity checks.
- **Evidence:** owner message, decision 4.
- **Resulting action:** hashes recorded in `BASELINE.md` §3 and re-checked pre/post task.

### FB-D-005 — Historical ≠ executed (mandatory audit rule) · `OWNER DECISION`
- **Decision:** `HISTORICAL / DOCUMENTED RESULT` is **not** the same as `EXECUTED / VERIFIED BY
  FREEBUFF`. Freebuff may claim a test, build, Firebase behaviour, MongoDB behaviour, API behaviour,
  route count, lint, typecheck, EAS result, etc. as "verified" **only** when Freebuff actually executed
  the relevant verification. Historical Claude Code reports must remain labelled
  `DOCUMENTED HISTORICAL RESULT — NOT REPRODUCED BY FREEBUFF`.
- **Evidence:** owner message, decision 5.
- **Resulting action:** rule stated in `README.md` §1; applied throughout `TEST_BASELINE.md`,
  `BASELINE.md` §5/§9/§10 and every task record.

### FB-D-006 — Creation of `docs/freebuff/` does not authorize a commit · `OWNER DECISION`
- **Decision:** FB-002 must leave the repository **uncommitted** unless a separate explicit commit
  instruction is given. Staging, committing and pushing are prohibited for FB-002.
- **Evidence:** owner message, decision 6 and the "Do NOT" list.
- **Resulting action:** no `git add`, no commit, no push. The nine new files are left **untracked**.

### FB-D-007 — Freebuff's role in this repository · `OWNER DECISION`
- **Decision:** Freebuff is a **secondary / experimental** execution agent. Claude Code remains the
  primary implementation agent and the primary project-history/architecture author. Freebuff must not
  replace Claude Code, redefine the architecture, or create a competing source of truth. The only
  separate documentation layer authorized is `docs/freebuff/`.
- **Evidence:** owner message §"Inventory AI — Freebuff Permanent Audit Trail" (preamble and §16).
- **Resulting action:** no `FREEBUFF.md`/`AGENTS.md`/alternative spec is created; authority headers on
  every file in this directory.

### FB-D-008 — Freebuff may not silently correct repository documents · `OWNER DECISION`
- **Decision:** Do not modify existing Claude-authored architecture/history documents to insert
  Freebuff history, do not rewrite historical phase documents, and do not silently fix documentation
  drift (which is an observation, not an automatic task).
- **Evidence:** owner message §2 and §28.
- **Resulting action:** the FB-D-101…FB-D-111 drift entries below are **observations only**; no
  document was edited.

### FB-D-009 — Existing Claude Code tests are read-only knowledge · `OWNER DECISION`
- **Decision:** Do not rewrite, delete, weaken or "de-MUTATE" pre-existing tests; if one appears
  incorrect, document the concern instead of fixing it silently. Security and defense-in-depth tests
  require explicit approval to change.
- **Evidence:** owner message §8, §21, §22.
- **Resulting action:** recorded in `TEST_BASELINE.md`; zero pre-existing tests were touched by FB-002.

---

## Part 2 — Freebuff observations of documentation/source drift

> **Read this first (FB-D-100).** Every entry below is a `SOURCE-CODE OBSERVATION` or
> `DOCUMENTED FACT` pairing with a `FREEBUFF RECOMMENDATION`. **None carries owner approval. None was
> acted on. None is a task.** They are recorded so a future agent is not surprised by them, and so
> nobody "fixes" them by accident. The authoritative documents were **not** edited.

### FB-D-100 — Nature of these entries · `FREEBUFF INFERENCE`
- **Interpretation:** these discrepancies are consistent with a repository developed in strict phases
  where each phase's plan/status text is a snapshot of its time, and later phases supersede earlier
  statements without editing them. Confidence: **high** for the mechanism, **not authoritative**.
- **Approval:** none. **Action taken:** none.

### FB-D-101 — Mobile language: documents say JavaScript, source is TypeScript
- **Documented:** `README.md` line ~5 (`React Native + Expo + Expo Router (JavaScript)`) and the mobile
  section ("written in JavaScript", `lib/theme.js`, `lib/api.js`, `lib/permissions.js`,
  `lib/theme-context.jsx`); `docs/SYSTEM_SPECIFICATION.md` §3 (Mobile → JavaScript); both Phase 18
  plan documents ("JavaScript (no TypeScript)").
- **Source:** `mobile/package.json` declares `typescript` and a `typecheck` script; the mobile tree
  contains ~100 `.ts`/`.tsx` files, and the referenced modules are `.ts`/`.tsx`
  (`lib/client.ts`, `lib/api.ts`, `lib/permissions.ts`, `lib/theme.ts`, `lib/theme-context.tsx`).
- **Class:** `SOURCE-CODE OBSERVATION`. **Confidence:** high.
- **Why it matters:** a future agent reading only the README/spec could assume JavaScript and write
  JavaScript into a TypeScript workspace.
- **Freebuff recommendation:** owner decides; if reconciled, note that `CLAUDE.md` §2 and the Firebase
  design doc §14.10 already treat the mobile stack as TypeScript. **No file changed.**

### FB-D-102 — Mobile test runner exists; Phase 18 plans say it does not
- **Documented:** both Phase 18 plan documents state "no test runner — verification is `npx expo export`
  + emulator smoke".
- **Source:** `mobile/package.json` has jest, jest-expo and @testing-library/react-native with a `test`
  script; `mobile/__tests__/` holds 15 suites.
- **Class:** `SOURCE-CODE OBSERVATION`. **Confidence:** high.
- **Interpretation (`FREEBUFF INFERENCE`):** historically accurate when written; later phases added the
  runner. **No file changed.**

### FB-D-103 — Phase 18E plan status and prescribed commit trailer are both superseded
- **Documented:** the 18E plan says "PLAN ONLY — not approved, not started", and its commit boundary
  prescribes a `Co-Authored-By: Claude Code …` trailer.
- **Source / project record:** `README.md` and `CLAUDE.md` record 18E as shipped (`979968a`, plus the themed
  header follow-up `04a2b3d`); `CLAUDE.md` §16 now forbids Claude Code / AI co-author trailers.
- **Class:** `DOCUMENTED FACT` (both statements are in the repository) + `SOURCE-CODE OBSERVATION`.
- **Why it matters:** following the plan's commit recipe verbatim would violate the project's current
  attribution rule. **Freebuff recommendation:** do not follow it; treat the plan as a historical
  artifact. **No file changed.**

### FB-D-104 — Phase 18 plans pin hashes of files that no longer have those names
- **Documented:** 18C/18E plans freeze `mobile/app/(app)/_layout.js` and
  `mobile/components/SignOutIcon.jsx` at pinned sha256 values.
- **Source:** the files are `_layout.tsx` and `SignOutIcon.tsx`; `CLAUDE.md` §7 records that the owner
  later **lifted** that freeze (both now read the theme).
- **Class:** `SOURCE-CODE OBSERVATION`. **Confidence:** high. **No file changed.**

### FB-D-105 — Route-count snapshots vs observed route registrations
- **Documented:** the Firebase design doc §15/§19 say the two new public routes take the inventory
  "from 60 → 62 routes and 6 → 8 public"; `README.md`'s Phase 28 entry says "65 routes — none added".
- **Source:** Freebuff read every `server/src/routes/*.ts` registration plus `app.ts` and counted
  **68** route registrations — **47** permission-gated, **11** authenticated, **10** public,
  **0** role-gated.
- **Class:** `SOURCE-CODE OBSERVATION`. **Confidence:** medium-high for the totals.
- **Method limitation (recorded honestly):** this count was produced by **reading source**, not by
  running the Phase 23 classifier, and no test was executed. The classifier (which discovers routes
  from `app.ts` and asserts bucket *membership*, not counts) remains the authority. If a future task
  needs canonical numbers, run the DB-free suite rather than trusting this entry.
- **Interpretation (`FREEBUFF INFERENCE`):** the 60/62 figures are a 32A-era planning baseline that
  predates Phases 26A/26B; the deltas are right, the absolute numbers are stale. **No file changed.**

### FB-D-106 — EAS build statements contradict later project records
- **Documented:** `docs/SYSTEM_SPECIFICATION.md` §48 and the Phase 30A/32F narratives state no EAS
  development build has been created; the Phase 32G record states the opposite and lists three
  finished Android builds, correcting the earlier claims.
- **Class:** `DOCUMENTED FACT` (the contradiction exists in the documentation).
- **Uncertainty:** the true EAS build history is **not verifiable from the repository**, and Freebuff
  made no network/EAS call. `AUTHORSHIP UNKNOWN` beyond what the documents claim.
- **Freebuff recommendation:** a "superseded by" pointer, if the owner wants one. **No file changed.**

### FB-D-107 — M1 vs M2 is recorded as open, but the shipped implementation is the M2 shape
- **Documented:** the Firebase design doc records M1 (native React Native Firebase) vs M2 (JS SDK /
  `expo-auth-session`) as an **open** owner decision (`O-4`).
- **Source:** `mobile/package.json` includes the `firebase` JS SDK and no native Firebase module;
  `mobile/lib/firebase.ts` imports `firebase/app` + `firebase/auth` and is gated on
  `EXPO_PUBLIC_FIREBASE_*`; `README.md`'s environment section already describes "the M2 path".
- **Class:** `SOURCE-CODE OBSERVATION`. **Confidence:** high that the implementation is M2-shaped.
- **Freebuff interpretation:** not my decision to record M2 as *chosen* — that is a project decision.
  **Freebuff recommendation:** the owner may wish to record it explicitly so a future agent does not
  treat the choice as still unmade. **No file changed.**

### FB-D-108 — Specification §31 lists a module with no mount
- **Documented:** `docs/SYSTEM_SPECIFICATION.md` §31 lists `/api/businesses` among REST modules.
- **Source:** `app.ts` mounts no `/api/businesses` router (the specification itself corrects
  `/api/transactions`, but not `/api/businesses`).
- **Class:** `SOURCE-CODE OBSERVATION`. **Confidence:** high. **No file changed.**

### FB-D-109 — README endpoint tables are incomplete (not contradictory)
- **Documented:** the README endpoint tables list auth/register/login/me/patch/change-password and the
  session routes.
- **Source:** the tables omit the password-recovery routes, the Firebase routes, the barcode routes and
  the health sub-probes, although prose sections elsewhere in the README describe most of them.
- **Class:** `SOURCE-CODE OBSERVATION`. **Confidence:** high. **No file changed.**

### FB-D-110 — Roadmap Phase Overview lacks sections for some phases (self-documented)
- **Documented:** `docs/DEVELOPMENT_ROADMAP.md` §3 and its body have no sections for Phases 12/13/14B
  (and no delivered-work section for Phase 09/30B), while other documents reference those phases as
  shipped.
- **Class:** `DOCUMENTED FACT` — the roadmap itself notes the gap ("a pre-existing gap", at its own
  lines 1185/1257/1334). **Confidence:** high. **No file changed.**

### FB-D-111 — All test/lint/build counts in the documentation are historical
- **Documented:** phase entries quote many totals (e.g. suite 459 → 469; `test:unit` 209 / `test:db`
  394; a 25-test Firebase-linking suite; 60 guard tests; 11 mobile jest suites / 88 tests).
- **Class:** `DOCUMENTED HISTORICAL RESULT — NOT REPRODUCED BY FREEBUFF`.
- **Freebuff execution status:** **none of these was executed by Freebuff.** See `TEST_BASELINE.md`.
- **Freebuff recommendation:** never present these as current, and never as Freebuff-verified.

### FB-D-112 — CORRECTION OF FB-D-105 · route inventory: 68 is current, 67 is stale (design doc §2.6) · `SOURCE-CODE OBSERVATION` + `DOCUMENTED FACT`
- **Date:** 2026-09-22, recorded during FB-005.
- **Revises:** FB-D-105 (kept byte-identical above, per owner decision 1 of the FB-005 approval — the register stays append-only).
- **Current source observation (`SOURCE-CODE OBSERVATION`, FB-004; read from source in two independent ways — NOT executed):** the mounted route set is **68 routes = 47 permission-gated + 11 authenticated + 10 public + 0 role-gated**. Method 1: per-module `router.(get|post|put|patch|delete)` registrations sum to 67, plus the app-level `GET /`. Method 2: the Phase 23 guard's declared exemption lists count 10 `PUBLIC_ROUTES` + 11 `AUTHENTICATED_ROUTES` + `ROLE_GATED_ROUTES = []`, with the 47 gated routes as the remainder — independently confirmed by 47 registrations naming `requirePermission(` as handler #2.
- **Stale authoritative figure (`DOCUMENTED FACT`):** `docs/superpowers/specs/2026-09-18-firebase-auth-design.md` §2.6 states "Phase 23 classifies **67 routes**: 47 permission-gated, **10** authenticated, 10 public, 0 role-gated" — authored at Phase 32F (`5d7d1df`).
- **Cause (`SOURCE-CODE OBSERVATION`):** **Phase 32H (`d8b693a`) added `POST /api/auth/firebase/link`** as an 11th authenticated route and declared it in `AUTHENTICATED_ROUTES` in the same commit; §2.6's own arithmetic (60 + 3 + 2 + 2) was never updated to account for the +1.
- **Internal inconsistency (the document disagrees with itself):** the same design doc already documents the route in §14B.1 as "AUTHENTICATED (requireAuth + controller, no permission)", and its §2.6 auth-surface table lists 12 of the 13 `auth.routes.ts` routes — the missing row is exactly the Phase 32H route.
- **Correction of FB-D-105's citation note:** FB-D-105's *numbers* (68 / 47 / 11 / 10 / 0) were right; its *citation* compared against the superseded Phase 32A planning line ("60 → 62", design doc line 1165) rather than the live §2.6 statement, and did not name the document carrying the stale figure. This entry supersedes that citation detail only.
- **Not an authorization defect:** the link route is correctly `requireAuth`-only and correctly classified `AUTHENTICATED`; the 47-gated tier is unchanged across Phases 26A/26B/32C/32H. **This is documentation drift, not a security finding.** No new architecture rule is introduced by this entry.
- **Method caveat (unchanged from FB-D-105):** all counts were produced by reading source, not by executing the Phase 23 classifier (which asserts bucket membership, not counts, and was not run).
- **Approval:** none needed for the observation itself; the *correction of the design doc* was separately authorized — see FB-D-113.
- **Action taken:** design doc §2.6 corrected under FB-005 (documentation only). The Phase 23 guard was not touched and no count assertion was added (that would contradict the guard's documented design).

### FB-D-113 — Authorised correction of the §2.6 route inventory · `OWNER DECISION`
- **Date:** 2026-09-22 (the FB-005 approval).
- **Context:** FB-D-008 records that no Claude-authored document had been edited by Freebuff and forbids *silent* correction of documentation drift. FB-004 confirmed §2.6 of the design doc is stale by one route (FB-D-112).
- **Decision (owner, FB-005 approval):** Freebuff may correct **§2.6 only** of `docs/superpowers/specs/2026-09-18-firebase-auth-design.md` — the count line, the arithmetic/explanation (Phase 32H's +1 accounted for explicitly), and the missing `POST /api/auth/firebase/link` table row — with the correction attributed and dated in place as documentation-only, the historical Phase 32F statement preserved as historical context, line 1165 (the historical "60 → 62" planning statement) untouched, and all sections outside §2.6 byte-identical.
- **Evidence:** owner approval message — decisions 2 and 6, and the "For the authoritative Firebase design document" constraint block.
- **Resulting action:** applied under FB-005. This does **not** weaken FB-D-008: that rule forbids *silent* fixes; this one is explicit, scoped, dated and recorded. It is a one-off; extending it to any other drift item (FB-D-101…FB-D-104, FB-D-106…FB-D-111) requires a fresh explicit authorization.
- **Commit status:** the design doc's working-tree diff is intentional and **uncommitted** by owner decision 6; committing requires a separate future instruction.

---

## Part 3 — Freebuff inferences that are explicitly NOT decisions

| Entry | Inference | Confidence | Approval | Action |
| --- | --- | --- | --- | --- |
| FB-I-01 | "Phase 32I" has no defined scope anywhere in the repository; mapping it to Google Sign-In would be an inference, not a fact | high | none | none — Freebuff will not infer the next phase |
| FB-I-02 | The two untracked protected plan documents are phase-18 planning artifacts whose status text is historical rather than a current work queue | medium | none | none |
| FB-I-03 | The three tracked protected diffs belong to an in-flight AI-provider/test workflow, judging by their paths; their intent is `AUTHORSHIP UNKNOWN` because Freebuff did not read their content | low-medium | none | none — content not read, files not touched |

**Closing statement.** No `FREEBUFF INFERENCE` or `FREEBUFF RECOMMENDATION` in this file has been, or
may be, converted into an Inventory AI project decision or policy by Freebuff. That requires an
explicit `OWNER DECISION`, recorded as a new entry.
