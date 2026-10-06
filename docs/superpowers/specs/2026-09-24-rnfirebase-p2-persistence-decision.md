# React Native Firebase — P2 Persistence Architecture Decision (FROZEN)

**Document type:** Architecture decision record (Freebuff-authored, owner-approved).
**Date:** 2026-09-24.
**Status:** **APPROVED / FROZEN** — see §1 and §8.
**Amended:** 2026-09-24 — §8.1 records the owner's approval of the two remaining Phase 1 decisions
(**P-1**, **P-2**). Nothing outside §8.1 was changed by that amendment.
**Scope:** Documentation only. This document changes no source code, no dependency, no package manifest,
no environment variable, no Firebase Console configuration, no database record, no schema, no route and
no authentication behaviour. It creates no build and no commit.

**Relationship to the authoritative documents.** This is a new, narrow decision record. It **supersedes
exactly one** previously recorded requirement (the Phase 32D `inMemoryPersistence` decision) and
**supersedes nothing else**. `docs/SYSTEM_SPECIFICATION.md`, `docs/DEVELOPMENT_ROADMAP.md`, `CLAUDE.md`
and `docs/superpowers/specs/2026-09-18-firebase-auth-design.md` remain authoritative for everything
they already govern; where this document and an older phase record disagree about **persistence only**,
this document governs.

**Provenance labels used below:** `[SOURCE]` publicly documented and read this session · `[REPO]`
observed in this repository · `[INFERENCE]` reasoning from evidence · `[EXTERNAL VERIFICATION REQUIRED]`
not settleable from the repository or the documentation read.

---

## 1. The decision

The owner approved **P2**:

> **React Native Firebase will use its native durable Firebase Auth persistence.**
> **This formally supersedes the previous Phase 32D `inMemoryPersistence` decision.**

The owner additionally accepted, in the same decision:

1. The device **may hold two durable credentials**: the native Firebase Auth session and the Inventory AI
   JWT/session.
2. The **resulting threat-model change** (see §5).
3. That **logout, cold-start restoration, reauthentication, Firebase unlink and session reconciliation
   will be redesigned** accordingly (see §6).

This decision is **architecture only**. It authorizes no implementation. Phase 1 (RNFirebase foundation)
has **not** begun and may not begin until the open items in §8 are resolved.

---

## 2. The superseded decision (retained, not deleted)

The decision being superseded was recorded at **Phase 32D** and lives in four places. All four remain
byte-identical; none is edited or deleted by this document.

| # | Where the old requirement is recorded | Status |
| --- | --- | --- |
| 1 | `mobile/lib/firebase.ts` — the module comment *"WHY `initializeAuth` AND NOT `getAuth` (owner decision 4)"*, and the code `initializeAuth(instance, { persistence: inMemoryPersistence })` `[REPO]` | **SUPERSEDED** — for the future RNFirebase implementation. The current file is unchanged and still correct for the **shipped** JS-SDK implementation. |
| 2 | `CLAUDE.md` §7, Phase 32D entry — *"the `inMemoryPersistence` decision"* `[REPO]` | **SUPERSEDED** — historical phase record, left in place. |
| 3 | `README.md` — the Phase 32D summary line `[REPO]` | **SUPERSEDED** — historical phase record, left in place. |
| 4 | `docs/superpowers/specs/2026-09-18-firebase-auth-design.md` — the phase table row for 32D, which names *"the `inMemoryPersistence` decision"* `[REPO]` | **SUPERSEDED** — historical phase record, left in place. A dated cross-reference to this document is added in §12 of that file. |

**The superseded requirement, stated so it can be read without opening the old files:**

> *"Firebase Auth is pinned to `inMemoryPersistence` explicitly… This phase must NOT create a second
> durable credential on the device: the Inventory AI JWT stays the only one."*
> — the Phase 32D rationale, as recorded in `mobile/lib/firebase.ts` `[REPO]`

**Why it is retained rather than deleted.** The Phase 32D decision was correct for the implementation it
described (the Firebase **JS** SDK), it is still the correct description of the **currently shipped**
build, and the repository's own convention is that a later phase supersedes an earlier statement without
rewriting it. Deleting the old text would erase the reasoning that made P1 the preferred answer, which is
exactly the reasoning a future reader needs in order to understand why P2 is a **trade** rather than an
upgrade.

---

## 3. Why P1 is not supported by React Native Firebase

**Result of the Phase 1 blocking verification (2026-09-24): `P1 NOT SUPPORTED — P2 REQUIRED`.**

The evidence, each item read from an authoritative source this session:

| # | Finding | Label |
| --- | --- | --- |
| 1 | RNFirebase's own API reference for `setPersistence`: *"**Not supported on React Native Firebase. Always throws synchronously** because auth state is managed by the native iOS/Android SDKs rather than the web persistence stack."* | `[SOURCE]` |
| 2 | The RNFirebase auth usage page lists the firebase-js-sdk web helpers that throw on React Native, **`setPersistence` first among them**. | `[SOURCE]` |
| 3 | The same page: *"the native Firebase SDKs also provide this functionality using device native SDKs, **ensuring that a users previous authentication state between app sessions is persisted**."* | `[SOURCE]` |
| 4 | RNFirebase v26 requires the New Architecture; on RN 0.82+ that is mandatory anyway, so it is satisfied automatically. Persistence is **not** affected by that requirement. | `[SOURCE]` |
| 5 | No RNFirebase API exposes Android's native `FirebaseAuth.AuthPersistence` (`NONE` / `SESSION` / `LOCAL`), and no documented iOS mechanism exists to disable Keychain-backed persistence. `useUserAccessGroup` governs Keychain **sharing**, not persistence. | `[EXTERNAL VERIFICATION REQUIRED]` — no supported path found |
| 6 | The only community workaround is a **launch-time `signOut()`** (offered by an RNFirebase maintainer in the project's own Q&A). It clears the session on launch, but the credential **is written to disk and exists between sign-in and the next launch** — *durable-but-cleared*, not non-durable. | `[SOURCE]` + `[INFERENCE]` |

**Conclusion.** The property the Phase 32D decision relied on — *"there is nothing durable to clear on
sign-out, because nothing was ever kept"* — **cannot be reproduced under React Native Firebase.**
Therefore P1 was not available, and the owner chose P2 with that fact in view.

---

## 4. Approved P2 behaviour (frozen)

**The device will hold two durable credentials:**

1. **Firebase native Auth session** — persisted by the native iOS/Android Firebase SDKs, in the platform
   store (Android local storage; iOS Keychain).
2. **Inventory AI JWT/session** — persisted in `expo-secure-store` under `TOKEN_KEY =
   'inventoryai.auth.token'`, naming a server-side row in the `sessions` collection `[REPO]`.

**What P2 does NOT change (binding):**

- The Inventory AI JWT remains the **only** credential that authenticates an API request. Firebase ID
  tokens are exchanged **once**, at `POST /api/auth/firebase/exchange`, and never become the bearer
  credential (Option B stays frozen).
- `businessId`, `role`, `status`, permissions and tenant lifecycle remain **MongoDB-authoritative**, read
  per request by `requireAuth`.
- Every security invariant preserved in the Final Architecture Decision remains in force.

**What P2 changes (binding):** the *device-side* assumption that Firebase holds no durable state. Every
place in the mobile codebase that relies on that assumption is now a **known work item** (§6).

---

## 5. Security / threat-model implications (accepted by the owner)

**No server-side control is weakened.** `jti` session revocation (Phase 26A), per-request Mongo
authorization, tenant isolation, the 300 s `auth_time` reauthentication window (Phase 32L), the unlink
policy and the `FIREBASE_SIGN_IN_REQUIRED` guard are all **untouched** by the SDK swap. The change is
entirely on the device.

| Dimension | P1 (superseded) | P2 (approved) |
| --- | --- | --- |
| Credential theft | One durable credential (JWT) | **Two durable credentials** — two independent paths to impersonate the user |
| Rooted / jailbroken device | One target (Keystore/Keychain) | A **second** target; on iOS a Keychain item may survive reinstall |
| Cold start | `currentUser === null`; the app is `signedIn` from SecureStore only | `currentUser` is **restored non-null**; every cold-start assumption must be re-derived |
| Logout | `signOutOfFirebase()` is best-effort and cannot fail | Becomes a **real revocation step** that must run on every sign-out path |
| Sign-out-everywhere | Server revokes all `jti` rows; Firebase state was process-local | Server revocation is unchanged but **does not touch Firebase** — each device's durable Firebase session survives until that device signs out |
| Stale Firebase session | Impossible by construction | **Possible** — a durable Firebase session can outlive every Inventory AI session and be re-exchanged for a new one. *The sharpest new risk.* |
| Firebase unlink | Client ends the Firebase session in the same flow | Same flow, but now **load-bearing**: if the device skips it, a durable Firebase identity can persist after `firebaseUid` was detached server-side |
| Password confirmation | Cold start forces a fresh sign-in, so `auth_time` is recent | A durable session can be reused; `getIdToken(true)` moves `iat` but **not** `auth_time`, so the 300 s rule still correctly refuses stale auth |
| 300 s `auth_time` reauthentication | Server-enforced from the signed claim | **Unchanged** — still server-enforced; a durable client session cannot weaken it |
| App reinstall | Nothing survives | iOS Keychain-backed auth **may survive** reinstall `[EXTERNAL VERIFICATION REQUIRED]` |
| App data clearing | Clears the JWT | Clears the JWT; **may not clear the Firebase credential** on iOS |
| Inventory AI JWT revocation | Complete | **Unchanged — complete** |
| Firebase token revocation | Not used for API auth (`checkRevoked:false`) | **Unchanged**, but now more consequential: the client holds a longer-lived Firebase credential |
| Split-brain auth state | Bounded (Firebase was per-process) | **A new class**: Firebase signed-in while Inventory AI is signed-out (or vice versa), across sessions and devices |

**Accepted, not mitigated.** The owner accepted this change explicitly. No compensating control is
introduced by this document; §6 records the behaviour that must be redesigned.

---

## 6. Required future behaviour (binding design obligations)

These are **obligations**, not yet implementations. Each must be satisfied by the phase named, and each
must be verified on a device — not merely reasoned about.

### 6.1 Logout
- `signOutOfFirebase()` stops being a no-op guarantee and becomes a **required** step on every sign-out
  path. The single funnel is `mobile/lib/auth.tsx`'s `endSession`, which already runs it last `[REPO]`.
- **Order stays: server revocation first, local clear second, Firebase sign-out last.** A failure or
  offline condition must **not** leave the app signed in locally, and must **not** silently skip the
  Firebase sign-out — the skip must be observable.
- **Sign-out-everywhere** must additionally reconcile: server-side `revokeAllSessions` ends Inventory AI
  sessions on all devices, but each device's durable Firebase session persists until that device signs
  out. The redesigned behaviour must state what the other devices observe, and what (if anything) is done
  about it.

### 6.2 Cold-start restoration
- The boot path in `mobile/lib/auth.tsx` currently restores from SecureStore only, and every cold-start
  assumption in `mobile/lib/firebase-auth.ts`, `confirmFirebaseSignIn` and `disconnectFirebase` was
  written for `currentUser === null` `[REPO]`.
- Under P2, `currentUser` is **restored**. The redesign must decide, and record, **which credential is
  authoritative at boot**, and must not let a restored Firebase user imply an authenticated Inventory AI
  session (or vice versa).
- The registration/onboarding path (`mobile/app/register-firebase.tsx`), which documents "a restart has
  no Firebase user", must be re-derived `[REPO]`.

### 6.3 Reauthentication
- The 300 s `auth_time` window is **server-enforced and unchanged** `[REPO]`.
- Under P2 the client may present a **cached, durable** Firebase session instead of re-authenticating.
  The redesign must make the fresh confirmation the **default** for sensitive operations (unlink now, and
  any future sensitive action), and must treat a reused durable session as **not** a confirmation.
- `getIdToken(true)` must never be used as a substitute for reauthentication — it moves `iat` and leaves
  `auth_time` alone `[SOURCE]`.

### 6.4 Firebase unlink
- The Phase 32L-A server contract is unchanged `[REPO]`.
- The client-side obligation **strengthens**: after a `200`, the Firebase session **must** be ended, or a
  durable identity survives a server-side detach. The current sequence (`sessionLostRef` set → central
  sign-out → Firebase sign-out) must be re-verified under durable persistence.
- The unlink policy question **O-1** and the linked-account password disposition **O-2** remain open and
  are **not** settled here.

### 6.5 Session reconciliation
- A **new** obligation created by P2. The app must define what happens when the two durable credentials
  disagree:
  - Firebase signed-in, Inventory AI session absent or revoked → the Inventory AI session is
    authoritative; the app is signed out.
  - Inventory AI session live, Firebase signed-out → permitted for API use; any Firebase-dependent action
    must re-authenticate.
  - Firebase identity differs from the account's `firebaseUid` → **never** reconcile silently; the server
    already answers `409 FIREBASE_IDENTITY_CONFLICT` `[REPO]`.
- Reconciliation must never create an email-based link path, and must never transfer a `firebaseUid`
  between accounts.

---

## 7. What this decision explicitly does NOT change

- The backend authentication architecture (Option B) — **unchanged and frozen**.
- The Inventory AI JWT claim set (`sub` + `jti` + `iat`/`exp`) — **unchanged**.
- The `sessions` collection and `jti` revocation — **unchanged**.
- `User.firebaseUid` uniqueness (sparse unique) and its role as the identity join key — **unchanged**.
- "Never auto-link by email"; "never transfer a `firebaseUid`" — **unchanged**.
- MongoDB authority over `businessId`, role, status, permissions, business lifecycle and
  subscription/billing — **unchanged**.
- The 300 s `auth_time` reauthentication requirement — **unchanged**.
- The 4xx client contract in `mobile/lib/client.ts` (401/403 on a token-bearing request = session loss)
  — **unchanged**.
- The legacy authentication path (`passwordHash`, `/login`, `/register`, `FIREBASE_SIGN_IN_REQUIRED`,
  `passwordChangedAt`, the custom reset flow) — **all retained**; nothing is removed or scheduled for
  removal.
- No other owner decision recorded anywhere is altered by this document.

---

## 8. Phase 1 owner decisions and remaining open items

### 8.1 APPROVED / FROZEN by the owner — 2026-09-24

These two decisions were the **only** remaining decisions blocking Phase 1. Both are now closed.

| # | Decision | Approved resolution (`OWNER DECISION`) |
| --- | --- | --- |
| **P-1** | **Native Firebase configuration files** — `google-services.json` (Android) and `GoogleService-Info.plist` (iOS) | **EAS build-time injection.** These files are **NOT committed to the repository**, and must not be, unless a **later explicit owner decision** changes this. Consequence: they must be supplied to the build through EAS (file environment variables / secrets), which is the mechanism `[EXTERNAL VERIFICATION REQUIRED]` to confirm at Phase 1 build time; and because `.easignore` replaces rather than extends `.gitignore`, any ignore change must be applied to both `[REPO]`. |
| **P-2** | **Google Sign-In library** | **`@react-native-google-signin/google-signin@16.1.5`.** Approved as the **selected Phase 1 integration path** because it is the current free/public integration path and therefore consistent with the project's **free-tier-first** constraint. It is **subject to actual Android/iOS build and runtime verification** — the approval selects the library, it does **not** assert that the integration works. This supersedes the `react-native-nitro-google-signin` alternative named in RNFirebase's own docs for the purposes of this project. |

**Provenance.** Both are `OWNER DECISION`, quoted in `docs/freebuff/DECISIONS.md` `FB-D-125`. Neither
installs a package, changes the Console, or writes any file. **No implementation is authorized by §8.1**
— it records the decisions so Phase 1 can be scoped without re-opening them.

### 8.2 Remaining OPEN / EXTERNAL VERIFICATION REQUIRED

Neither of these blocks Phase 1 **starting**; they block the corresponding **build and runtime claims**.

| # | Item | Status / owner |
| --- | --- | --- |
| **P-3** | RNFirebase 26.4.0 declares `compileSdk`/`targetSdk` **34**; this project's Android build targets higher. Alignment must be checked at build time. | **`[EXTERNAL VERIFICATION REQUIRED]`** — build-time |
| **P-4** | Whether native Android `setPersistence` is reachable by any bridge, and whether an iOS Keychain credential survives app reinstall. | **`[EXTERNAL VERIFICATION REQUIRED]`** — device-time |
| **P-5** | Actual Firebase Console state: providers enabled, Android/iOS apps registered, SHA-1/SHA-256 fingerprints. | **OPEN** — owner / Console |
| **P-6** | iOS build capability — no iOS build or run has ever occurred on this host. | **OPEN** — owner / environment |
| **P-7** | M1 vs M2 (`O-4`) — **CLOSED**: M1 (RNFirebase) is the approved path, with P2 durable persistence. Expo Go (`O-11`) is consequently forfeited. | **CLOSED** by this document |

**Phase 1 readiness (updated 2026-09-24):** compatibility `PASS`, persistence `P2 REQUIRED`, and both
remaining decisions (`P-1`, `P-2`) are **settled**. Phase 1 is now blocked on **nothing** that requires
an owner decision — only on `[EXTERNAL VERIFICATION REQUIRED]` build-time and device-time items
(P-3/P-4) and on Console/environment availability (P-5/P-6). **Phase 1 has still not begun**, and may
not, until the owner approves its implementation.

---

## 9. Supersession record

- **Supersedes:** the Phase 32D `inMemoryPersistence` requirement, recorded in the four places listed in
  §2. Superseded **only**; no old text is deleted or rewritten.
- **Superseded by:** nothing — this is the current decision.
- **A dated cross-reference** to this document has been added in §12 of
  `docs/superpowers/specs/2026-09-18-firebase-auth-design.md`, so a reader of the mobile-integration
  section cannot miss the supersession. All other text in that document is unchanged.
- **Not back-updated:** the historical phase records in `CLAUDE.md`, `README.md`,
  `docs/DEVELOPMENT_ROADMAP.md` and the design doc's phase table keep their original wording, following
  the repository's standing convention that a later decision supersedes an earlier statement without
  editing it.
- **No implementation is authorized by this document.** No package is installed, no Console setting is
  changed, no environment variable is set, no MongoDB record is read or written, and no commit is made.
- **§6.4 "Firebase unlink" is superseded in part — 2026-10-01 (`Phase A / F-1 — 6e2252f4c63a7bd98e1d63a4703f21ab236c93a9`):**
  the "Phase 32L-A server contract" §6.4 is written against was **REMOVED**, not deprecated — the route
  `POST /api/auth/firebase/unlink`, its service and its two unlink audit actions no longer exist in the
  committed tree, and the operation was re-scoped into a **credential change**, so no reachable path clears
  `firebaseUid`. §6.4 stays the historical record of that contract; **Policy B remains the recorded policy
  and its measurements remain valid history**, and the residual (Firebase's own provider set) stays recorded
  rather than closed. See the Phase F-1 correction in `CLAUDE.md` and `docs/AUTH_SECURITY_MASTER_CHECKLIST.md` §8.
