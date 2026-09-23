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

### FB-D-114 — Two pre-existing test files were modified under FB-006 · `OWNER DECISION` (FB-006 authorization) + `SOURCE-CODE OBSERVATION`
- **Date:** 2026-09-23 (FB-006).
- **What happened:** `npm test` failed in two PRE-EXISTING files after the Phase 32K change:
  `server/test/phase26a-session-lifecycle.test.mjs` (asserts the exact key set of `GET /api/auth/me`) and
  `server/test/phase32c-firebase-exchange.test.mjs` (asserts the exact key set of the exchange's public
  user DTO). Both are **exact-allowlist** guards, so the single additive field `authMethods` made them
  red — correctly. They were not wrong.
- **Why this needs an entry (trail rule 5 / `TEST_BASELINE.md` §6 rule 5):** Freebuff must never
  modify, weaken or delete a pre-existing test to make new work pass, and must document the concern
  rather than "fix" it.
- **What was done, and why it is NOT a weakening:** each file keeps its exact-shape `deepEqual`
  assertion (now including `authMethods`) **and gained a NEW assertion** that the serialized payload
  contains no `firebaseUid` / no `firebaseUid` field name. Nothing was removed, relaxed or skipped, and
  no other case in either file was touched. The guards now state the property they exist to protect
  rather than leaving it implied by the list.
- **Evidence:** the failing output (actual keys vs expected keys), then 795/106/0 on the re-run.
- **Authority:** the FB-006 brief authorizes the implementation; the change to these two files is a
  necessary consequence of the authorized additive DTO field, and is declared here and in the FB-006
  record rather than left implicit.

### FB-D-115 — New test files: `fb-006-*` conflict resolved in favour of the project series (`phase32k-*`) · `OWNER DECISION`
- **Date:** 2026-09-23 (FB-006).
- **Observation (`SOURCE-CODE OBSERVATION`):** `TEST_BASELINE.md` §6 rule 1 (owner-approved, FB-D-002)
  requires a test Freebuff creates to be named `fb-<task-id>-<topic>.test.mjs`. The project's own
  convention for every other suite is `phaseNN-<topic>.test.mjs` (or a topic name under
  `mobile/__tests__/`), and the FB-006 brief describes the work as "Phase 32K".
- **Conflict:** the two conventions give different names for the same two files. Freebuff first applied
  trail rule 1 (the files were created as `fb-006-*`, which is the compliant reading) and declared the
  conflict here rather than hiding it.
- **Owner decision (`OWNER DECISION`):** the project series governs — **rename to `phase32k-*`**. The
  files are `server/test/phase32k-firebase-password-boundary.test.mjs` and
  `mobile/__tests__/phase32k-password-capability-gating.test.tsx`.
- **Resulting action:** both files renamed; references updated in `run-tests.mjs` (still `PURE_DB`),
  roadmap §27M, the README Phase 32K entry, and every trail file that named the old paths.
- **Note for a future task:** trail rule 1 and the project's `phaseNN-*` series will collide again for
  any Freebuff task that lands a project phase. Recorded so the next task asks rather than picks.

### FB-D-116 — Unlink design (Phase 32L / O-1): recommended policy is "unlink = detach + establish a fresh local password" · `FREEBUFF RECOMMENDATION` — **NOT a decision**
- **Date:** 2026-09-23 (FB-007).
- **Observation (`SOURCE-CODE OBSERVATION`):** no unlink capability of any kind exists — no route, no
  service, no helper, no audit action, no provider field on any model, and no mobile surface
  (`lib/api.ts` exports `firebaseExchange` and `firebaseRegister` only). The two dangerous end-states
  are therefore unreachable **only because the operation does not exist**, not because anything
  guards them.
- **Recommendation:** one authenticated `POST /api/auth/firebase/unlink`, account from `req.user.id`,
  identity from a **verified** Firebase ID token whose uid must **equal the account's own
  `firebaseUid`**, body `{ idToken, newPassword }`, one **conditional write**
  (`{ _id, firebaseUid: tokenUid }`) that sets `firebaseUid: null`, `emailVerified: false`, the freshly
  hashed password and `passwordChangedAt`, plus `revokeAllSessions`; two audit actions carrying no uid;
  no schema change; `authMethods: { password, firebase }`.
- **Why this option:** it is the only one of the four considered that closes **both** Case A (lockout)
  and Case B (silent reactivation) with **one uniform rule**, by **replacing** the retained hash rather
  than resurrecting it — which is also the first concrete answer to why Phase 32K retained it.
- **Conflict declared:** this is the **one** place a `passwordHash` would be written for a
  `firebaseUid` account, so it is a deliberate exception to Phase 32K's "local password operations do
  not apply" boundary and must be documented as such.
- **Authority:** **none.** No owner decision taken. Recorded here as a recommendation so it cannot be
  mistaken for policy; the five owner-only questions are listed in the FB-007 record.

### FB-D-117 — Phase 32H's server-side link route has no mobile surface at all · `SOURCE-CODE OBSERVATION`
- **Date:** 2026-09-23 (FB-007).
- **Observation:** `mobile/lib/api.ts` exports **two** Firebase calls — `firebaseExchange` and
  `firebaseRegister`. There is **no** `firebaseLink` wrapper, no "Connect Google" screen, and no
  caller of `POST /api/auth/firebase/link` anywhere under `mobile/`.
- **Consequence:** the server-side linking boundary is complete but **unreachable from the app**, so no
  user can currently attach a Firebase identity to an existing password account. A future phase that
  assumes the link UI exists (or that unlink would be the client-side inverse of a working app flow)
  would be built on a false premise.
- **Authority:** none needed — an observation, not a decision.

### FB-D-118 — CORRECTION: the repository records "the server cannot unlink a provider" as a capability fact; it is a capability fact about the *client* only · `SOURCE-CODE OBSERVATION` + `DOCUMENTED FACT`
- **Date:** 2026-09-23 (FB-007, second pass).
- **Observation:** the installed `firebase-admin@14.4.0` declares
  `UpdateRequest.providersToUnlink?: string[]` (*"Unlinks this user from the specified providers."*,
  `lib/auth/auth-config.d.ts:158-160`), alongside `providerToLink`, `getUser(uid).providerData`
  (`user-record.d.ts:241`) and `revokeRefreshTokens(uid)` (`base-auth.d.ts:321`). **None of the four is
  referenced anywhere under `server/src/`.**
- **Drift:** the specification §29 states *"Unlinking is a client-side Firebase operation, so the server
  cannot observe it"*, and both the specification and design document §14B state that attaching a
  provider *"is not a server-side operation at all — the server neither performs it nor has an API for
  it."* Both remain true as statements about **what the client does and what the server can observe**;
  both are **inaccurate as statements of server capability**. The server *does* have the API, and a
  server-performed unlink *would* be observable by definition.
- **Scope of the correction:** a capability correction only. Phase 32H's **choice** not to perform
  provider linking server-side stands unchanged and is not criticised here; only its recorded *reason*
  is superseded. No behaviour is proposed or changed, and the FB-007 recommendation does not depend on
  this finding in either direction.
- **Verified vs unverified:** the **declaration** is `[SOURCE]`. The **runtime semantics** — whether the
  last provider can be removed, and whether an existing refresh token survives an unlink — are
  **`[EXTERNAL VERIFICATION REQUIRED]`**. The same SDK's doc comment on `providerToLink` warns that
  linking does **not** invalidate the refresh token, which is a caution that unlinking may not either.
- **Authority:** none. Recorded as an observation/correction for a future reviewer so the old wording
  does not rule out an available design.

### FB-D-119 — Phase 32L architecture FROZEN by the owner · `OWNER DECISION`
- **Date:** 2026-09-23 (FB-007, fourth pass — decision freeze).
- **What was decided:** the Phase 32L unlink architecture, superseding the FB-D-116 recommendation
  where the two differ. Frozen verbatim in `tasks/FB-007-phase-32l-decision-freeze.md`: **recency =
  Option D** (client reauthenticates *when required*; **server verifies the signed `auth_time`**; `iat`
  is **not** a freshness signal; window **300 s**) · **provider unlink is client-side cleanup only**,
  with Admin `providersToUnlink` **verified-but-future** · **dedicated codes**
  (`FIREBASE_IDENTITY_NOT_LINKED` for "nothing is linked"; `FIREBASE_IDENTITY_CONFLICT` preserved for
  genuine conflicts) · **`authMethods = { password, firebase }`** · **business status inherited** from
  `requireAuth → assertActiveBusiness` · **Policy B** (unlink requires a NEW password; the retained hash
  is never resurrected) · a **mandated reset-token race contract** · identity rules preserved (uid is
  the linkage key, **email is not a join key**) · sequence **server-unlink-first**.
- **What changed versus FB-D-116:** FB-D-116 was a `FREEBUFF RECOMMENDATION`; this is the owner's
  decision. The recommendation's own second-pass refinement (that the business-status question was
  already settled by the middleware) was **confirmed** by the owner. The race contract was **added** by
  the owner and did not originate in the recommendation.
- **Implemented by:** FB-008 (Phase 32L-A, backend only). **Provider unlink was deliberately NOT
  implemented**, per the freeze.
- **Authority:** the owner's explicit freeze instruction. Recorded here so no later task treats the
  unlink design as still open.

### FB-D-120 — ★ The last-provider belief is REFUTED by runtime experiment; the freshness refusal is 409, not 403 · `EXPERIMENT` + `SOURCE-CODE OBSERVATION`
- **Date:** 2026-09-23 (FB-007 fourth pass experiment; FB-008 implementation).
- **★ Refutes FB-D-118's unaudited half and the project's recorded assumption.** The Phase 32L runtime
  experiment, run against the **real** Firebase project with the installed client SDK on dedicated
  throwaway accounts, observed client `unlink()` of the **only** provider **SUCCEEDING** and leaving the
  account with **zero** providers. Repeating it yields `auth/no-such-provider`. The experiment was
  **calibrated**: at the same 390-second session age the same harness observed `updatePassword`
  **REFUSED** with `auth/requires-recent-login` — so the harness genuinely detects recency enforcement
  and the unlink success is not an artefact. **Consequence, and it is why the freeze is shaped as it
  is:** Firebase will not protect a Firebase-native user from lockout, so **the last-authentication-method
  rule must be enforced server-side** and must never be delegated upward.
- **`auth_time` re-stamping observed.** `reauthenticateWithCredential()` produced a token whose
  `auth_time` **advanced** (+9 s across a deliberate idle, reproduced twice), while a plain forced
  `getIdToken(true)` moved only `iat` and left `auth_time` unchanged. This is what makes Option D
  enforceable from a signed claim rather than from client honesty.
- **Provider unlink does not revoke refresh tokens** in the observed behaviour; a password write did.
  Unlinking a provider makes a **later** sign-in with that provider create a **new** Firebase account.
- **The 409, not 403, is an engineering decision taken under the brief's express allowance** ("preserve
  the project's established convention … but keep the error code exactly"). `mobile/lib/client.ts`
  treats a **401 or 403** response to a token-bearing request as **session loss** and clears the
  session, so a 403 on `FIREBASE_REAUTHENTICATION_REQUIRED` would sign a user out merely for being asked
  to reauthenticate. The frozen **code** is unchanged; only the status is.
- **Still unverified:** whether a **federated** re-sign-in after unlink mints a new uid in this project
  (needs a live Google credential), and whether Google/Facebook reauth re-stamps `auth_time` as
  email/password did. Neither is claimed as fact, and neither contradicts the frozen design.
- **Authority:** none for the political sense — a measurement and a recorded implementation choice.

### FB-D-121 — CORRECTION OF FB-008: its "10/10 mutations detected" claim is overstated, and two protections are not reliably proven · `EXPERIMENT` + `SOURCE-CODE OBSERVATION`
- **Date:** 2026-09-23 (FB-009, Phase 32L-A verification gate).
- **Correction:** FB-008 reports *"**10/10 mutations detected**"*, with M3 (conditional unlink write made
  unconditional) and M7 (conditional reset completion made blind) both marked DETECTED. Independent
  re-running, each mutation alone on a pristine copy and behind a startup anchor guard, **does not reproduce
  it**: **M7 survives 2 of 2 runs**, and **M3 is detected in one run and not in another** because the
  assertion that catches it is **timing-dependent**. Corrected figure: **8 of 10 reliably detected, one
  flaky, one surviving.** Read the FB-008 statement as **superseded**. The FB-008 block is not rewritten
  (trail rule 1).
- **Both are TEST weaknesses, not code defects, and both clauses are load-bearing:**
  - **M7** — the `firebaseUid: null` half of the R-4 completion filter is **not** load-bearing for the
    unlink race itself (the unlink stamps `passwordChangedAt`, so the `$or` range branch already refuses —
    which is exactly why the R-4 test stays green with the clause removed). It **is** load-bearing for one
    narrow interleaving: an account **linked to Firebase after the reset's own read but before its
    completion write**. R-2's guard cannot see a link landing after it has read. Without the clause such a
    token could write a local password onto a Firebase-linked account, re-establishing the very credential
    Phase 32K says must not be usable while `firebaseUid` is set.
  - **M3** — the `firebaseUid: identity.uid` half of the unlink filter stops a **stale** unlink from
    detaching an identity attached after its own read. The CASE-D guard makes it redundant in the
    sequential path; only a race distinguishes them.
- **Remedy, NOT APPLIED (FB-009 was verification-only):** one DB-backed interleaving test per path, using a
  hooked model call that runs between the service's read and its write — `PasswordResetToken.deleteMany`
  for the unlink path and `bcrypt.hash` for the reset path. That makes M3 deterministic and M7 detectable.
  De-flake the concurrent-unlink assertion by asserting the observable outcome (exactly one 200 and one
  409).
- **Also recorded:** one `npm run test:unit` run reported **323 pass / 1 fail** and has **not recurred in 13
  runs**; the failing case was **not identified** and is **not attributable to a 32L-A file**. Two
  timing-suspicious unit files were checked in isolation with no reproduction. `[EXPERIMENT REQUIRED]`.
- **What is NOT in question:** the implementation itself. FB-009's source review confirmed every frozen
  decision, and 56 runtime checks against the real app, real MongoDB and the real Firebase verifier passed —
  including a 315-second-old token that still **verified** yet was refused for freshness with no mutation
  and no session revocation, followed by success after a fresh sign-in.
- **Authority:** none. A correction of a prior Freebuff claim, recorded so the overstated figure is not
  relied on.

### FB-D-122 — FOLLOW-UP TO FB-D-121: both remaining test gaps are CLOSED; mutation result is now 11/11 · `EXPERIMENT`
- **Date:** 2026-09-23 (owner-authorized mutation-hardening follow-up to FB-009). **Test files only.**
- **What changed:** three test changes, **no production file touched** — proven by `sha256` on all ten
  32L-A source files (identical before and after).
  1. A new DB-backed **stale-identity** test for the unlink path, interposing on **`bcrypt.hash`** (which
     runs *between* the ownership check and the authoritative write) to change the account's `firebaseUid`
     mid-request, then requiring 409 `FIREBASE_IDENTITY_CONFLICT` with the arriving identity **not**
     detached and no credential written.
  2. A new DB-backed **R-4 LINK** test for the reset path, using the same seam, where the account acquires
     Firebase authority after the read that fed the Phase 32K guard and **without** moving
     `passwordChangedAt` — which is exactly why the `$or` cannot substitute for the uid clause.
  3. The **concurrent-unlink** test replaced a scheduling-dependent assertion with a **barrier**: both
     requests are held until the second arrives, so both read the same pre-unlink account before either
     writes. It now requires the exact statuses `[200, 409]` and keeps and **extends** the state, session,
     audit-count and login assertions.
- **Result:** **M3 DETECTED (was flaky)** and **M7 DETECTED (was surviving)**; the full set is now **11 of
  11**, with an added mutation **M11** (`passwordChangedAt: null` arm removed) also detected. **M11 needed
  no new test** — two **pre-existing** reset cases already prove that arm is required, verified by mutation
  rather than asserted from reading.
- **Determinism, measured in the direction that matters:** with each clause removed, the targeted tests
  fail **5 of 5** runs (M3 → `[2,2,2,2,2]`, M7 → `[1,1,1,1,1]`); with the code pristine, the three race
  tests pass **10 of 10** runs (30/30 executions). No sleeps are used anywhere — only a barrier and
  one-shot interpositions, with a 15-second timeout present as a **safety valve that fails the test**.
- **One design correction worth keeping:** the first draft hooked `PasswordResetToken.deleteMany` and
  thereby made **M6** (R-3 removed) redden the new test **incidentally**, because the hook never ran. A
  hook a mutation can stop from being called yields a failure for a reason unrelated to the assertion — a
  **false signal**. Moving the seam to `bcrypt.hash`, which every path reaching the write crosses, removed
  the coupling: **M6 is now caught only by the R-3 test**.
- **Verification:** `npm test` **840 / 109 suites / 0 fail**; `test:unit` 348 / 324 pass / 0 fail;
  `test:db` **542 / 516 pass** / 0 fail; `typecheck` and `lint` clean; all five protected files
  byte-identical. **No commit, no push.**
- **Consequence for the gate:** because no production behaviour changed, the runtime evidence from FB-009
  (**56/56 checks against the real app, real MongoDB and the real Firebase verifier**) **remains valid**
  and was deliberately not re-run.
- **Authority:** none. A verification correction, recorded so the FB-D-121 gaps are not treated as still
  open.

---

## Part 3 — Freebuff inferences that are explicitly NOT decisions

| Entry | Inference | Confidence | Approval | Action |
| --- | --- | --- | --- | --- |
| FB-I-01 | "Phase 32I" has no defined scope anywhere in the repository; mapping it to Google Sign-In would be an inference, not a fact | high | none | none — Freebuff will not infer the next phase |
| FB-I-02 | The two untracked protected plan documents are phase-18 planning artifacts whose status text is historical rather than a current work queue | medium | none | none |
| FB-I-03 | The three tracked protected diffs belong to an in-flight AI-provider/test workflow, judging by their paths; their intent is `AUTHORSHIP UNKNOWN` because Freebuff did not read their content | low-medium | none | none — content not read, files not touched |
| FB-I-04 | The proposed unlink path is a **low** account-existence-oracle risk, because the caller is authenticated and operating on their own account — so a mismatch refusal reveals nothing they did not already hold | medium | none | none — reasoned from source, **not measured**; a future phase must measure or accept it |
| FB-I-05 | After a server-side unlink the Firebase identity is left orphaned in Firebase (the §16.6/O-6 class), so **re-registering with that same Google account stays `409 EMAIL_IN_USE`** and the only route back is explicit link from a password-authenticated session | medium-high | none | none — an interaction to verify during implementation |

**Closing statement.** No `FREEBUFF INFERENCE` or `FREEBUFF RECOMMENDATION` in this file has been, or
may be, converted into an Inventory AI project decision or policy by Freebuff. That requires an
explicit `OWNER DECISION`, recorded as a new entry.
