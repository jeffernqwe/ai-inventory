# INVENTORY AI — AUTHENTICATION & SECURITY MASTER CHECKLIST

> **What this document is.** A living **navigation map** for Inventory AI authentication and
> user-security work. It is **not** an implementation phase, it authorises nothing, and it
> changes no code.
>
> **Status legend — every item carries exactly ONE primary status:**
>
> | Tag | Meaning |
> | --- | --- |
> | `[✓]` | **DONE** — implemented and verified per repository evidence. |
> | `[~]` | **PARTIAL / UNVERIFIED** — implementation exists; verification or remaining work incomplete. |
> | `[→]` | **CURRENT** — explicitly authorised work being executed now. |
> | `[ ]` | **FUTURE** — valid future work, not currently authorised to implement. |
> | `[!]` | **DECISION REQUIRED** — owner decision required before work can proceed. |
> | `[⛔]` | **BLOCKED** — external or technical prerequisite missing. |
> | `[⏸]` | **DEFERRED** — intentionally postponed by an existing decision. |
> | `[—]` | **NOT APPLICABLE** — considered and explicitly not applicable. |
>
> **Evidence base.** Re-reconciled against the working tree at branch `main` @ `48969e0`
> (2026-09-28) — the **Phase 2 baseline** recorded in §36. The prior baseline was branch
> `docs/phase-32l-documentation-closeout` @ `f90d45d` (2026-09-26). Sources are listed in §34.
> Where sources disagree, the conflict is recorded in §35 rather than silently resolved.
>
> **Critical distinctions this document enforces:**
> * "Implemented in code" ≠ "externally verified".
> * "Planned" ≠ "authorised".
> * "Approved in principle" ≠ "approved implementation phase".
> * "Decision required" ≠ "future feature".
> * "Blocked" ≠ "not implemented".
> * "Deferred" stays deferred until the owner explicitly changes it.
> * "Security & Recovery" is a **conceptual grouping**, not an official repository phase.

---

## 0. MASTER PURPOSE & SECURITY INVARIANTS

These are non-negotiable. Future work must not break any of them.

| # | Invariant | Status | Evidence / note |
| --- | --- | --- | --- |
| I-1 | **Firebase = identity provider** ("who is this person?"). | `[✓]` | design §3.2; `services/firebase/*`; Phase 32B–32C. |
| I-2 | **MongoDB / Inventory AI = application authority** for userId, businessId, role, status, permissions, business status, plan, sessions, audit. | `[✓]` | `models/user.model.ts`; `middlewares/authenticate.ts` reloads per request. |
| I-3 | **Inventory AI JWT/session = the API bearer**; a Firebase ID token is exchanged **once** and never becomes the bearer. | `[✓]` | `services/firebaseAuth.service.ts`; `config/jwt.ts`. |
| I-4 | **Backend derives userId/businessId/role/status** from the authenticated user, never the client. | `[✓]` | `middlewares/authenticate.ts`; Phase 24 role-mutation proof. |
| I-5 | **Client cannot choose** businessId, role, status, or Firebase linkage. | `[✓]` | `firebaseLink.service.ts` (validator returns only `{problems, idToken}`); linking/registration payloads carry no such keys. |
| I-6 | **Tenant isolation is server-side**; every business-owned query is scoped by a server-derived `businessId`. | `[✓]` | ~15 behavioural tests; Phase 24. |
| I-7 | **Email is NOT an identity-linking key.** No automatic linking on an address match. | `[✓]` | design §14A.4; `firebaseAuth.service` resolves by `firebaseUid` only; `firebaseLink.service` never compares email. |
| I-8 | **Firebase UID is authoritative** for the Firebase identity; read only from a verified token payload. | `[✓]` | `services/firebase/tokenVerifier.ts`. |
| I-9 | **`firebaseUid` uniqueness** — `unique: true, sparse: true` (sparse is mandatory for legacy users). | `[✓]` | `models/user.model.ts`; Phase 32B. |
| I-10 | **A Firebase-linked user has no second password door** — legacy login refuses with 403 `FIREBASE_SIGN_IN_REQUIRED`. | `[✓]` | Phase 32E/32K. |
| I-11 | **Session revocation rules** — a token with no/invalid/revoked/expired `jti` is refused. | `[✓]` | Phase 26A; `middlewares/authenticate.ts`. |
| I-12 | **Password/session invalidation** — `passwordChangedAt` rejects earlier tokens (`SESSION_INVALIDATED`). | `[✓]` | Phase 15; unchanged vs `SESSION_REVOKED`. |
| I-13 | **Re-authentication required** for the Firebase unlink sensitive operation (signed `auth_time`, 300 s, fail-closed). | `[✓]` | `constants/firebase.ts`; `firebaseUnlink.service.ts`. |
| I-14 | **Account linking rules** — authenticated, own-account only, email never a join key, conflicts refused with one 409. | `[✓]` | Phase 32H. |
| I-15 | **Account unlinking rules** — Policy B: a new local password must be established in the same transition; no zero-method account. | `[✓]` | Phase 32L-A; design §27Q. |
| I-16 | **No cross-business account movement** — a link/unlink writes only `firebaseUid`/`emailVerified`/`passwordHash`; `businessId` is never assigned. | `[✓]` | `firebaseLink.service.ts`, `firebaseUnlink.service.ts`. |
| I-17 | **No sensitive credential/token/hash logging** — no password, Firebase token, JWT, `jti`, reset token, or secret is logged. | `[✓]` | `mail/*` discards provider message; audit rows omit `jti` and uid. |
| I-18 | **Disabled users cannot authenticate or use protected APIs.** | `[✓]` | `authenticate.ts` ACTIVE check; Phase 14A disable-revokes-login. |
| I-19 | **Business suspension/archive** blocks authentication and protected use. | `[✓]` | `assertActiveBusiness` (live); `ACCOUNT_DISABLED` / business-status refusal. |
> **Note (I-19 vs §14):** **`utils/businessAccess.ts` `assertBusinessAccess` (`FORBIDDEN_BUSINESS`) is production-dead** — no `src/` importer. Real isolation is `businessId` query scoping returning a plain 404 `NOT_FOUND`. Left byte-identical (Phase 24).
| I-20 | **OWNER protections** — OWNER never created/assigned via the API; OWNER account immutable; no self role/status change; ADMIN↔ADMIN restricted. | `[✓]` | Phase 14A; `users.service.ts`, `constants/roles.ts` (`NON_OWNER_ROLES`). |
| I-21 | **Security-sensitive operations remain backend-authoritative.** | `[✓]` | All gates server-side; mobile RBAC mirror is presentation only. |

**Verification classification:** I-1…I-21 are **code-verified**. As of 2026-09-26 the *end-to-end*
path — Google native sign-in → Firebase authentication → `POST /api/auth/firebase/exchange` →
Firebase Admin verification → Inventory AI session/JWT → authenticated area — is
**E2E VERIFIED on Android for an existing account** (§5a), against a **live** Firebase project with a
configured server-side service account (§3b). The **new-identity → `REGISTRATION_REQUIRED`** path
remains **UNVERIFIED / ENVIRONMENT-BLOCKED** (§5b). iOS remains unverified (P-6). See §25.

---

## 1. ACCOUNT REGISTRATION

| Status | Item | Current behaviour / implemented | Remains | Source |
| --- | --- | --- | --- | --- |
| `[✓]` | **Email/password registration** | `POST /api/auth/register` → `registerBusinessOwner`; rate-limited | — | `routes/auth.routes.ts:42` |
| `[✓]` | **Business creation** | Creates `Business` (status ACTIVE, default planCode) atomically with the OWNER | — | `auth.service.ts` |
| `[✓]` | **Initial OWNER creation** | First user is always OWNER | — | `auth.service.ts` |
| `[✓]` | **Input validation** | `utils/validate.ts`; password min 8 chars; email regex | — | `utils/validate.ts` |
| `[✓]` | **Duplicate email handling** | 409 `EMAIL_IN_USE` | — | `auth.service.ts` |
| `[✓]` | **Password hashing** | bcrypt cost 10; `passwordHash` `select:false` | — | `user.model.ts` |
| `[✓]` | **Initial session behaviour** | Opens a session row named by `jti` | — | `session.service.ts` |
| `[✓]` | **Firebase registration flow** | `POST /api/auth/firebase/register` (PUBLIC, rate-limited) | E2E unverified | `firebaseAuth.service.ts` |
| `[✓]` | **Firebase UID handling** | UID read only from verified token | — | `tokenVerifier.ts` |
| `[✓]` | **Firebase registration with existing email** | Refused 409 `EMAIL_IN_USE` — **linking is refused, not implemented** here | — | Phase 32C |
| `[✓]` | **Rollback/cleanup** | Business rolled back if user creation fails | — | `auth.service.ts` |
| `[ ]` | **Invitation-based registration** | Not implemented; `users.manage` create route unchanged | O-10 decision | design §14A.5; Phase 32F |
| `[✓]` | **Admin/Owner-created users** | `POST /api/users` (OWNER/ADMIN), Phase 14A rules | — | `users.service.ts` |
| `[!]` | **Missing-email provider onboarding** | Facebook identities without a usable email need an explicit flow — **undecided** | O-5 decision | design §14A.5 |

---

## 2. EMAIL/PASSWORD LOGIN

| Status | Item | Current behaviour / implemented | Remains | Source |
| --- | --- | --- | --- | --- |
| `[✓]` | **Email/password login** | `POST /api/auth/login` (two limiters) | — | `auth.routes.ts:43` |
| `[✓]` | **Password verification** | bcrypt; `passwordHash` never selected by default | — | `auth.service.ts` |
| `[✓]` | **Timing-equalized verification** | Phase 32K dummy-hash equalizer | — | `auth.service.ts` |
| `[✓]` | **Generic authentication failure** | 401 `INVALID_CREDENTIALS` (no enumeration) | — | `auth.service.ts` |
| `[✓]` | **Disabled-user behaviour** | 403 `ACCOUNT_DISABLED` | — | `authenticate.ts` |
| `[✓]` | **Suspended/archive business behaviour** | Refused via `assertActiveBusiness` | — | `auth.service.ts` |
| `[✓]` | **Firebase-linked account password-login rejection** | 403 `FIREBASE_SIGN_IN_REQUIRED`, after password+status, before session write (no enumeration, no half-login) | — | Phase 32E/32K |
| `[✓]` | **Session creation** | `SESSION_CREATED` audit row | — | `session.service.ts` |
| `[✓]` | **JWT creation** | HS256, claims `{sub, jti, iat, exp}` only | — | `config/jwt.ts` |
| `[~]` | **Session persistence** | Persisted client-side via secure store; native Firebase persistence under RNFirebase (P2) | device-time verification (P-4) | `mobile/lib/auth.tsx` |
| `[✓]` | **Rate limiting** | `createLoginAccountLimiter` + `createLoginIpLimiter` | — | `rateLimit.ts` |
| `[ ]` | **Failed-login tracking / lockout** | Only rate limiting exists; no per-account lockout | future | — |
| `[ ]` | **Future security hardening** | e.g. suspicious-login signals | future | — |

---

## 3. FIREBASE AUTHENTICATION FOUNDATION

Repository implementation is separated from Firebase Console / external setup.

### 3a. Repository implementation
| Status | Item | Current behaviour / implemented | Remains | Source |
| --- | --- | --- | --- | --- |
| `[✓]` | **Firebase Admin SDK boundary** | `services/firebase/{adminApp,tokenVerifier,firebaseErrors,index}`; lazy app init | live project for E2E | Phase 32B |
| `[✓]` | **Firebase UID verification** | Narrowed to `{uid,email,emailVerified,signInProvider,authTime}` | — | `tokenVerifier.ts` |
| `[✓]` | **Firebase ID token verification** | `checkRevoked:false` (documented) | revocation sync — §23 | `adminApp.ts` |
| `[✓]` | **Exchange endpoint** | `POST /api/auth/firebase/exchange` (PUBLIC, rate-limited) | E2E unverified | Phase 32C |
| `[✓]` | **UID-authoritative lookup** | Resolves by `firebaseUid` **only, never email** | — | `firebaseAuth.service.ts` |
| `[✓]` | **Unknown UID handling** | 403 `REGISTRATION_REQUIRED` | — | Phase 32C |
| `[✓]` | **Registration boundary** | `POST /api/auth/firebase/register`; refuses linking | — | Phase 32C |
| `[✓]` | **Firebase-linked user handling** | `firebaseUid` present → password door refused | — | Phase 32K |
| `[✓]` | **Firebase provider identity handling** | Provider type recorded from verified token (`signInProvider`) | — | `tokenVerifier.ts` |
| `[✓]` | **Firebase logout** | `signOutOfFirebase()` total; outcome consumed via `firebaseSignOutPending` marker | device-time | design §14A.8 (D-E1) |
| `[✓]` | **Firebase session behaviour** | Durable native persistence (P2), Inventory split | device-time (P-4) | `2026-09-24-rnfirebase-p2-...md` |
| `[✓]` | **Firebase token freshness** | `auth_time` checked for sensitive ops; fail-closed | — | `constants/firebase.ts` |
| `[~]` | **Firebase revocation handling** | `checkRevoked:false`; no revocation sync | §23 future | design §16 |
| `[ ]` | **Firebase account disable synchronisation** | Not implemented | §23 future | — |
| `[✓]` | **Firebase config/secrets** | Server-side only; `.env.example` names only; production fail-fast | live creds (P-5) | `config/firebase.ts` |

### 3b. Firebase Console / external setup
| Status | Item | Detail |
| --- | --- | --- |
| `[✓]` | **Live Firebase project** | **Provisioned** (project `inventoryai-d0d20`); Google provider enabled; Android app registered; server-side service account configured on the deployment (§5a). |
| `[~]` | **Firebase Console verification (P-5)** | **Android satisfied** — Google provider enabled, Android app `com.inventoryai.app` registered, SHA-1/SHA-256 registered; **iOS app registration still open** (P-6). |
| `[✓]` | **Android app registration** | `com.inventoryai.app` registered and used by the verified E2E. |
| `[⛔]` | **iOS app registration** | Required; no iOS build possible on host (P-6). |
| `[✓]` | **SHA-1 fingerprint** | **Registered** for the Android app. |
| `[✓]` | **SHA-256 fingerprint** | **Registered** for the Android app. |
| `[✓]` | **EAS build-time configuration** | `eas.json` profiles defined; `google-services.json`/plist **not committed** (EAS injection, P-1). |
| `[~]` | **External verification gates** | Android provider path satisfied; new-identity outcome and iOS open. See §25. |

---

## 4. RNFIREBASE NATIVE MIGRATION

| Status | Item | Implemented? | Verified? | Source |
| --- | --- | --- | --- | --- |
| `[✓]` | **Native Firebase Auth integration** | Yes | Android runtime | Phase B `0c3f87d` |
| `[✓]` | **Native persistence** | Yes (P2 durable) | Android runtime | decision §4 |
| `[~]` | **Durable persistence (cold-start restore)** | Yes | **device-time (P-4)** | decision §6.2 |
| `[✓]` | **Remove Firebase JS SDK / browser OAuth path** | Yes | lockfile + dex verified | Phase F1 `2ec35b8` |
| `[✓]` | **Remove auth-session / web-browser path** | Yes | dex: `expo-web-browser` 0 | Phase F2 `533c76f` |
| `[✓]` | **Native Google Sign-In** | Code exists | **E2E verified (existing account, Android)** | Phase C `ea52c2c` |
| `[~]` | **Cold-start behaviour** | Implemented | device-time not run | decision §6.2 |
| `[✓]` | **Firebase currentUser behaviour** | Split durable/Inventory authority | Android runtime | design §14A.8 |
| `[✓]` | **Explicit local sign-out** | Yes | Android runtime | Phase E `f15995e` |
| `[~]` | **Firebase sign-out** | Yes (pending marker) | device-time | D-E1 |
| `[~]` | **Reauthentication** | `auth_time` freshness implemented | live-project needed | `constants/firebase.ts` |
| `[✓]` | **Linking (native provider side)** | Client-SDK operation | **not server-observable** | §7 |
| `[✓]` | **Unlinking (server side)** | Policy B | code + test | Phase 32L-A |
| `[✓]` | **Android build** | EAS build `f3038fa1…` | FINISHED | §27P |
| `[✓]` | **Android runtime** | `emulator-5554`, 0 fatals | verified | §27P |
| `[⛔]` | **iOS build** | Not possible on host | P-6 | design §14A.11 |
| `[⛔]` | **iOS runtime** | Never occurred | P-6 | `[EXTERNAL VERIFICATION REQUIRED]` |
| `[⛔]` | **Keychain persistence / reinstall behaviour** | Unknown | P-4 device-time | decision §8.2 |
| `[⛔]` | **compileSdk/targetSdk alignment** | RNFirebase declares 34; project targets higher | P-3 build-time | decision §8.2 |
| `[~]` | **Expo SDK 57 compatibility** | Compatibility PASS per decision | build-time confirm | decision §8.2 |
| `[~]` | **Config-plugin verification** | Auto-discovery confirmed | build-time | §32F/§27P |
| `[~]` | **Firebase Console configuration** | Google provider + Android app + SHA-1/SHA-256 registered; iOS open (P-6) | owner | §3b |
| `[✓]` | **Live Firebase E2E** | Google existing-account E2E verified (Android) | new-identity path blocked | §5 |

---

## 5. GOOGLE SIGN-IN

Tracked independently. **Approved as a roadmap item, not an authorised phase.**

| Status | Item | Detail |
| --- | --- | --- |
| `[✓]` | **Native Google Sign-In implementation** | `mobile/lib/firebase-native.ts` `nativeSignInWithGoogle` → `signInWithCredential`; package `@react-native-google-signin/google-signin@16.1.5` (P-2). **E2E verified for an existing account on Android (§5a).** |
| `[✓]` | **Google provider configuration (Console)** | Google provider enabled on the live project; Android satisfied (P-5, §3b). |
| `[✓]` | **Android configuration** | Android app `com.inventoryai.app` registered; SHA-1/SHA-256 fingerprints registered. |
| `[✓]` | **SHA fingerprints** | Registered for the Android app (§3b). |
| `[~]` | **iOS configuration** | No iOS build host (P-6). |
| `[✓]` | **Firebase Console provider config** | Google provider enabled; Android satisfied (P-5). |
| `[✓]` | **Native credential acquisition** | Google native sign-in returned a credential; exercised end-to-end (§5a). |
| `[✓]` | **Firebase sign-in** | `signInWithCredential` completed successfully (logcat, §5a). |
| `[✓]` | **Firebase → Inventory AI exchange** | `POST /api/auth/firebase/exchange` reached Firebase Admin and issued a session (§5a). |
| `[✓]` | **Inventory JWT/session creation** | Inventory AI session/JWT issued; authenticated area reached (§5a). |
| `[✓]` | **Logout** | Native teardown coded. |
| `[~]` | **Re-login** | Existing-account Google path exercised; specific device-time persistence cases remain (P-4). |
| `[✓]` | **Account conflict behaviour** | Server-side 409 `FIREBASE_IDENTITY_CONFLICT` / `EMAIL_IN_USE` (Phase 32H/32C). |
| `[✓]` | **Existing-email behaviour** | No automatic linking; refused. |
| `[✓]` | **Existing-`firebaseUid` behaviour** | UID-authoritative resolution. |
| `[✓]` | **Account linking behaviour** | Explicit authenticated `POST /api/auth/firebase/link`. |
| `[~]` | **E2E verification** | **Existing account: VERIFIED (Android, §5a).** New identity → `REGISTRATION_REQUIRED`: **UNVERIFIED / ENVIRONMENT-BLOCKED (§5b)** — not failed, not broken. |
| `[ ]` | **Production readiness** | Future. |

### 5a. Android existing-account Google E2E — `[✓]` VERIFIED (2026-09-26)

The full path was exercised end-to-end on a physical Android device (Oppo CPH1969, Android 11,
`arm64-v8a`) running app `com.inventoryai.app` (versionName `1.0.0`, versionCode `1`) from an EAS
`development`-profile build:

```
Continue with Google
  → Google native sign-in (credential acquired)
  → Firebase `signInWithCredential`  (success)
  → Firebase `getIdToken`            (success)
  → POST /api/auth/firebase/exchange
  → Firebase Admin ID-token verification
  → Inventory AI session / JWT issued
  → authenticated area reached
```

Evidence: device logcat recorded `Auth signInWithCredential` →
`signInWithCredential:onComplete:success` → `getIdToken` → `getIdToken:onComplete:success`; the app
then reached the authenticated dashboard and presented the "Sign out" control, confirming an
Inventory AI session was issued. The exchange reached Firebase Admin on the live deployment (§3b)
and returned a session — the same exchange that had previously answered `503 FIREBASE_NOT_CONFIGURED`
now succeeds end-to-end.

**No account was created, modified, linked, unlinked, deleted, or otherwise mutated during this
attempt.** No onboarding screen and no conflict banner appeared. The server remains UID-authoritative
and did not link by email.

### 5b. New Google identity → `REGISTRATION_REQUIRED` — `[~]` UNVERIFIED / ENVIRONMENT-BLOCKED

The new-identity path (a Google identity with **no** Inventory AI account → `403 REGISTRATION_REQUIRED`)
could **not** be exercised on the available device. Google Play Services / the Google Sign-In SDK
auto-selected the previously consented account: the account chooser (`SignInActivity`) rendered and
auto-dismissed in roughly 25 ms, so a different identity could not be chosen.

Remedies attempted and **rejected by the environment**: adding an additional Google account to the
device; deleting the app's stored Google Sign-In state
(`shared_prefs/com.google.android.gms.signin.xml`); revoking Inventory AI's Google third-party account
access. The owner then chose to **stop and document** — no accounts were removed, no emulator was
used, and no further device state was cleared.

**Classification: UNVERIFIED / ENVIRONMENT-BLOCKED — NOT failed and NOT broken.** This is a limitation
of the test device / Google Play Services consent cache, not an application or server defect. The
server's `REGISTRATION_REQUIRED` handling remains **code-verified** (§3a) but is not end-to-end
verified. It is **not** recorded as deferred work.

**Authorisation note:** design doc §21 — "No phase beyond 32F is authorised"; Google Sign-In is a
**later, unnumbered phase** requiring its own authorisation and the first EAS build.

---

## 6. OTHER IDENTITY PROVIDERS

### 6a. Facebook
| Status | Item | Detail |
| --- | --- | --- |
| `[ ]` | **Native implementation** | Not started; no provider SDK (design §14A.7). |
| `[ ]` | **Firebase configuration** | P-5 OPEN. |
| `[!]` | **Missing-email flow (O-5)** | Undecided — R-10 policy; needs explicit onboarding. |
| `[ ]` | **Account creation** | Future. |
| `[ ]` | **Existing-account conflict** | Policy fixed (no auto-link); flow future. |
| `[ ]` | **Linking** | Via the 32H boundary (future convergence). |
| `[ ]` | **Unlinking** | Future. |
| `[ ]` | **Security implications** | R-10 recorded. |

### 6b. Apple
| Status | Item | Detail |
| --- | --- | --- |
| `[ ]` | **Apple Sign-In** | **Future scope, not scheduled** (spec §48, design §14A.7). |

### 6c. Other providers
`[—]` No other providers are supported or planned by repository evidence. **Do not invent them.**

---

## 7. ACCOUNT LINKING (Phase 32H)

| Status | Item | Detail |
| --- | --- | --- |
| `[✓]` | **Authenticated linking** | `POST /api/auth/firebase/link`, `requireAuth` + controller, no permission. |
| `[✓]` | **Own-account requirement** | `req.user.id` is the account; the session is the ownership proof. |
| `[✓]` | **Firebase UID verification** | From `verifyFirebaseIdToken(idToken).uid`. |
| `[✓]` | **Existing Inventory account lookup** | By `firebaseUid`, never email. |
| `[✓]` | **Email NOT used as join key** | Structural — no email variable in the path. |
| `[✓]` | **Conflict behaviour** | ONE 409 `FIREBASE_IDENTITY_CONFLICT`, generic message. |
| `[✓]` | **Unknown UID behaviour** | CASE C — attached. |
| `[✓]` | **Existing Firebase UID behaviour** | CASE B (another user) / CASE D (self, different identity) — refused. |
| `[✓]` | **Same-user linking (CASE A)** | Idempotent 200, no write, no audit row. |
| `[✓]` | **Cross-user conflict** | Refused, audited, never merged/transferred. |
| `[✓]` | **Cross-business protection** | `businessId` never assigned. |
| `[✓]` | **Role/status preservation** | Read for audit only, never assigned. |
| `[✓]` | **businessId preservation** | Never written. |
| `[✓]` | **Session behaviour** | A refused link does **not** revoke sessions (deliberate). |
| `[✓]` | **Audit behaviour** | `FIREBASE_IDENTITY_LINKED` / `..._LINK_CONFLICT`; uid never in the row. |
| `[✓]` | **Client-side Firebase provider linking** | Performed by the Firebase client SDK; server has no equivalent API. |
| `[✓]` | **Server-side application authorisation** | The shipped boundary — the half the client must not own. |
| `[~]` | **O-1 residual provider-state issue** | Firebase's own provider set is client-side and unobservable server-side (recorded, not closed). |

---

## 8. ACCOUNT UNLINKING (Phase 32L-A / 32L-B, Policy B)

| Status | Item | Detail |
| --- | --- | --- |
| `[✓]` | **Authenticated unlink** | `POST /api/auth/firebase/unlink`. |
| `[✓]` | **Own-account enforcement** | `req.user.id`. |
| `[✓]` | **Firebase reauthentication** | Required for the operation. |
| `[✓]` | **Signed `auth_time`** | Read from the verified claim. |
| `[✓]` | **300-second freshness window** | `FIREBASE_REAUTH_WINDOW_SECONDS = 300`. |
| `[✓]` | **Fail-closed freshness validation** | `authTimeIsFresh` fails closed on null/non-finite. |
| `[✓]` | **New local password requirement (Policy B)** | Must be established in the same transition. |
| `[✓]` | **No zero-method account** | Structural consequence of Policy B. |
| `[✓]` | **Conditional `firebaseUid` removal** | Expected-identity conditional write + re-read (documented as such). |
| `[✓]` | **Conditional identity write** | Refuses on mismatch. |
| `[✓]` | **`emailVerified` behaviour** | Set `false` travelling with the uid. |
| `[✓]` | **Password hash replacement** | New bcrypt hash written. |
| `[✓]` | **`passwordChangedAt`** | Stamped (revokes earlier tokens). |
| `[✓]` | **Session revocation** | All sessions revoked. |
| `[✓]` | **Reset-token invalidation** | Live reset tokens invalidated. |
| `[✓]` | **Audit** | `FIREBASE_IDENTITY_UNLINKED` / `..._UNLINK_CONFLICT`; metadata records only that a password was established. |
| `[✓]` | **Concurrency protection** | **Expected-identity conditional write/re-read** — **not** a sparse-unique-index guarantee (per the documentation correction). |
| `[~]` | **Firebase-side unlink behaviour** | Client-SDK-only, server cannot observe (O-1 residual). |
| `[✓]` | **Client/server sequencing** | Documented (32L-B mobile). |
| `[~]` | **Failure recovery** | Server fail-closed; mobile path not runtime-verified. |
| `[ ]` | **O-6 orphan behaviour** | Remedy undecided (O-6). |

---

## 9. EMAIL VERIFICATION

| Status | Item | Detail |
| --- | --- | --- |
| `[✓]` | **Firebase email verification state** | `email_verified` read from the verified token. |
| `[✓]` | **Mongo `emailVerified` persistence** | Written on exchange/link/unlink (`models/user.model.ts`). |
| `[—]` | **Whether verification is currently enforced** | **NOT enforced.** No authorization decision reads `emailVerified` (verified: write-only sites). |
| `[—]` | **Authorization gates** | None. |
| `[—]` | **Login restrictions** | None. |
| `[—]` | **Sensitive-operation restrictions** | None. |
| `[✓]` | **Registration behaviour** | `emailVerified` persisted from claim. |
| `[✓]` | **Linking behaviour** | `emailVerified` moves with `firebaseUid` (CASE C). |
| `[✓]` | **Unlinking behaviour** | Reset to `false`. |
| `[ ]` | **Resend verification** | Not implemented. |
| `[ ]` | **Verification deep links** | Not implemented. |
| `[!]` | **Security implications** | Whether provider-asserted addresses are trusted is O-3. |
| `[!]` | **O-3 decision** | OPEN — whether `emailVerified` is enforced. |

> **Repository evidence (restated):** `emailVerified` is **persisted but currently not used as an
> authorization gate.** Providers relying on a provider-asserted address are blocked on O-3.

---

## 10. EMAIL ADDRESS CHANGE

| Status | Item | Detail |
| --- | --- | --- |
| `[ ]` | **Route** | Does not exist. |
| `[ ]` | **Service** | Does not exist. |
| `[ ]` | **Reauthentication requirement** | Not implemented. |
| `[ ]` | **Current-password / Firebase reauth** | Not implemented. |
| `[ ]` | **Verification of new email** | Not implemented. |
| `[ ]` | **Existing-email conflict** | Not implemented. |
| `[ ]` | **Identity/provider implications** | Undecided (Firebase owns the address for linked accounts). |
| `[ ]` | **Firebase email update** | Not implemented. |
| `[ ]` | **Mongo email update** | Not implemented. |
| `[ ]` | **Session invalidation** | Not implemented. |
| `[ ]` | **Security notification** | Not implemented (§20). |
| `[ ]` | **Audit event** | None defined. |
| `[ ]` | **Recovery implications** | Undecided. |

> **Email address change is NOT implemented and has NO approved phase.** Do not create one
> solely because the capability is missing.

---

## 11. PASSWORD MANAGEMENT

> **PASSWORD RESET IS IMPLEMENTED** (Phases 26B, 27, 28).

| Status | Item | Detail |
| --- | --- | --- |
| `[✓]` | **Password creation** | Register / reset / unlink establish a bcrypt hash. |
| `[✓]` | **Password hashing** | bcrypt cost 10; `select:false`. |
| `[✓]` | **Password login** | See §2. |
| `[✓]` | **Password change** | `POST /api/auth/change-password`; policy min 8. |
| `[!]` | **Firebase-linked password-change behaviour** | For linked accounts the retained hash is **inert**; `change-password`/reset write an inert hash and revoke sessions — **O-2 decided/implemented 32K; residual disposition O-8/O-9 recorded.** |
| `[✓]` | **`passwordChangedAt`** | Stamped; rejects earlier tokens. |
| `[✓]` | **Session invalidation** | Phase 15 mechanism. |
| `[✓]` | **Password policy** | Min 8 chars (`utils/validate.ts`, `passwordReset.service.ts`). |
| `[✓]` | **Password reset** | Full flow (26B/27/28). |
| `[✓]` | **Reset-token generation** | 32-byte `randomBytes`; raw token never persisted. |
| `[✓]` | **Reset-token hashing** | SHA-256 digest stored only. |
| `[✓]` | **Token expiry** | 30 minutes; `expiresAt` enforced in the claim query. |
| `[✓]` | **Single-use behaviour** | One conditional `findOneAndUpdate`; fail-closed `usedAt`. |
| `[✓]` | **Atomic token claiming** | Single conditional update — concurrent submits cannot both win. |
| `[✓]` | **Reset completion conditions** | ACTIVE user + ACTIVE business; unknown/expired/used/reused all answer one `INVALID_RESET_TOKEN`. |
| `[✓]` | **Reset session revocation** | All sessions revoked on completion. |
| `[✓]` | **Reset email** | Provider-agnostic mail layer (Resend transport). |
| `[✓]` | **Enumeration protection** | Uniform 202; failure swallowed post-lookup. |
| `[~]` | **Reset flooding (B2)** | Per-account/per-IP buckets only; distributed flooding open → §18. |
| `[ ]` | **Firebase-native password reset** | Not implemented. |
| `[!]` | **O-8** | Whether Firebase takes over the reset flow — OPEN. |
| `[!]` | **O-9** | `passwordChangedAt` semantics for Firebase-native accounts — OPEN. |
| `[✓]` | **Dummy-hash protection** | Phase 32K timing equalizer. |
| `[✓]` | **Sensitive-logging protection** | Reset URL/message never logged (§24). |

---

## 12. SESSION & JWT SECURITY

| Status | Item | Detail |
| --- | --- | --- |
| `[✓]` | **JWT claims** | Exactly `sub`, `jti`, `iat`, `exp`. |
| `[✓]` | **`sub`** | User id. |
| `[✓]` | **`jti`** | Mandatory; names the session row. |
| `[✓]` | **`iat`** | Used by `passwordChangedAt` comparison. |
| `[✓]` | **`exp`** | Mirrored by `expiresAt`. |
| `[✓]` | **Server-side session record** | `models/session.model.ts` (no role, no businessId). |
| `[✓]` | **Session uniqueness** | `jti` unique index. |
| `[✓]` | **Session expiry** | Mirrors token `exp`. |
| `[✓]` | **TTL** | `expireAfterSeconds: 0`; liveness query filters regardless. |
| `[✓]` | **Revocation** | `revokeSessionByJti` / `...ById` / `revokeAllSessions`. |
| `[✓]` | **Logout** | `POST /api/auth/logout` (server-side). |
| `[✓]` | **Sign-out-everywhere** | Logout with `{all:true}`. |
| `[✓]` | **Per-device sessions** | `GET /api/auth/sessions`, `DELETE /api/auth/sessions/:id`. |
| `[✓]` | **Device labels** | Cosmetic, normalized/capped; take no part in queries. |
| `[✓]` | **`lastUsedAt`** | Opportunistic update. |
| `[✓]` | **Revoked sessions** | Kept until TTL; cannot be silently re-created. |
| `[✓]` | **Password-change invalidation** | `SESSION_INVALIDATED` (distinct from `SESSION_REVOKED`). |
| `[✓]` | **Password-reset invalidation** | `passwordChangedAt` + `revokeAllSessions`. |
| `[✓]` | **Firebase unlink invalidation** | All sessions revoked. |
| `[✓]` | **Disabled-user behaviour** | ACTIVE check each request. |
| `[✓]` | **Business suspension/archive behaviour** | `assertActiveBusiness`. |
| `[✓]` | **Role reload** | Per request from Mongo. |
| `[✓]` | **Status reload** | Per request. |
| `[✓]` | **Tenant reload** | Per request. |
| `[✓]` | **Firebase `currentUser` vs Inventory JWT distinction** | Separate; no automatic exchange. |
| `[~]` | **Cold-start behaviour** | Durable native restore; device-time pending. |
| `[✓]` | **Automatic Firebase-exchange prevention** | A Firebase sign-in does not by itself create an Inventory session on a fresh launch. |
| `[~]` | **Stale Firebase session behaviour** | Reconciled (D-E1…D-E5); device-time pending. |
| `[✓]` | **Token/session logging protections** | No token or `jti` logged. |

---

## 13. REAUTHENTICATION / STEP-UP AUTHENTICATION

| Status | Item | Detail |
| --- | --- | --- |
| `[✓]` | **Firebase reauth** | Required for unlink. |
| `[✓]` | **Signed `auth_time`** | Read from verified claim. |
| `[✓]` | **300-second freshness window** | Frozen (Option D). |
| `[✓]` | **Fail-closed handling** | Cannot be chosen by a client. |
| `[✓]` | **Unlink protection** | The one implemented step-up point. |
| `[ ]` | **Future sensitive-operation step-up** | Not implemented beyond unlink. |
| `[ ]` | **Password-change step-up** | Not implemented. |
| `[ ]` | **Email-change step-up** | Not applicable yet (§10). |
| `[ ]` | **MFA step-up** | Future (§21). |
| `[ ]` | **Account-recovery step-up** | Not implemented. |

---

## 14. RBAC & PERMISSIONS

| Status | Item | Detail |
| --- | --- | --- |
| `[✓]` | **OWNER** | Holds all 21 permission keys. |
| `[✓]` | **ADMIN** | 19 keys (no `business.manage`, no `roles.manage`). |
| `[✓]` | **MANAGER** | 15 keys. |
| `[✓]` | **STAFF** | 9 keys (view + stock-in/out + history + AI). |
| `[✓]` | **Permission middleware** | `requirePermission` (`middlewares/authorize.ts`). |
| `[✓]` | **Permission enforcement** | 47 permission-gated routes (Phase 23 classifier). |
| `[✓]` | **Server authority** | `constants/roles.ts` is authoritative. |
| `[✓]` | **Client presentation** | `mobile/lib/permissions.js` mirror pinned to the server matrix. |
| `[✓]` | **Role changes** | `PATCH /api/users/:id` (14A rules). |
| `[✓]` | **Role-change restrictions** | No self-change, no OWNER assign, ADMIN↔ADMIN blocked. |
| `[✓]` | **OWNER immutability** | OWNER never created/assigned/modified via API. |
| `[✓]` | **Business access** | `businessId` scoping. |
| `[✓]` | **Permission reload** | Per request. |
| `[✓]` | **Disabled-user interaction** | Blocked at `requireAuth`. |
| `[✓]` | **Business status interaction** | `assertActiveBusiness`. |
| `[✓]` | **Cross-business access prevention** | 404 `NOT_FOUND` (not 403). |
| `[—]` | **`assertBusinessAccess` production-dead finding** | `utils/businessAccess.ts` has no `src/` importer; **left byte-identical** (Phase 24). `requireRole` is also production-inert (0 call sites, pinned). |

---

## 15. BUSINESS / TENANT SECURITY

| Status | Item | Detail |
| --- | --- | --- |
| `[✓]` | **`businessId` ownership** | On `User`; server-derived. |
| `[✓]` | **Server-derived `businessId`** | Never trusted from client. |
| `[✓]` | **Query scoping** | Every business-owned query. |
| `[✓]` | **Cross-tenant access prevention** | 404 on miss. |
| `[✓]` | **Business suspension** | Refused via `assertActiveBusiness`. |
| `[✓]` | **Business archive** | Refused. |
| `[~]` | **Session revocation on business lifecycle change** | No explicit bulk revoke on business status change; enforced per request instead. |
| `[✓]` | **Role/status reload** | Per request. |
| `[✓]` | **User/business relationships** | `businessId` on each user. |
| `[✓]` | **Subscription/billing ownership** | **Business/tenant**, never a Firebase identity (V4 direction recorded). |
| `[✓]` | **Firebase identity separation from tenant authority** | Structure. |
| `[✓]` | **Account linking across businesses** | Impossible — no `businessId` write. |
| `[✓]` | **Account unlinking across businesses** | Impossible — same. |

---

## 16. ACCOUNT LIFECYCLE

| Status | Item | Detail |
| --- | --- | --- |
| `[✓]` | **Active** | Default status. |
| `[✓]` | **Disabled** | Instant login/API revocation. |
| `[✓]` | **Firebase-linked** | `firebaseUid` set; password door refused. |
| `[✓]` | **Password-authenticated** | Legacy path. |
| `[✓]` | **Provider-linked** | Provider recorded on the Firebase identity. |
| `[✓]` | **Unlinked** | Policy B; new local password. |
| `[✓]` | **Password changed** | Stamps `passwordChangedAt`. |
| `[✓]` | **Password reset** | Full flow. |
| `[✓]` | **Sessions revoked** | On change/reset/unlink/logout. |
| `[ ]` | **Account recovery (broader)** | Beyond password reset — missing (§22). |
| `[ ]` | **Future deletion/deactivation rules** | Undefined; products are archive-only; user hard-delete not specified. |
| `[✓]` | **Audit implications** | Status/role/link/unlink/session events recorded (§17). |

---

## 17. AUDIT LOGGING

| Status | Item | Detail |
| --- | --- | --- |
| `[✓]` | **Security events** | `AUDIT_ACTIONS` catalogue (`constants/audit.ts`). |
| `[✓]` | **Authentication events** | Session create/logout/revoke/revoke-all. |
| `[✓]` | **Registration** | `USER_CREATED`. |
| `[✓]` | **Login** | `SESSION_CREATED`. |
| `[✓]` | **Logout** | `SESSION_LOGGED_OUT` / `SESSIONS_REVOKED_ALL`. |
| `[✓]` | **Password reset** | `PASSWORD_RESET_REQUESTED` / `_COMPLETED` (no metadata). |
| `[✓]` | **Password change** | `USER_UPDATED` path. |
| `[✓]` | **Linking** | `FIREBASE_IDENTITY_LINKED` / `_CONFLICT` (uid omitted). |
| `[✓]` | **Unlinking** | `FIREBASE_IDENTITY_UNLINKED` / `_CONFLICT`. |
| `[✓]` | **Role changes** | `USER_UPDATED`. |
| `[✓]` | **User status changes** | `USER_UPDATED`. |
| `[~]` | **Business lifecycle changes** | No dedicated business-status audit action observed. |
| `[✓]` | **Inventory/security-sensitive operations** | Product/inventory/PO/supplier events. |
| `[✓]` | **Sensitive-field redaction** | No `jti`, uid, token, or reset URL in rows. |
| `[~]` | **Append-only-by-convention** | No update/delete route on the trail; convention, not enforced storage. |
| `[~]` | **Tamper resistance** | Convention only; no WORM/immutability guarantee. |
| `[ ]` | **IP address** | Not recorded in audit rows. |
| `[ ]` | **User-Agent** | Not recorded. |
| `[ ]` | **Failed authentication events** | Not audited (only rate-limited). |
| `[ ]` | **Security notifications** | §20. |
| `[~]` | **Reconciliation/reversal records** | Inventory compensation exists (07A/19); account-security reversals not modelled. |

---

## 18. RATE LIMITING & ABUSE PROTECTION

| Status | Item | Detail |
| --- | --- | --- |
| `[✓]` | **Login limiter** | Account + IP (`skipSuccessfulRequests` on the two 07B login limiters). |
| `[✓]` | **Registration limiter** | `createRegisterLimiter`. |
| `[✓]` | **Password reset limiter** | Request account + request IP + confirm (deliberately **no** `skipSuccessfulRequests`). |
| `[✓]` | **Firebase exchange limiter** | `createFirebaseExchangeLimiter` + `createFirebaseRegisterLimiter`. |
| `[✓]` | **AI limiter** | `AI_RATE_LIMITED`. |
| `[~]` | **In-memory limitation** | Limiter stores are in-process. |
| `[~]` | **Per-process limitation** | Not shared across instances. |
| `[⏸]` | **Distributed/shared-store future** | Deferred to V4 (E3). |
| `[⏸]` | **Reset-mail flooding (B2)** | Per-account bucket keys on `ip|email`; rotating attacker evades per-IP. Deferred to V4. |
| `[✓]` | **Enumeration resistance** | Uniform 202; timing term partially mitigated (Phase 28 B1). |
| `[~]` | **Account-takeover attempts** | Covered indirectly (rate limiting, generic errors); no dedicated detection. |
| `[ ]` | **Suspicious behaviour detection** | Not implemented. |
| `[⏸]` | **B1 residual** | Database-work timing term ACCEPTED FOR V1 / DEFERRED; PARTIALLY MITIGATED, NOT CLOSED. |
| `[⏸]` | **V4 decision** | B2 + E3 deferred together as shared-infrastructure work. |

---

## 19. ACCOUNT TAKEOVER PROTECTION

Connects existing controls to future controls **without** claiming missing features exist.

| Status | Control | Detail |
| --- | --- | --- |
| `[✓]` | **Password security** | bcrypt; min length; timing-equalized verify. |
| `[✓]` | **Reset-token security** | Hashed, 30-min TTL, single-use, atomic claim, one-live-per-user. |
| `[✓]` | **Session revocation** | Immediate, server-side. |
| `[✓]` | **Sign-out-everywhere** | Implemented. |
| `[✓]` | **Firebase identity authority** | UID-authoritative; no email join. |
| `[✓]` | **Reauthentication** | 300 s freshness for unlink. |
| `[!]` | **Email verification** | Not enforced (O-3) — a real gap for provider-asserted addresses. |
| `[ ]` | **Email change protection** | Capability absent (§10). |
| `[ ]` | **MFA** | Future (§21). |
| `[ ]` | **Security notifications** | Future (§20). |
| `[ ]` | **Failed-login detection** | Only rate limiting. |
| `[ ]` | **Suspicious-login detection** | Not implemented. |
| `[✓]` | **Provider linking protection** | Own-account, conflict-refused, no email auto-link. |
| `[✓]` | **Provider unlink protection** | Policy B + freshness + sessions revoked. |
| `[ ]` | **Break-glass recovery** | Not implemented (§22). |
| `[~]` | **Firebase revocation** | `checkRevoked:false`; no disable sync (§23). |
| `[~]` | **Account containment** | Disable-user revokes access immediately; no compromise playbook. |

---

## 20. SECURITY NOTIFICATIONS

**Status: `[ ]` FUTURE — not implemented.** No repository evidence of any notification feature.

| Status | Item |
| --- | --- |
| `[ ]` | New login |
| `[ ]` | New device/session |
| `[ ]` | Password change |
| `[ ]` | Password reset |
| `[ ]` | Email change |
| `[ ]` | Provider linking |
| `[ ]` | Provider unlinking |
| `[ ]` | MFA changes |
| `[ ]` | Account recovery |
| `[ ]` | Suspicious activity |

---

## 21. MFA / 2FA

**Status: `[ ]` FUTURE SCOPE — not implemented.** No `mfa`/`totp`/`two-factor` occurrences exist in
`server/src`, `mobile/lib`, or `mobile/app`. **Do not implement or invent an MFA phase.**

| Status | Item |
| --- | --- |
| `[ ]` | Enrollment |
| `[ ]` | TOTP |
| `[ ]` | Recovery codes |
| `[ ]` | Challenge |
| `[ ]` | Verification |
| `[ ]` | Step-up |
| `[ ]` | Backup/recovery |
| `[ ]` | Enforcement |
| `[ ]` | Admin policy |
| `[ ]` | Lost-device recovery |
| `[ ]` | Security notifications |

---

## 22. RECOVERY / BREAK-GLASS

| Status | Item | Detail |
| --- | --- | --- |
| `[✓]` | **Password reset** | Implemented (26B/27/28) — see §11. |
| `[~]` | **Firebase recovery** | Outside this server (client-SDK/Firebase). |
| `[ ]` | **Account recovery (broader)** | Not implemented beyond password reset. |
| `[ !]`| **Orphaned Firebase account** | An email-matching Firebase identity can exist unlinked and is permanently unhealable — **O-6 remedy undecided**. |
| `[ ]` | **Break-glass OWNER recovery** | Not implemented. |
| `[ ]` | **Compromised OWNER containment** | No defined flow. |
| `[~]` | **Recovery audit** | Reset events audited; broader recovery not. |
| `[ ]` | **Recovery notifications** | None (§20). |
| `[ ]` | **Support/admin recovery** | Not implemented. |
| `[!]` | **O-6** | Unhealable-orphan remedy — OPEN. |
| `[!]` | **O-8** | Firebase taking over reset — OPEN. |
| `[!]` | **O-9** | `passwordChangedAt` semantics for Firebase-native — OPEN. |

**Distinction preserved:** existing password-reset functionality is real; broader recovery controls
are missing.

---

## 23. FIREBASE REVOCATION / ACCOUNT DISABLE SYNC

| Status | Item | Detail |
| --- | --- | --- |
| `[✓]` | **Mongo disabled state** | `User.status` ACTIVE/DISABLED. |
| `[ ]` | **Firebase state** | No propagation from Mongo to Firebase. |
| `[ ]` | **Firebase token revocation** | Not implemented. |
| `[~]` | **`checkRevoked` behaviour** | `false` (documented). |
| `[ ]` | **Provider disable** | Not implemented. |
| `[ ]` | **Compromised Firebase account** | No containment flow. |
| `[✓]` | **Server exchange refusal** | DISABLED user / inactive business refused at exchange. |
| `[✓]` | **Session revocation** | Mongo-side disable revokes access immediately. |
| `[ ]` | **Future synchronisation** | Not implemented. |

> **Do not claim Firebase revocation synchronisation exists.** It does not.

---

## 24. SECURITY-SENSITIVE LOGGING

| Status | Item | Detail |
| --- | --- | --- |
| `[✓]` | **Password/hash protection** | `passwordHash` `select:false`; never logged. |
| `[✓]` | **Firebase token protection** | Never logged. |
| `[✓]` | **JWT protection** | Never logged. |
| `[✓]` | **Session/`jti` protection** | Never written to audit; never logged. |
| `[✓]` | **Reset-token protection** | Raw token never persisted; URL never logged; provider message discarded. |
| `[✓]` | **Secrets protection** | Env-only; `.env.example` names only; no secrets committed. |
| `[✓]` | **Native auth error protection** | Generic client messages; provider free-text discarded. |
| `[✓]` | **Provider credential protection** | Not exposed to mobile; server-only. |
| `[✓]` | **Audit redaction** | Whitelisted DTO; uid/`jti` omitted. |
| `[✓]` | **No application-side sensitive logging** | No `console.*`, `Log.d`, or `setLogLevel` calls exist in `mobile/lib`, `mobile/app`, or `mobile/components`. |
| `[!]` | **Firebase Auth SDK PII logging (dependency-level)** | `@react-native-firebase/auth` **v26.4.0** logs the Firebase user object via `Log.d` in `NativeRNFBTurboAuth.java`. **Not build-gated → reachable in release builds.** Lands only in device logcat (never sent by the app); exposes account-identity PII (uid/email/displayName/provider metadata) but **no authentication credentials** (no token, password, or hash). No supported config toggle exists. **No remediation implemented** — see §28. |

---

## 25. EXTERNAL VERIFICATION GATES

| Gate | Requirement | Status | Evidence | Blocker | Owner action | Local? |
| --- | --- | --- | --- | --- | --- | --- |
| **P-1** | `google-services.json` / `GoogleService-Info.plist` storage | `[✓]` FROZEN | decision §8.1 — EAS build-time injection, not committed | — | — | Repo-side |
| **P-2** | Google Sign-In library | `[✓]` FROZEN | `@react-native-google-signin/google-signin@16.1.5` | build/runtime verify | confirm at build | partly |
| **P-3** | RNFirebase compileSdk/targetSdk alignment | `[⛔]` | RNFirebase declares 34; project targets higher | build-time | build | no |
| **P-4** | `setPersistence` reachability / Keychain survival on reinstall | `[⛔]` | decision §8.2 | device-time | device | no |
| **P-5** | Firebase Console state (providers, apps, fingerprints) | `[~]` Android satisfied | Google provider enabled, Android app `com.inventoryai.app` registered, SHA-1/SHA-256 registered; **iOS app registration open** (P-6) | — | register iOS app | partly |
| **P-6** | iOS build capability | `[⛔]` OPEN | no iOS build on host | environment | owner | no |
| **Gate 1** | Firebase `auth:import` bcrypt support | `[⛔]` UNVERIFIED | design §18 | live project | verify | no |
| **Gate 2** | RNFirebase + Expo SDK 57 config-plugin config | `[~]` | auto-discovery confirmed; compat PASS | build-time | build | partly |
| **Live Firebase project** | Required for E2E | `[✓]` provisioned | project `inventoryai-d0d20`; Google provider enabled | — | — | no |
| **Server-side Firebase Admin config** | Deployment holds a service account | `[✓]` configured & live | `FIREBASE_SERVICE_ACCOUNT_JSON` set on the `ai-inventory` Render service; live deploy; invalid-token probe moved `503 FIREBASE_NOT_CONFIGURED` → `401 FIREBASE_TOKEN_INVALID` | — | — | no |
| **Firebase Console** | Provider/app setup | `[~]` | Android satisfied; iOS open | P-6 | register iOS app | partly |
| **Android fingerprints** | SHA-1/SHA-256 | `[✓]` registered | used by the verified E2E (§5a) | — | — | yes |
| **iOS configuration** | App registration | `[⛔]` | P-6 | — | owner | no |
| **EAS build** | Development build | `[✓]` for Android | `f3038fa1…` FINISHED; development build used by §5a | — | — | yes |
| **Android runtime** | Emulator verification | `[✓]` | `emulator-5554`, 0 fatals; physical-device run in §5a | — | — | yes |
| **Google E2E (existing account)** | Google → exchange → session | `[✓]` VERIFIED | Android, §5a | — | — | yes |
| **Google E2E (new identity)** | New identity → `REGISTRATION_REQUIRED` | `[~]` ENVIRONMENT-BLOCKED | device / Google Play Services reused-consent cache, §5b | device/emulator | owner | no |
| **iOS runtime** | iOS verification | `[⛔]` | — | P-6 | owner | no |
| **Keychain/reinstall** | Persistence across reinstall | `[⛔]` | P-4 | device | owner | no |

---

## 26. PRODUCTION SECURITY READINESS

| Status | Item | Detail |
| --- | --- | --- |
| `[~]` | **Firebase production configuration** | **Server-side service account configured and live** (§25); Console Android satisfied; iOS app registration open (P-6). |
| `[✓]` | **Secret management** | Env-only; `.env` never committed; production fail-fast. |
| `[~]` | **EAS configuration** | Profiles defined; production profile unexercised. |
| `[✓]` | **Session security** | `jti` sessions; revocation; expiry. |
| `[~]` | **Reset email delivery** | Implemented; transport requires a configured provider. |
| `[~]` | **Rate limiting** | Implemented; in-memory/per-process (E3). |
| `[✓]` | **Auditability** | Audit trail + viewer. |
| `[ ]` | **Monitoring** | No repository-specified monitoring integration. |
| `[~]` | **Backups/recovery** | Spec §53 defines expectations; no app-level backup tooling. |
| `[ ]` | **Restore testing** | Not performed/defined. |
| `[ ]` | **Security incident response** | No runbook. |
| `[~]` | **Firebase revocation** | Not synchronised (§23). |
| `[ ]` | **Account recovery** | Beyond password reset (§22). |
| `[ ]` | **MFA** | Future (§21). |
| `[ ]` | **Notifications** | Future (§20). |
| `[~]` | **External verification** | §25 — live project + server-side Admin config done; iOS and new-identity path open. |
| `[⛔]` | **iOS verification** | P-6. |
| `[~]` | **Android verification** | F2 surface verified; **Google existing-account E2E verified (§5a)**; new-identity path env-blocked (§5b). |
| `[!]` | **Dependency-level PII logging** | `@react-native-firebase/auth` v26.4.0 logs the Firebase user object via `Log.d`; release-reachable; no credentials; **remediation pending** (§24, §28). |

---

## 27. OWNER DECISIONS REGISTER

| # | Decision | State | Evidence | Dependency / impact | Next owner action |
| --- | --- | --- | --- | --- | --- |
| **O-1** | Unlink policy + last-authentication-method protection | **Policy B RESOLVED**; residual (Firebase's own provider set) recorded, **NOT closed** | design §14A.5; §27Q | Affects any unlink/provider work | Accept residual or scope a follow-up |
| **O-2** | Linked-account disposition of `change-password` / reset | **CLOSED / decided in Phase 32K** | README 32K entry | Inert-hash behaviour recorded | No further action (residual O-8/O-9) |
| **O-3** | Whether `emailVerified` is enforced | **OPEN** | design §14A.5; spec §29 | Blocks provider sign-in relying on a provider-asserted address | Decide enforcement policy |
| **O-4** | M1 vs M2 | **RESOLVED** — M1 (RNFirebase) + P2 durable persistence | P2 decision §8.1 | Forfeits Expo Go (O-11) | None |
| **O-5** | Facebook missing-email onboarding flow | **OPEN** | design §14A.5; R-10 | Blocks Facebook Login | Decide flow |
| **O-6** | Remedy for the unhealable orphan | **OPEN** | design §14A.5; §16.6 | Blocks legacy migration/linking | Decide remedy / accept |
| **O-7** | `google-services.json` / plist storage | **RESOLVED** — EAS build-time injection, not committed | P2 decision §8.1 | Native provider config | None |
| **O-8** | Whether Firebase takes over the password-reset flow | **OPEN** | design §14A.5; §14.1 | Password recovery disposition | Decide |
| **O-9** | `passwordChangedAt` semantics for Firebase-native accounts | **OPEN** | design §14A.5; §14.7 | `SESSION_INVALIDATED` does not fire for them | Decide acceptance or compensating design |
| **O-10** | Invitation implementation | **OPEN** | design §14A.5; §14.3 | Invitation onboarding | Decide model/lifetime/routes |
| **O-11** | Expo Go policy | **OPEN (forfeited by M1)** | design §14A.5; P2 decision | Every future mobile phase | Formalise acceptance |

> Resolved decisions are **not** reopened without new repository evidence.

---

## 28. DEFERRED WORK REGISTER

| Item | Status | Reason / decision |
| --- | --- | --- |
| **B1 residual (reset timing term)** | `[⏸]` | ACCEPTED FOR V1 / DEFERRED; PARTIALLY MITIGATED, NOT CLOSED (Phase 28/29). |
| **B2 (distributed reset-mail flooding)** | `[⏸]` | DEFERRED TO V4; still open (Phase 29 §27E). |
| **E3 (in-memory per-process limiter stores)** | `[⏸]` | DEFERRED TO V4; shares B2's root cause/remedy. |
| **MFA** | `[⏸]` | Future scope; not scheduled. |
| **V4 SaaS / billing / subscriptions** | `[⏸]` | V4 roadmap. |
| **No shared store introduced** | `[—]` | By decision; in-memory limiters ship in V1. |

> **Do not promote deferred work into the current sprint.**

### Security findings (NOT deferred)

Open findings, distinct from deferred work — neither scheduled nor closed.

| Finding | Status | Detail |
| --- | --- | --- |
| **Firebase Auth SDK PII logging** | `[!]` **SECURITY FINDING / REMEDIATION PENDING** | `@react-native-firebase/auth` **v26.4.0** logs the Firebase user object via `Log.d` in `NativeRNFBTurboAuth.java`; not build-gated, so it is **reachable in release builds**, and it lands only in device logcat. It exposes account-identity PII but **no credentials/tokens**. Recommended (NOT implemented): a `patch-package` patch removing that single `Log.d` line (preserving `Log.e` diagnostics), with the broader option of R8/ProGuard `Log.d` stripping; an upstream report is recommended. See §24. |
| **New-identity `REGISTRATION_REQUIRED` verification** | `[~]` **UNVERIFIED / ENVIRONMENT-BLOCKED** | Not a finding and **not deferred** — the device / Google Play Services consent cache prevents exercising the new-identity path (§5b). |
| **Render CLI credential exposure** | `[✓]` **RESOLVED** | The exposed development-tooling credential was invalidated (old credential now answers `401`) and a fresh credential issued (new credential answers `200`); **no key value is recorded or reproduced anywhere**. |

---

## 29. COMPLETED PHASE / IMPLEMENTATION HISTORY

Chronological. **History is not rewritten.**

| Phase | Purpose | Impl. | Verification | Commits |
| --- | --- | --- | --- | --- |
| **03** | Authentication + authorization foundation | `[✓]` | test suites | — |
| **14A** | User management foundation (OWNER/ADMIN) | `[✓]` | DB-backed | — |
| **15** | Password change + `passwordChangedAt` invalidation | `[✓]` | tests | — |
| **16** | Audit trail viewer | `[✓]` | DB-backed | — |
| **24** | Runtime authorization matrix + tenant isolation | `[✓]` | DB-backed | — |
| **26A** | Session hardening + real logout | `[✓]` | tests | — |
| **26B** | Password recovery (mail layer + token store + routes) | `[✓]` | 36/36 + 39 | `5a46781`, `9900e9a` |
| **27** | Mobile password recovery | `[~]` | Expo-Go runtime; custom-scheme config-only; iOS export-only | — |
| **28 B1** | Detach outbound reset email from request path | `[~]` | behavior + source guard; **PARTIAL/NOT CLOSED** | `7185e5e` |
| **29** | Security-risk decision record + docs reconciliation | `[✓]` | docs-only | — |
| **30A** | EAS development build foundation | `[✓]` | static only | Phase 30A |
| **32A** | Firebase design document | `[✓]` | docs-only | `a6e3bd2` |
| **32B** | Firebase Admin SDK foundation | `[✓]` | test suite | `982284a` |
| **32C** | Firebase session exchange | `[✓]` | tests | `d4d9f19` |
| **32D** | Firebase JS SDK boundary (mobile) | `[✓]` | tests | `ad26d60` |
| **32E** | Firebase email/password auth flow | `[~]` | targeted runs; no live project | `0a31cb3` |
| **32F** | Multi-provider decision record | `[✓]` | docs-only | `5d7d1df` |
| **32G** | EAS dev build / native runtime validation | `[~]` | Android emulator; iOS none | `3f4d32f` |
| **32H** | Server-side linking boundary | `[✓]` | 25/25 | `d8b693a` |
| **32J** | Mobile registration onboarding | `[~]` | targeted | `0c3f87d` |
| **32K** | Firebase password authority boundary | `[✓]` | 12-case suite | `8af1d49` |
| **32L-A** | Server unlink (Policy B) | `[✓]` | code + tests | `01ae73f` |
| **32L-B** | Mobile unlink | `[~]` | not runtime-verified | `0c3f87d` |
| **RNFirebase foundation** | Native packages + plugins | `[✓]` | — | `c5d07f5` |
| **B** | Native Firebase auth migration | `[✓]` | Android runtime | `0c3f87d` |
| **C** | Native Google Sign-In | `[~]` | not E2E-verified | `ea52c2c` |
| **D** | Native confirmation flows | `[✓]` | Android runtime | `63826f4` |
| **E** | Native session teardown + reconciliation | `[✓]` | Android runtime | `f15995e` |
| **F1** | Retire Firebase JS SDK / browser OAuth | `[✓]` | lockfile + dex | `2ec35b8` |
| **F2** | Retire browser deps/plugin/second scheme | `[✓]` | config + dex | `533c76f` |
| **F2.9** | EAS build + Android runtime verification | `[✓]` | EAS `f3038fa1…`, emulator | (no commit) |
| **32L close-out** | Docs close-out | `[✓]` | docs-only | `48c7f11`, `46254c6` |
| **Auth E2E verification (unnumbered)** | Android Google existing-account E2E + Render Firebase Admin config + CLI credential rotation + Firebase PII investigation | `[✓]` | Android E2E verified; docs-only | — |

---

## 30. CURRENT WORK TRACKER

**NO AUTHORISED IMPLEMENTATION PHASE CURRENTLY ACTIVE.**

| Field | Value |
| --- | --- |
| Current authorised phase | **None.** Design doc §21: "No phase beyond 32F is authorised." |
| Current task | None in progress; repo is in a documentation/cleanup tail (latest: auth E2E verification documented). |
| Files/work area | — |
| Dependencies | — |
| Blockers | iOS build host (P-6); new-identity path ENVIRONMENT-BLOCKED (§5b); P-3/P-4 and Gates 1/2; owner decisions (§27). |
| Acceptance criteria | — |
| Verification state | Android Google existing-account E2E VERIFIED (§5a); Render Firebase Admin config verified live; dependency-level PII finding open (§24/§28). |
| Git/branch state | branch `main` @ `48969e0`; PRs **#1–#6 merged** (#4 `924f8bc`, #5 `14de2af`, #6 `e97497b`); **0 open PRs**; local `main` is **1 commit ahead** of `origin/main` (`e97497b`) — the Phase 1 reconciliation commit `48969e0` is not yet pushed. |

---

## 31. NEXT-WORK GATE

Before Freebuff starts coding any authentication/security work, **all** must be true:

| # | Gate | Current |
| --- | --- | --- |
| G-1 | An authorised phase exists? | **No** |
| G-2 | Is it numbered? | **No** |
| G-3 | Is scope documented? | **No** |
| G-4 | Are prerequisites satisfied? | **No** (external gates open) |
| G-5 | Required owner decisions resolved? | **No** (O-3, O-5, O-6, O-8, O-9, O-10, O-11 open) |
| G-6 | External blockers resolved? | **No** (§25) |
| G-7 | Git working tree understood? | **Yes** |
| G-8 | Protected files preserved? | **Yes** — no protected file was modified. Only **1** entry is still uncommitted (`mobile/eas.json`); the other four are committed and equal to `HEAD`. The two older SHA-256 mismatches (`http.ts`, `phase06-ai-wire.test.mjs`) were **CRLF-normalisation differences, not content changes** (§32). |
| G-9 | Acceptance criteria defined? | **No** |
| G-10 | Owner explicitly approved implementation? | **No** |

> **If any required gate is false, Freebuff must STOP and report what is missing.** Currently G-1,
> G-2, G-3, G-4, G-5, G-6, G-9, G-10 are false.

---

## 32. GIT / CHANGE SAFETY

### Before meaningful work
- Inspect branch.
- Inspect HEAD.
- Inspect `git status --porcelain`.
- Identify protected uncommitted files.
- Verify protected hashes where applicable (`docs/freebuff/BASELINE.md` §3).

### After meaningful work
- Inspect changed files.
- Verify protected files remain unchanged.
- Run required tests/checks.
- Commit only approved work.
- Use a factual commit message (no AI attribution — canonical Jeffern identity).
- Push only when authorised/appropriate.
- Verify remote backup when applicable.

### Never (without explicit owner approval)
`reset` · `restore` · `clean` · `stash` · `force-push` · history rewrite · `rebase` · `merge` ·
delete protected files · modify protected uncommitted work.

### Protected working-tree entries — current set (2026-09-28)

Only **one** entry is still uncommitted. Git blob hashes are used for the current baseline because
they are immune to LF/CRLF normalisation (see the historical register below).

```
c1ab09c8998221fa077dcdf053a17e65f398cffd  mobile/eas.json                        (modified, unstaged)

# committed and identical to HEAD — no longer uncommitted entries:
86688b7b8468e57b9abeaf3986f23b17bb23b57a  server/src/services/ai/providers/http.ts
07601c7ab31009263d0045f20a9b940539184094  server/test/phase06-ai-wire.test.mjs
12627bae19ec693bd8d609ac00bd57b602139dce  docs/superpowers/plans/2026-09-11-phase-18c-core-list-screens.md
347bcc1365939bed92879f00d781f63f71cf670e  docs/superpowers/plans/2026-09-11-phase-18e-secondary-screens.md
```

### Historical register — SHA-256 as recorded 2026-09-26 (superseded; retained, not erased)

```
10c5ff2e…530  mobile/eas.json                                     still matches
23e91610…213  server/src/services/ai/providers/http.ts            SUPERSEDED — CRLF normalisation, content unchanged
83767f8b…768  server/test/phase06-ai-wire.test.mjs               SUPERSEDED — CRLF normalisation, content unchanged
52d3afef…891  docs/superpowers/plans/…-18c-core-list-screens.md   SUPERSEDED — committed by the Phase 1 reconciliation commit `48969e0`
d000a5d3…297  docs/superpowers/plans/…-18e-secondary-screens.md   SUPERSEDED — committed by the Phase 1 reconciliation commit `48969e0`
```

The Phase 1 reconciliation commit is **`48969e0`** ("docs: reconcile the historical Phase 18C and 18E
implementation plans"). It committed both plans with blob hashes `12627bae…` (18C) and `347bcc13…`
(18E), so they are no longer protected *uncommitted* entries. The two CRLF mismatches were **not**
content changes: those files' git-normalised blobs already equalled `HEAD` exactly.

---

## 33. MASTER DIRECTION SUMMARY

### Completed
Email/password register + login; Firebase Admin verify boundary; Firebase exchange + register;
sessions/JWT with `jti` (revocation, logout, sign-out-everywhere, per-device list); password change;
**password reset (26B/27/28)**; account linking (32H) and server unlink under Policy B (32L-A);
password-authority guard (32K); RBAC (4 roles / 21 keys) and tenant isolation; rate limiting; audit
trail + viewer; sensitive-logging protections; native RNFirebase migration B–E; JS-SDK/browser OAuth
retirement F1/F2; Android runtime verification F2.9; **Android Google existing-account E2E verification (§5a)**.

### Current
**NO AUTHORISED IMPLEMENTATION PHASE CURRENTLY ACTIVE.** The repository is in a
documentation/cleanup tail. Git state: branch `main` @ `48969e0`; PRs **#1–#6 merged**; **0 open
PRs**; local `main` is **1 commit ahead** of `origin/main` (`e97497b`) — the Phase 1 reconciliation
commit `48969e0` is not yet pushed.

### Blocked
iOS provider build/runtime (no iOS build host, P-6); the **new-identity → `REGISTRATION_REQUIRED`**
path is **ENVIRONMENT-BLOCKED** on the available device (§5b); plus P-3/P-4 build/device gates and
Gates 1/2. (The live Firebase project and the Android existing-account Google E2E are no longer
blocked — §5a/§25.)

### Decision Required
**O-3** (emailVerified enforcement), **O-5** (Facebook missing-email), **O-6** (orphan remedy),
**O-8** (Firebase reset), **O-9** (`passwordChangedAt` for Firebase-native), **O-10** (invitations),
**O-11** (Expo Go policy).

### Future
Invitations; provider linking on the shipped boundaries; **Google Sign-In** and **Facebook Login**
(approved-in-principle roadmap items, each needing its own authorised phase); Apple Sign-In
(future scope); email verification enforcement; email address change; security notifications; MFA;
break-glass recovery; Firebase disable/revocation sync; suspicious-login detection.

### Deferred
B1 residual (accepted for V1); **B2** and **E3** (V4 shared-infrastructure); V4 SaaS/billing;
MFA future scope.

### Recent Verification Findings (2026-09-26)
* **Android existing-account Google E2E — `[✓]` VERIFIED.** Google native sign-in → Firebase auth →
  `/api/auth/firebase/exchange` → Firebase Admin verify → Inventory AI session/JWT → authenticated
  area (§5a).
* **Render Firebase Admin config — `[✓]` VERIFIED live.** `FIREBASE_SERVICE_ACCOUNT_JSON` configured;
  the invalid-token probe moved `503 FIREBASE_NOT_CONFIGURED` → `401 FIREBASE_TOKEN_INVALID` (§25).
* **New-identity `REGISTRATION_REQUIRED` — `[~]` UNVERIFIED / ENVIRONMENT-BLOCKED** (§5b); not failed,
  not broken, not deferred.
* **Render CLI credential exposure — `[✓]` RESOLVED**; old credential `401`, new credential `200`; no
  value recorded (§28).
* **Firebase Auth SDK PII logging — `[!]` SECURITY FINDING / REMEDIATION PENDING** (dependency-level,
  `@react-native-firebase/auth` v26.4.0; release-reachable; no credentials; not implemented) (§24, §28).
* **No account was created, modified, linked, unlinked, deleted, or otherwise mutated** during the
  Google E2E attempts.

### External Verification
iOS build + runtime (P-6); Firebase Console iOS app registration (P-5 remainder); the new-identity path
(§5b, environment-blocked); Keychain/reinstall (P-4); compileSdk alignment (P-3); Gate 1
(`auth:import` bcrypt); Gate 2 (config-plugin) at build time. **Done:** live Firebase project, Android
app + fingerprints, server-side Firebase Admin config, and Android Google existing-account E2E (§5a).

### Non-Negotiable Architecture
Firebase = identity provider; **MongoDB/Inventory AI = application authority**; Inventory JWT/session
= API bearer; backend derives `userId`/`businessId`/`role`/`status`; client cannot choose any of
them; tenant isolation is server-side; **email is never an automatic linking key**; `firebaseUid` is
authoritative and unique (sparse); Firebase-linked users have no second password door; sessions are
revocable via `jti`; `passwordChangedAt` invalidates older tokens; unlink requires a fresh Firebase
auth and a new local password; no cross-business movement; no credential/token/hash logging; disabled
users and suspended businesses cannot authenticate or use protected APIs.

### Current Project Position
Inventory AI has a **complete, backend-authoritative authentication architecture**: Firebase is the
identity provider, MongoDB remains the source of truth for accounts, roles, tenancy and sessions, and
the Inventory AI JWT/session is the API bearer. The Firebase/RNFirebase migration is **code-complete
and Android-runtime verified**, and the server-side linking/unlinking boundaries, password recovery
and session hardening have all shipped. What remains is **not new architecture but validation and
decision**: the project is gated on an iOS build environment, the environment-blocked new-identity
path (§5b), and a set of open owner decisions — the live Firebase project now exists, the server-side
Admin config is verified live, and the Android existing-account provider path is E2E-verified (§5a) —
with the most concrete approved-in-principle
implementation item being native **Google Sign-In** — which may not begin until the owner authorises
a numbered phase and the external prerequisites are met. **There is no authorised implementation
phase active now.**

---

## 34. SOURCES

- Current source: `server/src/**` (routes, controllers, services, models, middlewares, constants), `mobile/**`.
- Current tests: `server/test/*` (incl. `phase32h-firebase-linking`, `phase32c-firebase-exchange`, `phase23/24` guards).
- `docs/SYSTEM_SPECIFICATION.md` (§7, §13–§19, §29, §48, §53).
- `docs/DEVELOPMENT_ROADMAP.md` (§27B, §27E, §27G–§27Q, §28–§36).
- `docs/DESIGN_SYSTEM.md`, `docs/TS-MIGRATION-MANIFEST.md`.
- `docs/superpowers/specs/2026-09-18-firebase-auth-design.md` (§14, §14A, §14B).
- `docs/superpowers/specs/2026-09-24-rnfirebase-p2-persistence-decision.md`.
- `docs/superpowers/plans/*`.
- `docs/freebuff/{BASELINE,DECISIONS,HANDOFF,MASTER_LOG,README,TEST_BASELINE}.md`, `tasks/FB-001…FB-012`.
- `CLAUDE.md`, `README.md`.
- Git state at `48969e0` (branch `main`; `origin/main` at `e97497b`) — see §36.

---

## 35. CONFLICTS / DISCREPANCIES FOUND

Recorded rather than silently resolved.

1. **Design doc §14A.7 vs shipped work.** §14A.7 still reads "Account linking: NOT implemented.
   Account unlinking: NOT implemented", with a supersession note for linking only. Unlinking shipped
   in Phase 32L and is recorded in §27Q / spec §29, but §14A.7 carries **no supersession note for
   unlink**.
2. **Design doc §21 "No phase beyond 32F is authorised"** is stale in effect — 32G, 32H, 32J, 32K,
   32L and F1/F2/F2.9 shipped after it. It is a plan, not a schedule, and is marked reconciled.
3. **CLAUDE.md phase index lags.** The numbered phase list ends at Phase 32H; 32J, 32K, 32L, F1, F2,
   F2.9 have no dedicated entries (they appear only as later cross-reference notes). README carries all.
4. **Roadmap §3 Phase Overview** has no entry for the RNFirebase "Phase 1" foundation; the "Phase 1"
   status exists only in the P2 decision record and the `docs/freebuff/` trail.
5. **`P-7` is CLOSED in the P2 decision** (M1 chosen) while `O-4` in design §14A.5 is also marked
   RESOLVED — consistent, but split across two documents.
6. **Spec §29 vs design §14A.5 on O-2:** the 32F register leaves O-2 open; the README 32K entry states
   O-2 "was decided and implemented there". Treated here as **closed by 32K**, with the 32F text read
   as a historical record.
7. **Test-count snapshots** in older phase records (e.g. §27B 603) differ from current totals; per
   repository convention, **historical snapshots are not back-updated**.

---

## 36. BASELINE — Phase 2 reconciliation (2026-09-28)

A **new dated baseline**. Older baselines recorded in this document are not rewritten; they remain as
recorded.

| Field | Value |
| --- | --- |
| Branch | `main` @ `48969e0e07861932c061df8c3fc038b83c17ccf5` |
| Reconciliation commit | `48969e0` — "docs: reconcile the historical Phase 18C and 18E implementation plans" (Phase 1) |
| `origin/main` | `e97497b6d3e3ed25bffc9a4f13d0f6bcc6bc0bd4` — local `main` is **1 commit ahead** (not pushed) |
| Merged PRs | #1 `fa87941`, #2 `dbdf673`, #3 `37f5535`, #4 `924f8bc`, #5 `14de2af`, #6 `e97497b` |
| Open PRs | **0** |
| Working tree | `M mobile/eas.json`; untracked `?? .freebuff/`, `?? docs/AUTH_SECURITY_MASTER_CHECKLIST.md` |
| WIP backup | `wip/backup-working-tree` @ `e9616cfa19be05dd70abbf0702a1c3ca541fa3c5` — intact locally and on `origin` |
| Prior baseline | branch `docs/phase-32l-documentation-closeout` @ `f90d45d` (2026-09-26) |

### Protected-file register at this baseline (git blob hashes)

Git blob hashes are used because they are immune to LF/CRLF normalisation — the two false mismatches
recorded in §32 were line-ending differences, not content changes.

```
c1ab09c8998221fa077dcdf053a17e65f398cffd  mobile/eas.json                        (modified, unstaged)
86688b7b8468e57b9abeaf3986f23b17bb23b57a  server/src/services/ai/providers/http.ts
07601c7ab31009263d0045f20a9b940539184094  server/test/phase06-ai-wire.test.mjs
12627bae19ec693bd8d609ac00bd57b602139dce  docs/superpowers/plans/2026-09-11-phase-18c-core-list-screens.md
347bcc1365939bed92879f00d781f63f71cf670e  docs/superpowers/plans/2026-09-11-phase-18e-secondary-screens.md
```

Except for `mobile/eas.json`, each blob equals its `HEAD` blob, so those four are committed rather
than uncommitted. Use `git hash-object <path>` to re-check.

### Preserved in this phase

This reconciliation changed **current-state metadata only** (§30, §31 G-8, §32 register, §33
*Current*, §34, and the header evidence line). §0–§29 behaviour and security tables, O-1…O-11,
§28 deferred work and security findings, §29 phase history and §35 conflicts are **unchanged**.
The dependency-level PII-logging finding (`@react-native-firebase/auth` v26.4.0) remains in §24 and
§28 and was **not** extracted.

---

> **MAINTENANCE.** This is a living navigation document. On any authentication/security change:
> reconcile against evidence, update only evidence-supported statuses, record newly completed and
> remaining work, preserve unresolved decisions and deferred items, update external-verification
> status, the current authorised phase and the next-work gate, and **never** silently remove
> historical work, mark code-only work as externally verified, or mark planned work as authorised.
> Read this checklist before starting any future authentication/security implementation; if the
> requested work conflicts with it or with existing architecture, **STOP and report the conflict.**
