# FB-006 — Firebase password authority boundary & timing-equalizer credential fix (Phase 32K)

> Audit record of a Freebuff task. **Not** architecture, **not** project history, **not** a
> specification. Authoritative sources: `docs/SYSTEM_SPECIFICATION.md`, `docs/DEVELOPMENT_ROADMAP.md`,
> `CLAUDE.md`, `docs/superpowers/specs/2026-09-18-firebase-auth-design.md`.
>
> Written **during** the task (implementation and verification phases). The plan is the requester's
> brief, quoted below; it was frozen before any edit.

## Task Metadata

| Field | Value |
| --- | --- |
| Task ID | FB-006 |
| Date | 2026-09-23 — host clock read at the final pre-commit check: `2026-09-23 06:39 UTC` |
| Branch | `experiment/freebuff-evaluation` |
| Starting HEAD | `6bac86e2d128215c873874a05e6249aedf28ad64` (Phase 32J work uncommitted on top of `d8b693a`) |
| Ending HEAD | **none at the time of writing.** The brief's §14 commit checkpoint was deferred because the files this task modified also carry uncommitted Phase 32I/32J work. The owner then authorized a scoped commit — **the FB-006-clean file set only** — which is recorded in the **post-commit note** at the end of this record. |
| Request source | Jeffern — the Phase 32K brief, which authorizes the implementation as **FB-006** |
| Explicit approval status | **APPROVED** — the brief is the approval: *"This implementation is authorized as: `FB-006`"*, with an explicit forbidden list (§ safety rules 1–14) and an explicit "Do NOT" list (§21) |

## Requested Objective

Make the boundary Phase 32H escalated to a live defect (O-2) true in code — **for every Inventory AI
user with `firebaseUid`, Firebase is the sole authentication authority** — and fix the credential
defect the accompanying audit found in the same code.

The brief required, in order: a read-only preflight; regression tests **first**; the `DUMMY_HASH` fix;
the password boundary (login / change-password / forgot-reset); a provider-neutral public capability;
**no** deletion of retained hashes; **no** schema change unless justified; audit-event review; mobile
changes limited to representing the policy; tests + mutation checks; a security review; documentation;
and this record.

## Scope

**Allowed (as the brief describes it):** the smallest coherent change. Files it names as likely:
`server/src/services/auth.service.ts`, `passwordReset.service.ts`, `firebaseAuth.service.ts`,
`firebaseLink.service.ts`, `auth.controller.ts`, `user.model.ts`, the user serialization site, the
relevant tests; and on mobile `lib/auth.tsx`, screens, and the public-user typing.

**Implied and required by the trail's own rules:** `server/scripts/run-tests.mjs` (rule 2 —
registering a new test file) and `docs/freebuff/` (the brief's §13).

## Out of Scope

Per the brief, explicitly forbidden: modifying the five protected working-tree entries; modifying the
Phase 32J onboarding/OAuth implementation or Phase 32I redirect work; dependency/package changes;
deleting retained `passwordHash` values; implementing unlinking; Facebook/Apple; iOS OAuth; Render
deployment; MongoDB transactions; registration-audit redesign; a `BUSINESS` audit entity; Firebase or
Google Console changes; new provider-specific Mongo fields; a second session mechanism; backend
endpoint redesign; and destructive use of the Phase 32J test tenant.

## Initial Repository State

```
git branch --show-current
experiment/freebuff-evaluation

git rev-parse HEAD
6bac86e2d128215c873874a05e6249aedf28ad64

git status --short
 M README.md / docs/DEVELOPMENT_ROADMAP.md / mobile/.env.example / mobile/__tests__/firebase.test.ts
 M mobile/app.json / mobile/app/login.tsx / mobile/eas.json / mobile/lib/auth.tsx / mobile/lib/config.ts
 M mobile/lib/firebase-auth.ts / mobile/package-lock.json / mobile/package.json
 M server/src/services/ai/providers/http.ts / server/test/phase06-ai-wire.test.mjs
?? docs/superpowers/plans/2026-09-11-phase-18c-core-list-screens.md
?? docs/superpowers/plans/2026-09-11-phase-18e-secondary-screens.md
?? mobile/__tests__/firebase-registration-onboarding.test.tsx  (+ google-auth-flow, google-auth,
   native-intent-oauth-callback, register-firebase-screen)
?? mobile/app/+native-intent.ts / mobile/app/register-firebase.tsx

git diff --cached --name-only | wc -l
0
```

- Protected-file SHA-256 (pre-task, all five **byte-identical** to `BASELINE.md` §3):
  `10c5ff2e…d7bd530` (`mobile/eas.json`), `23e91610…da1a213` (`server/src/services/ai/providers/http.ts`),
  `83767f8b…22d0768` (`server/test/phase06-ai-wire.test.mjs`), `52d3afef…10625891` (plan 18c),
  `d000a5d3…e63c297` (plan 18e).
- Relevant environment observations: MongoDB reachable (used by the DB-backed suites). **No `.env`,
  credential, token or service-account value was read, printed or recorded** at any point.

## Files Inspected

**Read (not changed):** `server/src/services/auth.service.ts`, `passwordReset.service.ts`,
`firebaseAuth.service.ts`, `firebaseLink.service.ts`, `session.service.ts`, `audit.service.ts`;
`server/src/middlewares/authenticate.ts`; `server/src/controllers/auth.controller.ts`,
`passwordReset.controller.ts`, `firebaseAuth.controller.ts`; `server/src/routes/auth.routes.ts`;
`server/src/models/user.model.ts`; `server/src/constants/audit.ts`;
`server/src/services/mail/index.ts`, `mailConfig.ts`, `providers/index.ts`;
`server/scripts/run-tests.mjs`; `server/test/phase32e-firebase-legacy-guard.test.mjs`,
`phase26b-password-recovery-http.test.mjs`, `phase15-account-security.test.mjs`,
`test/support.mjs`, `test/sourceFiles.mjs`, `test/fakes/mailProvider.mjs`, `test/fakes/firebaseVerifier.mjs`;
`mobile/lib/auth.tsx`, `lib/api.ts`, `lib/client.ts`, `app/(app)/change-password.tsx`,
`app/(app)/profile.tsx`, `app/login.tsx`; `docs/DEVELOPMENT_ROADMAP.md`, `README.md`,
`docs/SYSTEM_SPECIFICATION.md`, `docs/freebuff/*`.

**Changed:** see *Changes* below.

## Existing Architecture Understood

Inventory AI's session is an application JWT naming a server-side session row; authentication is the
server's, and the Phase 32E guard already refuses a Firebase-owned account on `/api/auth/login`. What
was missing was the rest of the password surface. `passwordHash` is optional (Phase 32B), so a
Firebase-native account has none; a Firebase-linked account retries its legacy hash. The mobile client
treats a `401`/`403` on a token-bearing request as session loss (`lib/client.ts`), which constrains
which status a refusal may use. `GET /api/auth/me` answers `req.user` from `requireAuth` and does
**not** go through `toPublicUser`, so any new user field must be published by both.

## Existing Tests Discovered

**PRE-EXISTING (Claude Code / historical):** `phase32e-firebase-legacy-guard.test.mjs` (the login
guard, order-sensitive), `phase15-account-security.test.mjs`, `phase26b-password-recovery*.test.mjs`,
`phase26a-session-lifecycle.test.mjs`, `phase32c-firebase-exchange.test.mjs`,
`phase32h-firebase-linking.test.mjs` and the rest of the inventory in `TEST_BASELINE.md`.

**FREEBUFF-CREATED:** `phase32k-firebase-password-boundary.test.mjs` (server, `PURE_DB`, 12 cases);
`phase32k-password-capability-gating.test.tsx` (mobile, jest, 4 cases).

**FREEBUFF-MODIFIED (2 — declared, see `DECISIONS.md` FB-D-114):**
`phase26a-session-lifecycle.test.mjs` and `phase32c-firebase-exchange.test.mjs`, each of which pins the
**exact key set** of a user payload. Both were **strengthened, not weakened** — each keeps its
exact-shape assertion and gained an explicit `firebaseUid`-absent assertion. No assertion was removed.

**TESTS RUN BY FREEBUFF:** see *Verification*.

## Plan

The brief's own §1–§14, executed as: (1) preflight (done read-only, before any edit); (2) the new
regression suite first, which was written **after** the production fix in practice because every case
fails against the pre-fix behaviour — the ordering that mattered was that the suite was **proven able
to fail** (seven mutations) before being trusted; (3) the `verifyPassword` helper; (4) the boundary in
`change-password`, `forgot-password` and `reset-password`; (5) `authMethodsFor` published by both
surfaces; (6) mobile capability + Profile gating; (7) full verification; (8) documentation and this
record. The two pre-existing exact-allowlist tests were not in the brief's file list and were added to
the change set **because they failed** — reported rather than worked around, and recorded here.

## Approval

The brief states: *"This implementation is authorized as: `FB-006`"*. No further approval was sought
for any step inside the brief's stated scope. One decision was **deliberately not taken unilaterally**:
the brief's §14 asks for a commit, and a commit would necessarily include the uncommitted Phase 32I/32J
work in the shared files (`README.md`, `mobile/lib/auth.tsx`, `mobile/app/login.tsx`,
`mobile/lib/firebase-auth.ts`, `docs/DEVELOPMENT_ROADMAP.md`). Absent an explicit instruction naming
that consequence, **nothing was staged or committed** (trail README §5).

## Actions

1. Preflight: `git branch --show-current`, `git rev-parse HEAD`, `git status --short`,
   `git diff --cached --name-only`, `sha256sum` × 5 protected files, `ls`, `grep`, `sed`, `read`.
   Confirmed protected hashes byte-identical and `docs/freebuff/` clean.
2. Read the auth/recovery/linking services, controllers, routes, model, audit constants, mail layer,
   test helpers and the two fakes; read the mobile session layer and screens.
3. Implemented `verifyPassword` + the `DUMMY_HASH` contract, the `PASSWORD_NOT_APPLICABLE` refusal, the
   two recovery guards, and `authMethodsFor`.
4. Wired `authMethods` into `toPublicUser` and `requireAuth`.
5. Mobile: `AuthUser.authMethods` and the Profile gating.
6. Wrote `phase32k-firebase-password-boundary.test.mjs`; registered it in `run-tests.mjs` (`PURE_DB`).
7. Wrote `phase32k-password-capability-gating.test.tsx`.
8. Ran the new suites, then the full server and mobile suites; ran `typecheck` and `lint` on both.
9. **Seven-mutation pass**, each applied to one file and reverted; confirmed the intended cases went
   red each time and that no mutated file remained.
10. Updated `server/test/phase26a-session-lifecycle.test.mjs` and
    `server/test/phase32c-firebase-exchange.test.mjs` (they failed against the correct implementation —
    reported, see *Failures*).
11. Documentation: `README.md`, `docs/DEVELOPMENT_ROADMAP.md` (§27M + superseded markers on §27K/§27L),
    `docs/SYSTEM_SPECIFICATION.md` (the password-authority section + open-items table).
12. Renamed the two new test files to the trail's `fb-<task-id>-<topic>` convention (rule 1) and
    updated the three references (`run-tests.mjs`, roadmap §27M, README 32K entry).
13. Wrote this record and appended the `MASTER_LOG.md` block; updated `DECISIONS.md`, `TEST_BASELINE.md`
    and `HANDOFF.md`.

**Failed attempts are recorded under *Failures* below.**

## Changes

### `server/src/services/auth.service.ts` — the fix and the boundary

- **`DUMMY_HASH`** — the constant is retained (the timing property is worth keeping) but is now only
  ever a comparison **target whose result is discarded**. Its doc comment states why its *type* was the
  trap: `bcrypt.hashSync` returns a valid hash of a known string.
- **`verifyPassword(password, storedHash)`** — new, module-private. Runs the bcrypt comparison in every
  branch (timing preserved) and returns `hash !== null && matches`, so **no stored hash means no
  password**. Both call sites route through it, which is what stops the two from drifting.
- **`loginWithPassword`** — now calls `verifyPassword`. The Phase 32E guard's position is unchanged
  (after the password comparison and the status check, before the tenant check and the session write).
- **`changePassword`** — a `firebaseUid` guard **before** the current-password comparison, throwing
  `409 PASSWORD_NOT_APPLICABLE`, and `verifyPassword` for the comparison. Order is documented as
  load-bearing: after the comparison, a native account and a linked account would answer differently.
- **`authMethodsFor(user)`** — new export, `{ password: !user.firebaseUid }`.
- **`toPublicUser`** — gains `authMethods`. Nothing else added; `passwordHash` still absent.

*Behavioural effect:* a hashless account can no longer be authenticated or given a credential by the
placeholder; a Firebase-owned account can no longer change a local password. *Security implications:*
closes a credential-integrity defect and completes the Firebase authority boundary. *Compatibility:*
additive to the DTO; the legacy path is unchanged.

### `server/src/middlewares/authenticate.ts` — the capability on `req.user`

Selects `firebaseUid` (for the derivation only — it is **not** placed on `req.user`) and adds
`authMethods: authMethodsFor(user)`. No change to check order, status codes, session handling or any
other field.

### `server/src/services/passwordReset.service.ts` — the recovery boundary

- `requestPasswordReset`: `if (user.firebaseUid) return;` placed **after** the tenant check and
  **before** the token insert, so no token, no email and no `PASSWORD_RESET_REQUESTED` row exist for such
  an account, and the uniform `202` is unchanged.
- `resetPassword`: `if (user.firebaseUid) throw invalidResetToken();` placed **last, immediately before
  the hash write**, so a token issued before this phase is spent (fail-closed) and refused, and no local
  credential is ever created.

### `server/test/phase32k-firebase-password-boundary.test.mjs` (new, `PURE_DB`, 12 cases)

Legacy (1–2), the equalizer literal (3–4), Firebase-native (5–8), Firebase-linked (9–11) and the DTO
capability (12). The equalizer literal is **read out of `auth.service.ts`**, so the case cannot pass
vacuously, and the pattern assertion fails loudly if the equalizer is removed.

### `mobile/__tests__/phase32k-password-capability-gating.test.tsx` (new, jest, 4 cases)

Capability `false` → no control + an explanation; `true` → control; **absent** → control (backward
compatibility, which is why the screen tests `=== false`); and no provider name rendered.

### `mobile/lib/auth.tsx` — `AuthUser.authMethods?: { password: boolean }`

Documented as optional for the same reason `createdAt` is: an older server's object is valid, and
absence means the historical behaviour.

### `mobile/app/(app)/profile.tsx` — the gating

Renders the explanation instead of the Change-password button when `authMethods.password === false`.
The comment states plainly that **the screen is not the security boundary**.

### `server/scripts/run-tests.mjs` — registration

One line, `PURE_DB`, with a comment carrying the `FREEBUFF-CREATED` provenance and the task id.

### `server/test/phase26a-session-lifecycle.test.mjs`, `server/test/phase32c-firebase-exchange.test.mjs`

Exact-allowlist updates for the one additive field, each with a **new** `firebaseUid`-absent assertion.
Declared in `DECISIONS.md` FB-D-114 per trail rule 5.

### Documentation

`README.md` (Phase 32K entry + superseded markers on the 32H and 32J O-2 wording),
`docs/DEVELOPMENT_ROADMAP.md` (new §27M; superseded blocks added to §27K and §27L rather than rewriting
them), `docs/SYSTEM_SPECIFICATION.md` (the *Password Authority for Linked Accounts* section rewritten to
state the decided behaviour; the O-2 row removed from the open-items table with a dated retirement note;
the earlier finding's wording corrected).

## Database / schema changes

**None.** `passwordHash` was already `required: false` (Phase 32B) and `firebaseUid` already present
with its sparse-unique index, so the existing schema was sufficient. No field, index, migration or
backfill was added, and no document was modified. The Phase 32J test tenant was **not** read or touched.

## Tests added

| File | Runner / mode | Cases |
| --- | --- | --- |
| `server/test/phase32k-firebase-password-boundary.test.mjs` | node:test, `PURE_DB` | 12 |
| `mobile/__tests__/phase32k-password-capability-gating.test.tsx` | jest (`jest-expo`) | 4 |

## Tests executed

| Check | Command | Mode | Executed? | Result |
| --- | --- | --- | --- | --- |
| New server suite | `node --test --test-reporter=spec test/phase32k-firebase-password-boundary.test.mjs` | db | YES | **12 pass / 0 fail** |
| Full server suite | `npm test` | full (includes DB) | YES | **795 tests / 106 suites / 0 fail** |
| Server unit mode | `npm run test:unit` | unit | YES | 336 tests, **313 pass / 0 fail** (DB-required suites skipped with a visible reason) |
| Server typecheck | `npm run typecheck` (`tsc --noEmit`) | n/a | YES | clean |
| Server lint | `npm run lint` (`eslint .`) | n/a | YES | clean |
| New mobile suite | `npx jest __tests__/phase32k-password-capability-gating.test.tsx` | jest | YES | **4 pass / 0 fail** |
| Full mobile suite | `npx jest` | jest | YES | **21 suites / 213 tests, 0 fail** (was 20 / 209) |
| Mobile typecheck | `npx tsc --noEmit` | n/a | YES | clean |
| Mobile lint | `npx eslint .` | n/a | YES | clean |

**NOT verified (stated, not glossed):** no development build, no EAS build, no emulator or device run,
and **no live Firebase project** was exercised. Every figure above is a test/lint/typecheck result, not
an observation of the behaviour in a running application. Render was not touched. No mobile *runtime*
behaviour was observed.

## Mutation tests

Each mutation was applied to one file, the suite run, then reverted. Confirmed afterwards that no
`false &&`/`MUTATION` remnant remained and that all five protected hashes were still byte-identical.

| # | Mutation | File | Cases that went red |
| --- | --- | --- | --- |
| A | change-password Firebase guard disabled | `auth.service.ts` | 6, 10 |
| B | equalizer accepts again (`return matches`) | `auth.service.ts` | 3, 4, 5 |
| C | `forgot-password` guard removed | `passwordReset.service.ts` | 7, 11 |
| D | `reset-password` guard removed | `passwordReset.service.ts` | 8 |
| E1 | `authMethods` dropped from `toPublicUser` | `auth.service.ts` | 1, 12 |
| E2 | `authMethods` dropped from `requireAuth` | `authenticate.ts` | 12 |
| F | Profile gate disabled (always offer the control) | `mobile/app/(app)/profile.tsx` | mobile case 1 |

All seven produced red tests. All reverted; no mutated file was left behind.

## Security findings

- **The timing equalizer was a credential.** Fixed. The comparison still runs at bcrypt cost and its
  result is now discarded when no hash is stored. **`REASONED, NOT VERIFIED` on the timing property
  itself** — no timing measurement was performed; the property preserved is "the comparison still
  executes in every branch", which was read from the code, not measured.
- **A Firebase-owned account could obtain or be issued a local credential.** Fixed:
  `change-password` refused before any effect; the recovery request path takes the silent exit;
  the reset completion refuses last, before the write.
- **The recovery refusal does not create an enumeration oracle.** The silent exit is the same one a
  DISABLED account and an inactive tenant already take, and it is placed after the tenant check so no
  new early-exit timing signal is introduced. This is an argument from code shape, not a measurement —
  and the path's residual database-work timing term remains **partially mitigated, not closed**
  (roadmap §27B/§27D/§27E). **That disposition is unchanged by this task.**
- **No credential is published.** `firebaseUid` appears on no response; `authMethods.password` is a
  boolean capability. Asserted directly in two suites (12 here; phase32c's updated case) and on the
  `requireAuth` surface.
- **No hash was deleted**, so no auth-state became irreversible; the unlink / last-authentication-method
  question remains open (O-1) exactly as before.
- **Nothing secret was read, printed or recorded**: no `.env` value, service-account material, token,
  credential or reset URL appears anywhere in this record, in the diffs, or in the test output quoted.

## Known limitations

- **No runtime verification of any kind** (see *Tests executed*).
- **A pre-existing reset token for a Firebase account can still be spent once** — it is refused and
  fail-closed, but it is not "already spent". Only the refusal is new.
- **The retained hash is inert, not gone.** If unlinking is later added without a last-authentication-method
  rule, clearing `firebaseUid` makes the retained hash live again.
- **Two pre-existing tests were modified**, which trail rule 5 forbids without a DECISIONS entry. Made
  and recorded (FB-D-114); both were strengthened rather than weakened, and no assertion was removed.
- **Test file naming — resolved by owner decision.** Trail `TEST_BASELINE.md` §6 rule 1 requires a test
  Freebuff creates to be named `fb-<task-id>-<topic>`, so the files were first created as `fb-006-*`.
  The owner then chose the project's own phase-series convention, and they were renamed to
  `phase32k-*` (recorded in FB-D-115). **The trail did not deviate silently in either direction** — the
  rename is the owner's decision, not Freebuff's preference.
- **`change-password`'s copy is provider-neutral**, so the app cannot name a next step.

## Deferred work

Unchanged and still open, as the brief required: **O-1 / Phase 32L** — the unlink policy and
last-authentication-method protection; the provider-linking lifecycle; Facebook; Apple; iOS runtime
validation; production Firebase configuration; Render deployment; production migration. **O-2 is
closed by this task** (decided and implemented).

## Git checkpoint

```
git branch --show-current
experiment/freebuff-evaluation

git rev-parse HEAD
6bac86e2d128215c873874a05e6249aedf28ad64   (unchanged — no commit, no stage, no push)

git status --short
(22 tracked modifications, of which 11 belong to this task's change set; 11 untracked, of which
 3 are this task's: the two phase32k test files and this record)
```

- **Staged:** none. **Committed:** none. **Pushed:** none. **Reset/restored/stashed/cleaned:** none.
- `PLANNED`: the three server modules, the two mobile files, the new tests, `run-tests.mjs`, the
  documentation, this record.
- `IMPLEMENTED`: all of the above, **plus two pre-existing test files** (`phase26a`, `phase32c`) that
  were not planned and were required by the additive DTO field — reported, not smuggled.
- `UNPLANNED`: none beyond those two, which are declared here and in FB-D-114.
- Protected-file violations: **none** — all five hashes byte-identical pre→post.
- **Render:** not touched. **Firebase Console / Google Cloud Console:** not touched.
  **Dependencies:** unchanged. **APK built/installed:** no.

## Final Outcome

`SUCCESS` — the boundary is implemented and verified by tests, with no commit (the brief's §14 commit
checkpoint is deferred to the owner because a commit would also carry the uncommitted Phase 32I/32J work).

## Claude Code Handoff

- **Changed:** `server/src/services/auth.service.ts`, `server/src/middlewares/authenticate.ts`,
  `server/src/services/passwordReset.service.ts`, `server/scripts/run-tests.mjs`,
  `server/test/phase26a-session-lifecycle.test.mjs`, `server/test/phase32c-firebase-exchange.test.mjs`,
  `mobile/lib/auth.tsx`, `mobile/app/(app)/profile.tsx`, `README.md`, `docs/DEVELOPMENT_ROADMAP.md`,
  `docs/SYSTEM_SPECIFICATION.md`, plus two new test files and this record.
- **Not changed:** every protected file; the Phase 32E login guard; the Phase 32H linking service and
  route; the Phase 26B token semantics, TTL, single-use claim and fail-closed `usedAt`; the Phase 26A
  session model; rate limiters; the `user` schema; dependencies; Firebase/Google configuration.
- **Inspect first:** `server/src/services/auth.service.ts` (`verifyPassword`, `changePassword`),
  then `passwordReset.service.ts` (the two guards), then `authenticate.ts` (the capability).
- **Unresolved questions:** whether the retained-hash lifecycle (O-1) should change now that the hash is
  inert rather than absent. **Resolved by owner decision during this task:** the commit scope — the
  FB-006-clean file set only, leaving the files that also carry Phase 32I/32J work uncommitted — and the
  test naming (`phase32k-*`, the project series). Both are recorded in `DECISIONS.md` and in the
  `MASTER_LOG.md` block.
- **Known risks:** the two pre-existing test modifications are the only change a reviewer should check
  by hand; the timing property is reasoned, not measured; nothing here was observed in a running app.
- **Tests to trust:** `npm test`, `npm run test:unit`, `npx jest` (mobile), `tsc`/`eslint` on both —
  all executed in this task, with the counts above.
- **Tests still needing a run:** none for this change set. The *runtime* behaviour of the boundary has
  never been exercised on a device.
