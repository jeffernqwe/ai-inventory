# FB-008 — Firebase unlink backend foundation + last-authentication-method contract (Phase 32L-A)

> Audit record. **Not** architecture, **not** project history, **not** a specification.
> Authoritative sources: `docs/freebuff/tasks/FB-007-phase-32l-decision-freeze.md` (the binding freeze),
> `CLAUDE.md`, `docs/SYSTEM_SPECIFICATION.md`,
> `docs/superpowers/specs/2026-09-18-firebase-auth-design.md`.
> This file records **what Freebuff implemented and verified**, not what the system should be.

---

## Task Metadata

| Field | Value |
| --- | --- |
| Task ID | `FB-008` |
| Phase | **Phase 32L-A** — backend foundation + security contract (BACKEND ONLY) |
| Authority | Owner task brief, scoped to the FB-007 decision freeze |
| Binding prior record | `FB-007-phase-32l-decision-freeze.md` (D-1…D-9, I-1…I-8, R-1…R-5) |
| Mode | `IMPLEMENTATION + STATIC VERIFICATION` |
| Started from HEAD | `8af1d49f83b3f4d82c7e40d894c94ab61620ab80` — `feat: enforce firebase password authority boundary (Phase 32K)` |
| Branch | `experiment/freebuff-evaluation` |
| Commit | **none created** — the brief says to stop and report the proposed message unless the workflow requires a checkpoint |

## Requested Objective

Implement the **server-side** foundation for Firebase unlink, exactly per the FB-007 freeze, without
reopening any frozen decision and **without** implementing the mobile flow.

The frozen architecture used, verbatim:

- Recency = **Option D** — client reauthenticates when required; **server verifies signed `auth_time`**;
  `iat` is **not** a freshness signal; window **300 s**.
- Firebase provider unlink = **client-side cleanup only**; Admin SDK `providersToUnlink` is
  **verified-but-future**, not in this flow.
- Server owns the authoritative unlink. **Policy B**: a NEW password must be established; the retained
  hash is **never resurrected**.
- Dedicated codes: `FIREBASE_IDENTITY_NOT_LINKED` for "nothing is linked";
  `FIREBASE_IDENTITY_CONFLICT` preserved for genuine ownership conflicts.
- `authMethods = { password, firebase }`; no provider-specific fields.
- Business status inherited from `requireAuth → assertActiveBusiness`; no bypass.
- Sequence: reauth (if required) → **server unlink** → revoke sessions → Firebase sign-out → optional
  provider-unlink cleanup.
- R-3 and R-4 reset-token race contracts are **mandatory parts of this phase**.

## Scope

Server only: the `auth_time` verification seam, the unlink endpoint, the atomic transition, the
last-method invariant, session revocation, audit, `authMethods`, error contract, the R-3/R-4 race fix,
tests, mutation checks, and this record.

## Out of Scope

Mobile UI · mobile Firebase reauth/unlink · Firebase provider unlink implementation · Admin SDK
`providersToUnlink` · Facebook/Apple · unlinking *policy* beyond the freeze · schema changes · Render ·
dependency changes · Firebase Console · unrelated project documentation.

## Initial Repository State

| Check | Value |
| --- | --- |
| Branch | `experiment/freebuff-evaluation` |
| HEAD | `8af1d49f83b3f4d82c7e40d894c94ab61620ab80` |
| Staged | **0** |
| Working tree | 28 pre-existing entries (Phases 32I/32J/32K work plus the FB-006/FB-007 trail) |
| Protected files | all five **byte-identical** to the FB-002 baseline (`sha256sum`, verified before and after) |

## Files Inspected

`CLAUDE.md` · `docs/freebuff/tasks/FB-007-phase-32l-decision-freeze.md` ·
`FB-007-unlink-last-method-design.md` · `BASELINE.md` ·
`server/src/services/firebase/tokenVerifier.ts` · `firebaseLink.service.ts` · `firebaseAuth.service.ts` ·
`auth.service.ts` · `passwordReset.service.ts` · `firebase/firebaseErrors.ts` ·
`firebase/adminApp.ts` · `controllers/firebaseAuth.controller.ts` · `routes/auth.routes.ts` ·
`middlewares/authenticate.ts` · `models/user.model.ts` · `models/passwordResetToken.model.ts` ·
`constants/{audit,roles,firebase}.ts` · `utils/{validate,ApiError,errors}.ts` ·
`server/test/support.mjs` · `testEnv.mjs` · `fakes/firebaseVerifier.mjs` ·
`phase32h-firebase-linking.test.mjs` · `phase32k-firebase-password-boundary.test.mjs` ·
`phase26b-password-recovery.test.mjs` · `phase32b-firebase-admin.test.mjs` ·
`phase23-authorization-contract.test.mjs` · `scripts/run-tests.mjs`.

## Existing Architecture Understood

Two facts shaped the implementation and are worth stating because both were load-bearing:

1. **`firebaseUid` is a `sparse: true` unique index.** Setting it to explicit `null` would be
   *indexed* and would collide across users, breaking the index for every legacy account. Clearing it
   must therefore be an **`$unset`**, not `$set: null`.
2. **MongoDB range comparisons are same-type only.** A designed R-4 filter comparing `passwordChangedAt`
   against a `Date` matched **neither `null` nor a missing field**; this was proven with a direct driver
   probe before the final filter shape was chosen. The working filter uses an explicit `$or` with a
   `null` arm.

## Plan

1. Expose `auth_time` through the verify boundary + add the freshness constant and predicate.
2. Widen `authMethodsFor` to `{ password, firebase }` and publish it on both surfaces.
3. Add the validator, the audit codes and the unlink service.
4. Add the controller handler and the route.
5. Implement R-3 (invalidate outstanding tokens before the authoritative write).
6. Implement R-4 (conditional reset-completion write).
7. Update the route-classification guard and the test registry.
8. Write the suite; run typecheck/lint/full suite; run the mutation pass; record.

## Approval

The owner brief authorises Phase 32L-A and binds it to the FB-007 freeze. No frozen decision was
reopened. **One deviation from the brief's suggested status code is recorded below and was necessary
for client-contract correctness** (§Error contract).

## Actions

1. Read the freeze and every file the change would touch, before editing any of them.
2. Implemented and verified each of the eight items above.
3. Ran the new suite to green, then the **full server suite**, then `typecheck` and `lint`.
4. Ran a **ten-mutation pass**; the first pass left two mutations undetected, which was investigated
   and resolved by fixing **test weaknesses** rather than accepting the result (§Mutation tests).
5. Re-ran the full suite after those test changes.
6. Recorded this task record and the MASTER_LOG entry.

## Changes

### `server/src/services/firebase/tokenVerifier.ts` — expose the one claim the boundary needs

The verified identity was narrowed to `{ uid, email, emailVerified }`; `auth_time` was present in the
decoded payload and **discarded**. It is now surfaced as **`authTime: number | null`** — a single
additional verified claim, nothing more. The raw decoded payload and the raw JWT are still not exposed.

### `server/src/constants/firebase.ts` (new) — our policy values, in one readable place

Holds `FIREBASE_REAUTH_WINDOW_SECONDS = 300`, the two unlink codes, and `authTimeIsFresh()`. Kept out of
`services/firebase/` deliberately: that directory is Firebase's own vocabulary, while these are values
**we** choose. `authTimeIsFresh` **fails closed** on `null`/non-finite, and compares
`nowSeconds - authTime <= window` rather than against a caller-supplied clock, so a slightly-future
`auth_time` from Google/host clock skew is accepted rather than failing an honest user.

### `server/src/services/auth.service.ts` + `middlewares/authenticate.ts` — the capability

`authMethodsFor(user)` becomes `{ password: !user.firebaseUid, firebase: Boolean(user.firebaseUid) }`,
still computed in **one** place and published by both `toPublicUser` and `requireAuth`'s `req.user`, so
the two surfaces cannot drift. No provider-specific field (no Google/Facebook/Apple).

### `server/src/utils/validate.ts` — `validateFirebaseUnlink`

Returns `{ problems, idToken, newPassword }` and nothing else — no `firebaseUid`, no `userId`, no
`businessId`, following the Phase 32H `validateFirebaseLink` shape so the handler holds **no variable**
a client-supplied identity could steer. Password policy is the **shared** validator, not a second one.

### `server/src/services/firebaseUnlink.service.ts` (new) — the operation

Ordered exactly as the freeze requires, and the order is load-bearing:

1. authenticated context (`AUTH_REQUIRED` if absent);
2. **`FIREBASE_IDENTITY_NOT_LINKED`** — decided from the caller's **own** `firebaseUid` **before** the
   token is examined, so an account with no identity never has a presented identity looked up;
3. verify the ID token;
4. **the verified uid must equal the stored one**, else `FIREBASE_IDENTITY_CONFLICT` (409) — no
   transfer, no merge, and the uid never named in the audit row;
5. **`auth_time` freshness**, server-side, else `FIREBASE_REAUTHENTICATION_REQUIRED`;
6. validate + hash the NEW password;
7. **R-3** — invalidate the caller's outstanding unused reset tokens;
8. **one conditional write** on `{ _id, firebaseUid: verifiedUid }` that `$unset`s `firebaseUid`, sets
   `emailVerified: false`, replaces `passwordHash` with the NEW hash and stamps `passwordChangedAt`;
9. revoke all sessions;
10. audit `FIREBASE_IDENTITY_UNLINKED` with `passwordEstablished: true` and **no uid**.

The account can therefore never pass through a zero-method state: the new credential is validated and
hashed **before** the authoritative transition, and the transition removes one method while installing
another in the same write.

### `server/src/services/passwordReset.service.ts` — R-3 and R-4

- **R-3** lives in the unlink service (step 7) — invalidation strictly **before** the user write.
- **R-4** makes the reset-completion write **conditional** instead of a blind `save()`. The filter is
  `{ _id, firebaseUid: { $in: [null, undefined] }, $or: [ { passwordChangedAt: null },
  { passwordChangedAt: { $lte: issuedAt } } ] }`, where `issuedAt` is the **token's own issuance time**.
  Binding against the token's issuance time — rather than against a value re-read after the claim —
  closes the claim→read window as well, and needs no schema change. A non-matching filter writes
  **nothing** and fails safely, preserving the newer credential state.

### `server/src/controllers/firebaseAuth.controller.ts` + `routes/auth.routes.ts`

`POST /api/auth/firebase/unlink` — `requireAuth` + controller, **no permission** (it acts only on the
caller's own account; no catalogue key could express it without inventing a concept). `AUTHENTICATED`
bucket in the Phase 23 classifier, declared with a written reason.

### Guard and registry

`server/test/phase23-authorization-contract.test.mjs` declares the new route (the guard pins bucket
*membership*, not counts, so it fails on the declaration alone). `server/scripts/run-tests.mjs`
registers the new suite as `MIXED`.

### Two pre-existing tests whose pins the change moved

- `phase26b-password-recovery.test.mjs` — its **tripwire** asserts the reset service contains no
  "field-removal" operator. A comment of mine mentioned one. The comment was reworded; the tripwire and
  the R-4 logic are unchanged. Its `User.save()` stub case was updated because R-4 replaced that call.
- `phase32b-firebase-admin.test.mjs` — pinned the verify seam's returned field set; updated to include
  `authTime`, plus one added case narrowing the seam.

## Database / schema changes

**None.** No model, index, migration or field was added. The design is schema-free: `firebaseUid` is
`$unset` (because the index is sparse), and R-4 binds against the existing token `createdAt`.

## Tests added

`server/test/phase32l-firebase-unlink.test.mjs` — **43 tests, 3 suites, `MIXED`** (unit + DB-backed over
the real `app.ts`).

Coverage: normal unlink for a Firebase-native and a Firebase-linked account · new password works and the
**old retained password does not** · `emailVerified` and `passwordChangedAt` transitions · unauthenticated ·
inactive business · invalid/expired token · uid mismatch · identity owned by another user · nothing
linked · **client-supplied uid cannot steer it** · fresh vs stale `auth_time` · the 300 s boundary ·
**`iat` cannot substitute for `auth_time`** · missing/weak password (both through HTTP **and** calling the
service directly) · unlink × unlink · link × unlink · link after unlink restoring authority · session
revocation on success and **no unnecessary revocation on failure** · R-3 and R-4 in both orderings ·
a normal reset still working (including a null `passwordChangedAt`) · the audit row's contents · and a
lifetime assertion that the suite installed no verifier outside its own scope.

## Tests executed

| Command | Result |
| --- | --- |
| `npm test` (full) | **838 tests / 109 suites / 0 fail** |
| `npm run test:unit` | 348 tests / **324 pass** / 0 fail (24 skipped by design) |
| `npm run test:db` | 540 tests / **514 pass** / 0 fail (26 skipped by design) |
| `node --test test/phase32l-firebase-unlink.test.mjs` | 43 / 43 pass |
| `npm run typecheck` (`tsc --noEmit`) | clean |
| `npm run lint` (`eslint .`) | clean |

Suite total moved **795 → 838** (+43) and **106 → 109** suites (+3). No pre-existing assertion was
weakened and no test was deleted.

## Mutation tests

Ten mutations applied to pristine copies, each on its own, restored immediately after.

| # | Mutation | Verdict |
| --- | --- | --- |
| M1 | `auth_time` freshness enforcement disabled | **DETECTED** |
| M2 | UID ownership check removed (with the conditional filter, together) | **DETECTED** |
| M3 | conditional unlink write made unconditional | **DETECTED** |
| M4 | new-password requirement removed | **NOT DETECTED → fixed → DETECTED** |
| M5 | old-hash replacement dropped | **DETECTED** |
| M6 | R-3 reset-token invalidation removed | **NOT DETECTED → fixed → DETECTED** |
| M7 | conditional reset completion made blind | **DETECTED** |
| M8 | session revocation removed | **DETECTED** |
| M9 | `authMethods.firebase` not published | **DETECTED** |
| M10 | unlink audit row removed | **DETECTED** |

**The two misses were real test weaknesses, and this is the phase's most useful finding.**

- **M4** went undetected because the *controller validator* also rejects a bad password, so removing the
  **service-level** check changed nothing observable over HTTP. The service check is genuine
  defence-in-depth, but the suite was not measuring it. A case was added that calls
  `unlinkFirebaseIdentity()` **directly**, with no HTTP layer in front of it; M4 is now detected.
- **M6** went undetected because the R-3 case performed a "while the account is linked" probe on the
  **same** token first, which *spent* it — so the later `usedAt: null` count was measuring the spending,
  not R-3's deletion. Restructured: the probe uses a **separate** token, and the assertion now checks
  both the unused count going 1 → 0 **and** that the specific row is gone by hash.
- **M2** deliberately removes two layers at once (the CASE-D-style guard **and** the conditional filter),
  because each is independently enforced; removing either alone leaves the property intact, so a
  single-layer mutation is correctly green. Same reasoning as FB-006's `FIREBASE_IDENTITY_CONFLICT`
  finding: defence in depth, not redundancy to be tidied away.

After the fixes: **10 / 10 detected, restore clean.**

## Security findings

| Question | Answer |
| --- | --- |
| Can a Firebase account authenticate through the legacy password path? | **No** — the Phase 32E/32K guard is untouched. |
| Can the account reach a zero-authentication-method state? | **No** — the new credential is validated and hashed before the transition, which clears one method and installs another in the same write. |
| Can the retained hash be resurrected by unlink? | **No** — it is *replaced* by the new hash in the same conditional write; there is no path that re-enables it. |
| Can a client-supplied uid steer the operation? | **No** — the validator returns no uid; the identity comes from the verified token and the account from `req.user`. |
| Can the identity be transferred or merged? | **No** — a mismatch is refused with 409 and never re-pointed. |
| Does unlink change tenant, role, status, permission or subscription? | **No** — only `firebaseUid`, `emailVerified`, `passwordHash`, `passwordChangedAt`. |
| Is a stale authentication accepted? | **No** — enforced server-side from the signed claim; `iat` is not consulted; `null` fails closed. |
| Does the audit row carry sensitive values? | **No** — no uid, token, `jti`, password or hash; success records only `passwordEstablished: true`. |
| Does the fix introduce plaintext or a temporary credential? | **No** — the password is hashed with the shared policy before use and never persisted in the clear. |
| Does the phase alter Phase 32H linking? | **No** — the link service is unchanged. |
| Does the phase implement unlinking of *providers*? | **No** — client-side only per the freeze. |

## Error contract

| Condition | Status | Code |
| --- | --- | --- |
| No authenticated session | 401 | `AUTH_REQUIRED` |
| Inactive/suspended business | 403 | `BUSINESS_NOT_ACTIVE` (inherited from `requireAuth`) |
| Missing/invalid body field | 400 | `VALIDATION_ERROR` |
| Invalid Firebase ID token | **400** | `FIREBASE_TOKEN_INVALID` (Phase 32H precedent: a rejected *provider* credential must not read as session loss) |
| No Firebase identity on the account | 409 | `FIREBASE_IDENTITY_NOT_LINKED` |
| Presented identity belongs to another user | 409 | `FIREBASE_IDENTITY_CONFLICT` |
| `auth_time` older than 300 s | 409 | `FIREBASE_REAUTHENTICATION_REQUIRED` |

**★ DEVIATION FROM THE BRIEF, AND IT IS DELIBERATE.** The brief suggested `403` for
`FIREBASE_REAUTHENTICATION_REQUIRED`, while allowing the project's established convention to win. It is
**409**. The reason is a client contract, not a preference: `mobile/lib/client.ts` treats a **401 or
403** response to a token-bearing request as **session loss** and clears the session — so a 403 here
would sign a user out merely for being asked to reauthenticate. The brief's own instruction to preserve
the project convention for this code is what the 409 implements; **the error code is exactly as frozen**.

## Known limitations

1. **No runtime verification.** No build, no device, no emulator, no live Firebase project and no real
   unlink was performed. All evidence is static (suites, typecheck, lint).
2. The **mobile half does not exist yet**: no reauth, no unlink screen, no client sign-out, no provider
   cleanup. Until it ships, the endpoint is reachable only by a client that implements the flow.
3. **Client-side reauthentication is unexercised**, and its necessity depends on measurement rather than
   assumption: the Phase 32L runtime experiment showed Firebase **accepting** a provider unlink at a
   390-second-old authentication while **refusing** `updatePassword` at the same age — so the frozen
   window is *our* policy, and the client flow exists to satisfy it.
4. **Federated re-sign-in after unlink remains unverified** — whether a Google re-sign-in mints a new uid
   in this project needs a live Google credential.
5. **An orphaned Firebase identity remains possible** after a server unlink (the O-6 class): the Firebase
   account still exists, so re-registering with the same provider stays `EMAIL_IN_USE` and the only route
   back is explicit link from a password-authenticated session.
6. The O-2-family residual — a link's retained hash being inert — is **unchanged** and is the *reason*
   the unlink transition must install a fresh hash rather than reactivate the old one.

## Deferred work

Unlink **policy** beyond the freeze · unlink/last-method protection for other methods · provider-level
management · Admin SDK `providersToUnlink` · unlinking cleanup · Facebook · Apple · invitations ·
iOS runtime validation · production Firebase configuration · Render deployment · production migration ·
documentation synchronisation of `README.md`, `docs/DEVELOPMENT_ROADMAP.md`,
`docs/SYSTEM_SPECIFICATION.md` and the FB-007 ledger entries (recommended as the Phase 32L close-out).

## Git checkpoint

| Item | Value |
| --- | --- |
| Branch | `experiment/freebuff-evaluation` |
| HEAD before | `8af1d49f83b3f4d82c7e40d894c94ab61620ab80` |
| HEAD after | `8af1d49f83b3f4d82c7e40d894c94ab61620ab80` — **unchanged** |
| Staged | **0** |
| Commit | **none created** — the brief says to stop and report the proposed message unless the workflow requires a checkpoint |
| Push | **never** |

**Proposed commit message (not executed):**

```
feat: add firebase unlink backend boundary (Phase 32L-A)
```

**Files created by this task:** `server/src/constants/firebase.ts`,
`server/src/services/firebaseUnlink.service.ts`, `server/test/phase32l-firebase-unlink.test.mjs`,
`docs/freebuff/tasks/FB-008-phase-32l-a-unlink-backend.md`.

**Files modified by this task:** `server/src/services/firebase/tokenVerifier.ts`,
`server/src/services/auth.service.ts`, `server/src/services/passwordReset.service.ts`,
`server/src/middlewares/authenticate.ts`, `server/src/utils/validate.ts`,
`server/src/controllers/firebaseAuth.controller.ts`, `server/src/routes/auth.routes.ts`,
`server/src/constants/audit.ts`, `server/scripts/run-tests.mjs`,
`server/test/phase23-authorization-contract.test.mjs`, `server/test/phase26b-password-recovery.test.mjs`,
`server/test/phase32b-firebase-admin.test.mjs`.

## Protected files

`sha256sum` before and after — **all five byte-identical** to the FB-002 baseline:

| Path | SHA-256 (unchanged) |
| --- | --- |
| `mobile/eas.json` | `10c5ff2e…d7bd530` |
| `server/src/services/ai/providers/http.ts` | `23e91610…da1a213` |
| `server/test/phase06-ai-wire.test.mjs` | `83767f8b…22d0768` |
| `docs/superpowers/plans/2026-09-11-phase-18c-core-list-screens.md` | `52d3afef…10625891` |
| `docs/superpowers/plans/2026-09-11-phase-18e-secondary-screens.md` | `d000a5d3…e63c297` |

No reset, restore, clean, stash or history manipulation was performed. **Render was not touched.**
**No dependency was installed, removed or upgraded.** **No schema or index was changed.**

## Final Outcome

`PASS (implementation + static verification)`. The server half of Phase 32L is implemented to the frozen
contract, with the reset-token race closed and **10/10 mutations detected**. **Runtime verification is
`EXPERIMENT REQUIRED`** — no build, no device, no live Firebase call. Nothing was committed.

## Claude Code Handoff / Next Step

**Phase 32L-B — the mobile flow.** Required: client-side Firebase reauthentication when the server
answers `FIREBASE_REAUTHENTICATION_REQUIRED`; an Authentication & Security entry in Profile; collecting
the new password; the server call; then Firebase sign-out and **optional** provider cleanup — in that
order, never provider-unlink-first. Nothing sensitive may pass through router params, and the client must
never log a token, a uid or a password. `authMethods = { password, firebase }` is the surface the UI
gates on; no provider-specific field exists to consume.
