# FB-010 — Mobile Firebase unlink + reauthentication (Phase 32L-B)

> Audit record. **Not** architecture, **not** project history, **not** a specification.
> Binding prior records: `FB-007-phase-32l-decision-freeze.md` (D-1…D-9, the freeze),
> `FB-007-unlink-last-method-design.md` (the design), `FB-008-phase-32l-a-unlink-backend.md`
> (the server contract this client consumes), `FB-009-phase-32l-a-verification.md` (the gate).
> This file records **what Freebuff implemented and verified**, not what the system should be.
> Provenance labels: `[SOURCE]` · `[EXPERIMENT]` · `[INFERENCE]` · `[EXTERNAL VERIFICATION REQUIRED]`.

---

## Task Metadata

| Field | Value |
| --- | --- |
| Task ID | `FB-010` |
| Phase | **Phase 32L-B** — mobile Firebase unlink + reauthentication (MOBILE ONLY) |
| Authority | Owner task brief: an initial GO, then a **REMEDIATION brief** that ratified one deviation and changed the retry contract |
| Binding prior record | `FB-007-phase-32l-decision-freeze.md` + the owner's Q1–Q9 GO message |
| Mode | `IMPLEMENTATION + STATIC VERIFICATION` |
| Started from HEAD | `9917447ec3b0f70846a60547d3e5a9ff10625ed6` — `docs: sync Phase 32L-A post-commit records` |
| Branch | `experiment/freebuff-evaluation` |
| Commit | **none created** — the brief says commit is not authorized; the Q9 commit-boundary problem is a separate owner decision |
| Push | **none** |
| Verdict | **PASS (implementation + remediation)** — 66 mobile tests, **14/14 mutations detected**, `tsc` and `eslint` clean, **no server file changed** |

## Requested Objective

Give the mobile app a way to **detach its Firebase identity and establish a new local
password**, consuming the already-committed `POST /api/auth/firebase/unlink` unchanged. The
server is the authority on identity ownership, freshness and atomicity; the client owns a
confirmation UX, one server call, and the teardown order.

The frozen design this implements, verbatim:

- **Q1 REAUTH-FIRST** — confirm the Firebase sign-in, then collect the new password, then call
  the server. The confirmation is the *normal* first step, not an error path.
- **Q2/Q3** — provider unlink is **client-side only**; `unlinkProvider()` and the Admin SDK's
  `providersToUnlink` are **not** in the critical path.
- **Q4** — a dedicated authenticated screen, not a modal.
- **Q5** — `newPassword` + `confirmPassword`; the confirmation field never reaches the network.
- **Q6 OPTION A** — the person *chooses* "Confirm with Google" or "Confirm with password". No
  provider discovery, no email input, no provider persistence.
- **Q7** — uniform post-unlink copy.
- **Q8** — the entry point and the screen are gated on `authMethods.firebase === true`.
- **Q9** — the eventual commit must contain Phase 32L-B work only.

## Scope

**In:** `lib/firebase-auth.ts` (the confirmation primitive), `lib/auth.tsx` (session type +
orchestration), `lib/api.ts` (the wrapper), one new authenticated screen, its registration in
`(app)/_layout.tsx`, the Profile entry point, three mobile test suites, this record and its
ledger entries.

**Out:** every server file; any schema, model, index or migration; any dependency; `expo-updates`;
Firebase persistence; provider unlinking; reconnection/relink UX; Facebook/Apple; invitations;
`README.md` / `docs/DEVELOPMENT_ROADMAP.md` / `docs/SYSTEM_SPECIFICATION.md` close-out (reported
as follow-up, not silently absorbed).

## Initial Repository State

| Check | Value |
| --- | --- |
| Branch | `experiment/freebuff-evaluation` |
| HEAD | `9917447ec3b0f70846a60547d3e5a9ff10625ed6` — unchanged at close |
| Staged | **0** throughout |
| Working tree | **26 → 33 entries.** Seven added by this phase: 4 new source files, 3 new test files. The other 26 are the pre-existing Phase 32I/32J/32K work and the protected entries |
| Protected five | byte-identical to the FB-002 baseline before and after: `10c5ff2e…d7bd530` · `23e91610…da1a213` · `83767f8b…22d0768` · `52d3afef…10625891` · `d000a5d3…e63c297` |

## Existing Architecture Understood `[SOURCE]`

- **The session is one JWT in SecureStore, and the user object is never cached** — `/api/auth/me`
  is re-fetched on boot, so role/status/`authMethods` are always the server's answer.
- **Firebase persistence is `inMemoryPersistence` (Phase 32D)**, so after a cold start
  `auth.currentUser === null` while the Inventory AI session is still valid. This is the state
  the whole confirmation design exists to survive.
- **`authMethods` on the mobile type was `{ password: boolean }` only**, while the server sends
  `{ password, firebase }` — so the UI could not read the gate it was required to gate on.
- **`currentFirebaseIdToken()` returns `user.getIdToken()`**, the cached token for the current
  user, transparently refreshed near expiry. After a fresh `signInWith*` the current user's token
  **is** the one that authentication minted, which is what makes the retry pick up a fresh
  `auth_time` rather than a stale one.
- **`confirmFirebaseSignIn` already existed** as the Q6 primitive; what this phase changed is the
  note that its email argument is the ratified deviation below.

## Actions

1. Re-read the 32L-A backend contract from source — route, controller, service, validator, error
   codes, statuses — rather than from the FB-008 report.
2. Widened `AuthUser.authMethods` to `{ password: boolean; firebase?: boolean }`.
3. Added `confirmFirebaseSignIn` to the session surface as a thin pass-through, and
   `disconnectFirebase` as the orchestration.
4. Added the `firebaseUnlink` API wrapper and the dedicated screen, registered it, and added the
   gated Profile entry point.
5. Wrote three test suites (66 tests) and a 14-mutation harness.
6. **Remediation** (owner brief): ratified the email deviation, and changed the retry so the typed
   new password is **discarded before the second confirmation** rather than held across it.

## Changes

| File | Δ | Responsibility |
| --- | --- | --- |
| `mobile/lib/firebase-auth.ts` | +472 / −4 | `confirmFirebaseSignIn` + the Google PKCE mechanics extracted into a shared `acquireGoogleIdToken` (reused, not copied) |
| `mobile/lib/auth.tsx` | +492 / −11 | `authMethods.firebase` on the public type, the confirmation pass-through, and `disconnectFirebase` |
| `mobile/lib/api.ts` | +46 | `firebaseUnlink` |
| `mobile/app/(app)/disconnect-firebase.tsx` | **new** | the three-step screen |
| `mobile/app/(app)/_layout.tsx` | +1 | `<Stack.Screen name="disconnect-firebase">` |
| `mobile/app/(app)/profile.tsx` | +25 | the Security entry point, gated |
| `mobile/__tests__/phase32l-b-confirm-signin.test.ts` | **new** | 18 |
| `mobile/__tests__/phase32l-b-disconnect-session.test.tsx` | **new** | 22 |
| `mobile/__tests__/phase32l-b-disconnect-screen.test.tsx` | **new** | 26 |

The responsibility boundary is the design: **screen** (phases, copy, password fields) →
**`auth.tsx`** (ordering, retry cap, teardown) → **`firebase-auth.ts`** (the only SDK importer) →
**`api.ts`** (HTTP) → **server** (authority).

## ★ Ratified deviation — the email parameter

**The frozen Q6.2 contract was `confirmFirebaseSignIn({ method, password })` with "no email
parameter". The implementation requires `email` for the password method, and the owner has now
RATIFIED this as the final Phase 32L-B contract.**

It was not optional. `signInWithEmailAndPassword(auth, email, password)` takes an address, and the
only other source — `auth.currentUser.email` — **is `null` in exactly the cold-start state Q6.1
was frozen to survive**. Honouring the letter of "no email parameter" would have made the password
method unusable after a restart, defeating the decision it sits under.

The intent was preserved and is enforced structurally:

| Constraint | How it holds |
| --- | --- |
| The email comes from the authenticated session | `user.email`, read in the screen from `useSession()`; never a parameter that could be steered |
| No editable email field | asserted as an **absence** in two places, including after the flow has been walked; mutation **M9** turns the read-only text into an `Input` and the suite goes red |
| Never an account-lookup/join key | `[SOURCE]` it is passed to Firebase as a credential input and to nothing else; no comparison, no lookup, no `firebaseUid` resolution exists in the client |
| Ownership decided server-side only | the server compares the verified token's `uid` with the account's stored `firebaseUid` and refuses a mismatch with 409 |

## ★ Remediation — the retry no longer holds the password

**The problem the first implementation had.** On `409 FIREBASE_REAUTHENTICATION_REQUIRED` the
orchestration performed a fresh confirmation and then retried **with the password it was already
holding**. That contradicts the reason Q1 chose REAUTH-FIRST: a confirmation can hand control to a
browser or an account chooser that backgrounds or kills the process, and a typed credential must
not be in memory while it does.

**The remediated contract.**

```
attempt 1:  confirm  → fresh auth_time → collect newPassword + confirmPassword → POST unlink
   ↓ 409 FIREBASE_REAUTHENTICATION_REQUIRED
   → the password is DISCARDED (both fields cleared) BEFORE anything else happens
   → confirm again, with no password in scope
   → back to step 2, fields empty → the person types a new password
attempt 2:  POST unlink  (retry: true)
   ↓ 409 again → TERMINAL: the refusal is surfaced, no third attempt
```

Two structural properties, and they are what the mutations pin:

1. **One attempt per call.** `disconnectFirebase` returns
   `{ kind: 'reauth-required' }` instead of retrying in place, so the frame that holds the
   password has returned before the second confirmation runs. `[SOURCE]`
2. **The cap lives in the session layer, not in the screen's good behaviour.** A call marked
   `retry` throws on a freshness refusal instead of answering `reauth-required`, so no caller can
   ask a third time. The screen additionally stops offering the remedy once its own `retried` flag
   is set. Mutation **M4** removes the session-layer cap; mutation **M13** re-arms it from the
   screen; both redden.

**The new password is a separate credential and never reaches the confirmation.** The Firebase
confirmation receives the person's *sign-in* password; the new Inventory AI password is submitted
only in the unlink body, in a field of its own.

## Database / schema changes

**None.** No field, index, model or migration. Provider-specific MongoDB fields remain
unintroduced, exactly as D-4 and the Q6 freeze require.

## Tests added

| Suite | Cases |
| --- | --- |
| `phase32l-b-confirm-signin.test.ts` | 18 — the primitive and the API wrapper |
| `phase32l-b-disconnect-session.test.tsx` | 22 — the orchestration |
| `phase32l-b-disconnect-screen.test.tsx` | 26 — the screen and the Profile gate |
| **Total new** | **66** |

Every case in the audit's §13 matrix is covered, plus the remediation's A–J list: the retry
re-confirms, the password is **not** carried across it, the fields are empty on arrival at step 2,
the retry sends the newly typed password, the confirmation precedes the retry (asserted through
`invocationCallOrder`), and a second freshness refusal stops the flow.

## Tests executed

| Command | Result |
| --- | --- |
| `npx jest` (mobile, full) | **24 suites / 279 tests / 0 fail / 0 skipped** |
| `phase32l-b-confirm-signin` | 18 / 18 |
| `phase32l-b-disconnect-session` | 22 / 22 |
| `phase32l-b-disconnect-screen` | 26 / 26 |
| `npx tsc --noEmit` | **clean** |
| `npx eslint .` | **clean** (0 problems) |
| Server suites | **not run** — no server file changed, and the harness proves it |

## Mutation tests

Fourteen mutations, each applied to a pristine copy, required to redden its suite, then restored
and verified byte-for-byte. **14/14 detected.**

| # | Mutation | Suite |
| --- | --- | --- |
| M1 | `wrong-method` collapses into an ordinary failure | confirm |
| **M2** | **the session layer retries internally, holding the password across a confirmation** | session |
| M3 | the already-revoked session is chased with an `api.logout` | session |
| **M4** | **the retry cap is removed** — a retry is answered with `reauth-required` again | session |
| M5 | the cold-start confirmation fallback is removed | session |
| M6 | a wrong-option refusal dead-ends on the new-password step | screen |
| M7 | the wrong-method reply does not return to the choice | screen |
| M8 | the server's own conflict sentence is relayed instead of the actionable one | screen |
| M9 | the account email becomes an **editable input** | screen |
| M10 | the Profile entry point shows for a user object with no capability | screen |
| M11 | the unlink endpoint path changes | confirm |
| **M12** | **the screen RETAINS the typed password across the second confirmation** | screen |
| **M13** | **the retry re-arms the cap (`retry: false`), so a refusal can loop** | screen |
| M14 | the sign-in password is submitted as the **new** password | screen |

**M2 and M12 are the brief's required mutation** — "fails if the implementation retained/reused the
old password across the second confirmation" — and they attack it from both directions: the
session layer retrying with a held credential (M2) and the screen keeping the fields populated
across the confirmation (M12). **M4 and M13 pin the cap** from the two layers that enforce it.

## Security findings

| Question | Answer |
| --- | --- |
| Can a Firebase-linked account authenticate through the old password path? | **No** — Phase 32K's boundary and `FIREBASE_SIGN_IN_REQUIRED` are untouched by this phase |
| Can any local state reach a zero-authentication-method state? | **No** — the server validates and hashes the new password before its one conditional write; the client cannot create the state and does not try |
| Can the retained legacy hash come back? | **No** — replaced in the server's transition; no client path writes a credential |
| Is provider data exposed or persisted? | **No** — no provider field, no discovery, no `providerData`, nothing new written to SecureStore (still exactly two keys) |
| Do provider tokens reach MongoDB? | **No** — the ID token is consumed once by the request |
| Was Firebase persistence changed? | **No** — `inMemoryPersistence` is intact and the cold-start state is worked *with* |
| Can a client value steer the identity? | **No** — no `userId`/`firebaseUid`/`businessId` field exists in any request this client builds; the email has no input |
| Could a 409 sign the person out? | **No** — the refusals never reach the client's session-loss handler; asserted for all three 409s |
| Are credentials in route params or logs? | **No** — the flow uses no navigation parameters at all, and the app contains no `console.*` |
| Can the retry loop? | **No** — `[SOURCE]` one attempt per call, and a `retry` call's freshness refusal is terminal |

## Error contract consumed (mobile-facing) `[SOURCE]`

| Server answer | Client treatment |
| --- | --- |
| `200` | teardown: Firebase sign-out **after** the response, local session cleared, app returns to login |
| `409 FIREBASE_REAUTHENTICATION_REQUIRED` | attempt 1 → discard the password, return to the choice step with an instruction, re-confirm, retry **once**; attempt 2 → **terminal**, the refusal is surfaced |
| `409 FIREBASE_IDENTITY_NOT_LINKED` | terminal; the server's own sentence is shown |
| `409 FIREBASE_IDENTITY_CONFLICT` | terminal **and** treated as "try the other confirmation option"; the server's "contact an administrator" copy is deliberately **not** relayed (it is written for a linking collision and would send someone to an administrator over a mistyped choice), and mutation **M8** pins that |
| `400 FIREBASE_TOKEN_INVALID` | recoverable through step 1; session preserved |
| `400 VALIDATION_ERROR` | `fields` rendered against the inputs that own them |
| `403 BUSINESS_NOT_ACTIVE` | session preserved; the server's sentence is shown |
| `401` / `403 ACCOUNT_DISABLED` | the screen defers to the central sign-out, as every other screen does |

## Known limitations

1. **NOT RUNTIME-VERIFIED.** No EAS build, no prebuild, no emulator, no device and **no live
   Firebase or Google credential** was exercised. This phase is Jest + `tsc` + `eslint` only.
   Phase 32G's record already states that a provider redirect has never been exercised in a
   development build, so the **Google confirmation path's runtime behaviour remains unproven**.
   `[EXTERNAL VERIFICATION REQUIRED]`
2. **The email deviation** is ratified above; it needs no further change, but it must not be
   "simplified" back by a later phase.
3. **An account whose Firebase password identity uses a different address than `user.email`**
   cannot confirm by password (Phase 32H links by uid and never compares emails). The Google
   option and the server's refusal keep it a UX dead end rather than a security weakening.
   `[EXTERNAL VERIFICATION REQUIRED]`
4. **The `retried` flag is sticky:** after the retry is spent, further freshness refusals are
   surfaced rather than auto-remedied. Deliberate — re-arming an automatic retry would make
   "retry once" a comment rather than a rule — and the person can still start over by confirming
   again.
5. **The confirmation's Google path runs the full PKCE flow**; a second confirmation therefore
   opens the browser again. Reauth-first makes a second confirmation rare, not impossible.

## Deferred work

Not started, not authorized: the **Q9 commit-boundary decision** (below); the project-documentation
close-out for Phase 32L (specification, roadmap, README); provider unlink/cleanup (Q2/Q3);
reconnection/relink UX; the O-2 linked-account `change-password`/reset disposition; O-1 unlink
policy questions beyond the freeze; O-6 orphaned identities; Facebook/Apple; iOS runtime.

## Git checkpoint

**No commit, no stage, no push.** HEAD `9917447…` unchanged; staged **0**; no
`reset`/`restore`/`clean`/`stash` was used at any point. All mutation scripts lived outside the
repository and were deleted.

### ★ The Q9 commit-boundary problem — measured, and NOT solved here

`Q9` requires that the Phase 32L-B commit contain Phase 32L-B work only. Two of this phase's
touched files carry **pre-existing uncommitted 32I/32J hunks**:

| File | Verdict |
| --- | --- |
| `lib/api.ts`, `app/(app)/_layout.tsx`, `app/(app)/profile.tsx` | **clean before this phase** — the 32L-B change is the only change; normally stageable |
| the 4 new files | new; normally stageable |
| `lib/auth.tsx` | **entangled** — 16 hunks mixing 32J onboarding with 32L-B (+492/−11) |
| `lib/firebase-auth.ts` | **entangled** — 9 hunks mixing the 32I Google block with this phase's extraction (+472/−4) |

A plain `git add` of those two files **would absorb 32I/32J work**, exactly as the audit warned.
Worse, for `firebase-auth.ts` a clean split may be **impossible**: this phase *modifies uncommitted
32I code* (it extracts `acquireGoogleIdToken` out of `signInWithGoogle`), so no patch relative to
HEAD can contain the 32L-B change without the 32I block it edits. **The split was not attempted**
and is left to the owner, with the two honest options: commit the entangled files together and
acknowledge that 32I/32J ride along, or commit 32I/32J first and then 32L-B on top.

## Protected files

All five **byte-identical** to the FB-002 baseline, verified before and after:
`10c5ff2e…d7bd530` (`mobile/eas.json`) · `23e91610…da1a213`
(`server/src/services/ai/providers/http.ts`) · `83767f8b…22d0768`
(`server/test/phase06-ai-wire.test.mjs`) · `52d3afef…10625891` · `d000a5d3…e63c297`. The two server
entries are the **only** modified server files in the tree, and both were modified before this
phase.

## Final Outcome

**PASS.** The frozen Q1–Q9 design is implemented; the one deviation is ratified and structurally
constrained; the retry contract no longer holds a password across a confirmation, with the cap
enforced in the session layer and pinned by mutation; 66 tests and 14/14 mutations; `tsc` and
`eslint` clean; **no server, schema, dependency or protected file changed**.

## Handoff notes

1. **Do not repeat the "held password" shape.** A future phase tempted to fold the retry back into
   `disconnectFirebase` to simplify the screen would reintroduce the credential-in-memory window
   the remediation removed; **M2 is the mutation that guards it**.
2. **Q6's email parameter is ratified.** Reverting to "no email parameter" breaks the cold-start
   password method, which is the state the decision exists to survive.
3. **The commit boundary is the owner's call** (above). Until it is decided, nothing is committed.
4. **Runtime verification of the Google path is still owed** and needs a development build — the
   same prerequisite Phase 32G recorded.
5. Project-documentation close-out for Phase 32L-B (specification, roadmap, README) is
   **outstanding and was not authorized here**.
