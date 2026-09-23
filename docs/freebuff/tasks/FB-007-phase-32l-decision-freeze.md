# FB-007 — Phase 32L DECISION FREEZE

**Status:** FROZEN — **decisions recorded, nothing implemented.**
**Supersedes nothing:** this record closes the open questions in
`FB-007-unlink-last-method-design.md` (Extensions I–III). It does not rewrite them.

Labels used throughout: `[SOURCE]` read from the repository · `[EXPERIMENT]` observed in the Phase 32L
real-Firebase runtime verification · `[FIREBASE OFFICIAL DOC]` · `[SDK SOURCE]` · `[INFERENCE]` ·
`[EXTERNAL VERIFICATION REQUIRED]` · `[FROZEN]` binding decision.

---

## 0. Scope and purpose

A **decision-freeze only** task. No application source, test, schema, model, environment file, dependency,
MongoDB, Render or Firebase Console change was made. The purpose is to write down the final Phase 32L
architecture so that implementation cannot invent policy.

**Preflight (verified):** branch `experiment/freebuff-evaluation` · HEAD
`8af1d49f83b3f4d82c7e40d894c94ab61620ab80` · staged **0** · working tree **28** entries · the five
protected files **byte-identical**.

---

## 1. Frozen decisions

### D-1 — Recent authentication: **Option D** `[FROZEN]`

* The **client** performs Firebase reauthentication **when required** — reactively: it attempts the unlink,
  and on the server's recency refusal it reauthenticates and retries **once** with a freshly issued ID token.
* The **server verifies the signed Firebase `auth_time`** on every unlink attempt. This is the control.
* **Client-side reauthentication alone is never the security control.**
* **`iat` is not recency.** A token refresh moves `iat` and leaves `auth_time` untouched `[EXPERIMENT]`, so
  any check keyed on `iat` would accept an arbitrarily old authentication.

### D-2 — Firebase provider unlink: **client-side only in Phase 32L** `[FROZEN]`

* The **Inventory AI server owns the authoritative account unlink** (clearing `firebaseUid`).
* Firebase provider unlink is **optional client-side cleanup, performed after** the server operation.
* **The Admin SDK `providersToUnlink` is NOT added to the production unlink flow in Phase 32L.** Its
  capability is **recorded as verified but future-only** (it was exercised at runtime and succeeded, including
  on the last provider — see §6).

### D-3 — Dedicated unlink error semantics `[FROZEN]`

* A dedicated code `FIREBASE_IDENTITY_NOT_LINKED` is used for the **“nothing is linked”** state.
* `FIREBASE_IDENTITY_CONFLICT` is **preserved for genuine identity ownership conflicts** and is **not**
  reused for “nothing is linked”.
* Full matrix in §4.

### D-4 — Authentication methods `[FROZEN]`

* Public user state exposes exactly `{ password: boolean, firebase: boolean }`.
* **No provider-specific fields** (no `google`, `facebook`, `apple`).
* **Firebase remains responsible for its own provider set**; Inventory AI never learns or stores it.

### D-5 — Business status `[FROZEN]`

* Unlink **inherits** the existing `requireAuth → assertActiveBusiness` boundary
  (`middlewares/authenticate.ts:138`). **No special bypass.**

### D-6 — Unlink policy: **Policy B** `[FROZEN]`

A Firebase-linked account may be unlinked **only by establishing a NEW Inventory AI password**.
**The old retained password hash is NEVER resurrected.**

### D-7 — Reset-token race contract `[FROZEN]` — see §3.

### D-8 — Identity rules (preserved, not changed) `[FROZEN]`

`firebaseUid` is the identity linkage key · email is **not** an account-linking join key · an unknown
Firebase UID is **never** attached by email · **no** automatic merge or transfer on a matching email ·
identity conflicts remain **non-transferable** · `businessId`, role, account status and permissions are
**not** changed by unlink · `firebaseUid` is never exposed to the mobile client · Firebase tokens, OAuth
credentials, passwords, password hashes and reset secrets are **never** logged.

### D-9 — Authoritative sequence `[FROZEN]`

```text
1. Firebase recent reauthentication            (client, only if the server requires it)
2. Inventory AI server unlink                  (authoritative)
3. Revoke all Inventory AI sessions
4. Firebase client sign-out
5. Optional Firebase provider-unlink cleanup    (client)
```

**Firebase provider unlink MUST NOT be performed first.** `[EXPERIMENT]` justification: doing it first would
strand a `firebaseUid` the server can no longer resolve, while everything after step 2 is repeatable or
skippable.

---

## 2. Mandatory unlink invariants

| # | Invariant |
| --- | --- |
| **I-1** | The server **must never allow the account to transition into a zero-authentication-method state.** |
| **I-2** | `firebaseUid` is cleared **only** when a valid NEW password has been accepted and the account will therefore still hold exactly one usable method. |
| **I-3** | The retained/old password hash is **replaced**, never merely re-enabled. It must not be able to authenticate again at any point. |
| **I-4** | The account, tenant, role, status and permissions are **unchanged** by unlink; only authentication state moves. |
| **I-5** | The identity being unlinked is the **caller's own** `firebaseUid`, proven by `req.user` **and** a verified Firebase ID token whose `uid` equals it. No client-supplied `userId`/`businessId`/`firebaseUid`/`role`/`status` may steer the operation. |
| **I-6** | The transition is a **single conditional write**; a lost race leaves the account unchanged. |
| **I-7** | On success the server **revokes all Inventory AI sessions** and the client is forced back through login. |
| **I-8** | No `jti`, Firebase UID, reset secret, token or hash is written to the audit trail. |

**Conceptual server transition `[FROZEN]`:**

```text
verify authenticated Inventory AI session        (requireAuth, so ACTIVE business is already required)
verify Firebase ID token
require token uid === currently linked firebaseUid
enforce the recent-auth policy using verified auth_time
validate the NEW password with the shared password validator
atomically:  clear firebaseUid
             set emailVerified = false
             replace the old/retained password hash with the NEW hash
             set passwordChangedAt
invalidate outstanding reset tokens               (see §3, R-3)
revoke all Inventory AI sessions
→ force the client back through login
→ optional client-side Firebase provider unlink / sign-out
```

---

## 3. Reset-token race contract `[FROZEN]`

### The hole is real, and Phase 32K does not close it `[SOURCE]`

The two Phase 32K guards are, in `server/src/services/passwordReset.service.ts`:

* **line 384** — `requestPasswordReset`: `if (user.firebaseUid) return;` → **no token is issued** while linked.
* **line 527** — `resetPassword`: `if (user.firebaseUid) throw invalidResetToken();` → **no token is spent** while linked.

Both are keyed on `firebaseUid` **being present**. The unlink transition **removes** that field, so at the
exact moment the NEW password exists, **both guards stop applying**:

```text
t0  legacy account (firebaseUid absent) requests a reset      → token T issued, 30-minute TTL
t1  account is linked to Firebase (Phase 32H)                 → firebaseUid set
t2  account unlinks Firebase (Phase 32L)                      → NEW password, firebaseUid CLEARED,
                                                                 passwordChangedAt stamped
t3  token T is spent                                          → claim succeeds (usedAt null, unexpired)
                                                              → firebaseUid is now absent, so line 527
                                                                does NOT fire
                                                              → the write below OVERWRITES the new password
```

The claim query itself carries **no credential binding** — `{ tokenHash, usedAt: null, expiresAt: { $gt: now } }`
— and the completion write is a **blind `user.save()`**. So an outstanding token survives every credential
change until it expires or is deleted.

**This is not solved by weakening the Firebase password boundary**, and the boundary is not touched.

### The contract

| # | Contract |
| --- | --- |
| **R-1** | While `firebaseUid` is present, no reset token may be **issued** (existing line 384). **Unchanged.** |
| **R-2** | While `firebaseUid` is present, no reset token may be **spent** (existing line 527). **Unchanged.** |
| **R-3** | **The unlink transition MUST invalidate every outstanding unused reset token for the user** — `PasswordResetToken.deleteMany({ userId, usedAt: null })` — **ordered BEFORE** the authoritative user write. This reuses the convention the reset flow already applies to itself at line 551 (“completing a reset invalidates every other outstanding link for this user”). |
| **R-4** | **The reset completion’s user write MUST be conditional, not a blind `save()`.** It must match on the credential state read at claim time — `{ _id, firebaseUid` still absent, `passwordChangedAt` unchanged `}` — so a claim that interleaves with an unlink aborts **without writing**. |

### Why R-3 + R-4 together are complete

| Ordering | Closed by |
| --- | --- |
| issued pre-link → spent while linked | **R-2** (line 527) |
| issued pre-link → linked → unlinked → spent | **R-3** (token deleted before the new password exists) |
| claim succeeds, then unlink interleaves, then the write | **R-4** (`passwordChangedAt` moved → conditional write matches nothing) |
| issued while linked | impossible — **R-1** |
| unlink completes, then the token is presented | **R-3** — the claim matches nothing |

**Schema-free.** R-4 needs no new field: unlink already stamps `passwordChangedAt`, so the value read at
claim time cannot match after an interleaving unlink. `[INFERENCE]`

**Beneficial side effect, recorded deliberately:** R-4 also closes the same class of hole for an ordinary
`change-password` after a token was issued. That is a **wider** property than the brief demanded; it is
recorded here so it is adopted knowingly, not discovered later.

**This contract must not be satisfied by relaxing R-1 or R-2.**

---

## 4. Error / status matrix `[FROZEN]`

| Situation | Status | Code | Client-facing | Retry |
| --- | --- | --- | --- | --- |
| No Inventory AI session | 401 | `AUTH_REQUIRED` (existing) | yes | sign in |
| Missing / invalid / expired Firebase ID token | **400** | `FIREBASE_TOKEN_INVALID` (existing) | yes | reauthenticate |
| Account has **no** `firebaseUid` | 409 | **`FIREBASE_IDENTITY_NOT_LINKED`** *(new)* | yes | no |
| Token `uid` ≠ the account’s `firebaseUid` | 409 | `FIREBASE_IDENTITY_CONFLICT` (existing) | generic | no |
| `auth_time` outside the recency window | 409 | **`FIREBASE_REAUTHENTICATION_REQUIRED`** *(new)* | yes | **yes — after reauth** |
| Missing / weak `newPassword` | 400 | `VALIDATION_ERROR` + `fields` (existing shared validator) | yes | yes |
| Non-ACTIVE business | 403 | `BUSINESS_NOT_ACTIVE` (existing, inherited) | yes | no |
| Conditional write lost a race | 409 | `FIREBASE_IDENTITY_CONFLICT` | generic | yes |

**400 for a bad Firebase credential is deliberate** (`[SOURCE]`, the Phase 32H precedent): the mobile client
treats **401 and 403** as session loss, so answering 401 here would sign a user out over an unrelated
provider failure.

**Recency is a `409`, never 401/403**, for the same reason.

`FIREBASE_REAUTHENTICATION_REQUIRED` must be **retryable** — it is the signal the client’s reactive
reauthentication (D-1) keys on.

**Recency window:** a named constant (e.g. `FIREBASE_REAUTH_WINDOW_SECONDS`), **recommended 300 s** — matching
Firebase’s own notion of “recent” and consistent with the runtime observation that a **390 s**-old
authentication is treated as stale by Firebase for `updatePassword`. Adjustable without redesign.

---

## 5. Audit events

Two events, both carrying **no uid, no token, no secret**:

* `FIREBASE_IDENTITY_UNLINKED` — success.
* `FIREBASE_IDENTITY_UNLINK_CONFLICT` — a refused attempt that indicates an identity conflict.

`FIREBASE_IDENTITY_LINKED` / `FIREBASE_IDENTITY_LINK_CONFLICT` are the existing Phase 32H pair
(`constants/audit.ts:64-65`) and are **unchanged**.

No audit row is written for the “nothing is linked” state — recording an event that did not happen is a
false trail, the same reasoning `revokeSessionByJti` already uses `[SOURCE]`.

---

## 6. Evidence supporting each decision

| Decision | Evidence |
| --- | --- |
| **D-1 (Option D)** | `[EXPERIMENT]` `reauthenticateWithCredential()` produced a token with a **new** `auth_time` (**+9 s**, two independent runs). A forced refresh moved only `iat` and left `auth_time` identical. `auth_time` is a signed, server-verifiable claim `[FIREBASE OFFICIAL DOC]`, and the decoded payload is already in hand — currently discarded — at `services/firebase/tokenVerifier.ts:148` `[SOURCE]`. |
| **D-1 (server must enforce)** | `[EXPERIMENT]` At a **390 s** authentication age, `unlink` **succeeded** while `updatePassword` was **refused** with `auth/requires-recent-login` under identical conditions. Firebase therefore does **not** gate unlink on recency, so Option D cannot delegate the check to Firebase. |
| **D-2 (client-only)** | `[EXPERIMENT]` Admin `providersToUnlink(['password'])` **succeeded**, uid unchanged, account persisted, email retained — capability **verified but deliberately unused in Phase 32L**. `[EXPERIMENT]` Admin provider unlink did **not** invalidate the live session’s refresh token, so it is cleanup, not the authoritative step. |
| **D-3 (error codes)** | `[SOURCE]` The 32H mapping precedent, and `FIREBASE_IDENTITY_NOT_LINKED` is a genuinely distinct state from a conflict. |
| **D-4 (`authMethods`)** | `[SOURCE]` `authMethodsFor` (`auth.service.ts:213`) currently returns `{ password: !user.firebaseUid }`; adding `firebase` is **backward compatible** because existing consumers branch on `password`, not on the key set. No consumer needs provider detail. |
| **D-5 (business status)** | `[SOURCE]` `assertActiveBusiness` runs inside `requireAuth` (`authenticate.ts:138`), so every authenticated route already requires an ACTIVE business — the unlink route inherits it. |
| **D-6 (Policy B)** | `[SOURCE]` A Firebase-native account has **no** `passwordHash`; clearing `firebaseUid` without establishing one would yield zero methods. `[EXPERIMENT]` Neither unlink path refuses to remove the last provider, so nothing upstream prevents the zero-method state — it is entirely the server’s to uphold. |
| **D-7 (race contract)** | `[SOURCE]` The claim query has no credential binding and the completion write is a blind `save()`; the 32K guards are keyed on `firebaseUid` **presence** and therefore stop applying the moment unlink clears it. |
| **D-9 (sequence)** | `[EXPERIMENT]` Firebase-side unlink leaves the refresh token alive, so it is the safe-to-repeat/skip step; the server write is the irreversible one. |

---

## 7. Remaining external-verification gaps

Recorded as **unresolved**, not as assumptions. **None of these contradicts the frozen design**, so — per
the freeze instruction — they do **not** block it.

1. **Federated re-sign-in after unlink has not been exercised with a live Google credential.**
   `[EXTERNAL VERIFICATION REQUIRED]` For **email/password** it was measured: a same-email re-registration is
   **refused** (`auth/email-already-exists` / `auth/email-already-in-use`) and **no new UID is minted**. The
   widely documented “new Firebase account on re-sign-in with an unlinked provider” belongs to the
   **federated** path (`signInWithIdp` carries `autoCreate`; the reauth resolver sets `autoCreate = false`)
   `[SDK SOURCE]` — **unverified in this project**.
2. **Google/Facebook reauthentication → `auth_time` has not been experimentally verified.**
   `[EXTERNAL VERIFICATION REQUIRED]` Only the password provider was exercised. `auth_time` is stamped by the
   Identity Toolkit backend rather than the provider, so the design expects the same behaviour — that is
   **`[INFERENCE]`**, not a measurement.
3. **The federated orphan case** (a tenant whose Firebase identity is removed and whose user later signs in
   anew) remains untested end-to-end.

**Consistency check against D-1:** the recency control reads `auth_time` from the **verified token**, which is
provider-independent. Gaps 1–2 concern whether the *client* can obtain a fresh token for a federated
provider; if it cannot, the server simply answers `FIREBASE_REAUTHENTICATION_REQUIRED` and no unlink occurs —
a **fail-closed** outcome, not a contradiction.

---

## 8. Follow-up: broader-document synchronization (NOT done here)

Per instruction, the wider project documents were **not** modified. They are **out of date with respect to
this freeze and the Phase 32L work in general**:

* `README.md`, `docs/DEVELOPMENT_ROADMAP.md`, `docs/SYSTEM_SPECIFICATION.md` — no Phase 32L entry.
* `docs/freebuff/MASTER_LOG.md`, `docs/freebuff/DECISIONS.md`, `docs/freebuff/HANDOFF.md` — the ledger
  describes FB-007 only through its **second pass**; Extensions III (runtime verification) and this freeze
  are unrecorded there. The gap was already flagged at the end of Extension II and is **still open**.

These need a deliberate synchronization step — recommended as the close-out half of Phase 32L, after
implementation — rather than a silent edit now.

---

## 9. What must happen before implementation

1. **No blocking contradiction was found** — the freeze stands on the evidence in §6.
2. **`auth_time` must be surfaced** from the verified token. Today `tokenVerifier.ts` discards it; the
   recency check cannot exist until it is exposed.
3. **`authMethodsFor` gains `firebase`**, and **both** surfaces that publish it — `toPublicUser` and
   `requireAuth`’s `req.user` — must carry it (`[SOURCE]`: `/api/auth/me` returns `req.user`, not
   `toPublicUser`).
4. **The recency window constant** must be chosen and named (§4 recommends 300 s).
5. **R-3 ordering** must be explicit in the unlink service: reset-token invalidation **before** the user write.
6. **R-4 may touch the shared reset path** — `passwordReset.service.ts` is shared with the legacy flow, so
   changing its completion write to conditional is a change to an existing, heavily-pinned code path. It
   needs its own regression coverage and must not weaken any existing reset guarantee.
7. **The two new audit events and two new error codes** must be added under the existing conventions.
8. **No schema change is required** for anything frozen here.

---

## 10. Git / safety verification

| Check | Result |
| --- | --- |
| Branch | `experiment/freebuff-evaluation` — unchanged |
| HEAD | `8af1d49f83b3f4d82c7e40d894c94ab61620ab80` — unchanged |
| Staged | **0** |
| Working tree | **28** entries — unchanged |
| Protected files (5) | **byte-identical** — `10c5ff2e…d7bd530` · `23e91610…da1a213` · `83767f8b…22d0768` · `52d3afef…10625891` · `d000a5d3…e63c297` |
| Source / tests / schema / `.env` / dependencies / MongoDB / Render / Firebase Console | **untouched** |
| Commit · push · reset · restore · clean · stash | **none** |

**Files written by this pass: this record, and a pointer to it appended to the FB-007 task record.**
Nothing else.
