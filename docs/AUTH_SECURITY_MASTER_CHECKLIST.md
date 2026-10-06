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
> **Evidence base.** Re-reconciled against the working tree at branch `main` @ `934b15a`
> (2026-09-28) — the **Phase 3 / current baseline** recorded in §37. The Phase 2 baseline
> (`48969e0`) remains historical in §36, and the baseline before it was branch
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
| I-13 | **Re-authentication required** for the Firebase unlink sensitive operation (signed `auth_time`, 300 s, fail-closed). *(The unlink operation was removed by Phase A / F-1; the same requirement now guards the credential-change bridge — see §8.)* | `[✓]` | `constants/firebase.ts`. *(`firebaseUnlink.service.ts` was removed by Phase A / F-1 — see §8.)* |
| I-14 | **Account linking rules** — authenticated, own-account only, email never a join key, conflicts refused with one 409. | `[✓]` | Phase 32H. |
| I-15 | **Account unlinking rules** — Policy B: a new local password must be established in the same transition; no zero-method account. *(The unlink operation itself was removed by Phase A / F-1 — see §8.)* | `[✓]` | Phase 32L-A — **removed by Phase A / F-1** (see §8); design §27Q. |
| I-16 | **No cross-business account movement** — a link/unlink writes only `firebaseUid`/`emailVerified`/`passwordHash`; `businessId` is never assigned. *(The invariant holds for linking; the unlink half was removed by Phase A / F-1 — see §8.)* | `[✓]` | `firebaseLink.service.ts`. *(`firebaseUnlink.service.ts` was removed by Phase A / F-1 — see §8.)* |
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
| `[✓]` | **Firebase ID token verification** | `checkRevoked:true` (**AUTH-01**; supersedes the §14C.5/L-19 recommendation) | revocation sync — §23 | `tokenVerifier.ts` |
| `[✓]` | **Exchange endpoint** | `POST /api/auth/firebase/exchange` (PUBLIC, rate-limited) | E2E unverified | Phase 32C |
| `[✓]` | **UID-authoritative lookup** | Resolves by `firebaseUid` **only, never email** | — | `firebaseAuth.service.ts` |
| `[✓]` | **Unknown UID handling** | 403 `REGISTRATION_REQUIRED` | — | Phase 32C |
| `[✓]` | **Registration boundary** | `POST /api/auth/firebase/register`; refuses linking | — | Phase 32C |
| `[✓]` | **Firebase-linked user handling** | `firebaseUid` present → password door refused | — | Phase 32K |
| `[✓]` | **Firebase provider identity handling** | Provider type recorded from verified token (`signInProvider`) | — | `tokenVerifier.ts` |
| `[✓]` | **Firebase logout** | `signOutOfFirebase()` total; outcome consumed via `firebaseSignOutPending` marker | device-time | design §14A.8 (D-E1) |
| `[✓]` | **Firebase session behaviour** | Durable native persistence (P2), Inventory split | device-time (P-4) | `2026-09-24-rnfirebase-p2-...md` |
| `[✓]` | **Firebase token freshness** | `auth_time` checked for sensitive ops; fail-closed | — | `constants/firebase.ts` |
| `[~]` | **Firebase revocation handling** | `checkRevoked:true` (**AUTH-01**); revocation is consulted at every verification — **no Mongo→Firebase disable sync** | §23 future | design §16 |
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
| `[✓]` | **Unlinking (server side)** | Policy B | code + test | Phase 32L-A — **removed by Phase A / F-1** (see §8) |
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

> **⛔ SUPERSEDED 2026-10-01 (Phase A / F-1).** `POST /api/auth/firebase/unlink` **does not exist**. Phase
> F-1 (`6e2252f`) **removed it rather than deprecating it**: the route, the controller handler, the payload
> validator, `server/src/services/firebaseUnlink.service.ts` (402 lines), both audit actions
> (`FIREBASE_IDENTITY_UNLINKED` and `FIREBASE_IDENTITY_UNLINK_CONFLICT` — no longer declared in
> `server/src/constants/audit.ts`), the mobile API wrapper and `server/test/phase32l-firebase-unlink.test.mjs`
> are all gone. The operation was re-scoped into a **credential change** — Firebase `updatePassword`, then
> the credentials-changed bridge, then the session the sequence ends with — so `firebaseUid` is **never
> cleared** and no reachable path clears it. **The table below is the historical Phase 32L record and is not
> rewritten:** its `[✓]` rows describe a capability that shipped and was later removed, and none of them
> describes the current state. The removal is recorded in `CLAUDE.md`'s committed **Phase F-1 correction**
> and in commit `6e2252f` itself; design authority **§14B.6**. **The roadmap has no section recording this
> removal** — that history gap is noted here rather than papered over.

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

> **⛔ SUPERSEDED 2026-10-02 (AUTH-04).** The table below describes the **Firebase verification-link**
> flow. Email verification is now a **custom 6-digit Inventory AI code delivered through the
> provider-agnostic mail boundary (Brevo / Resend)**, with
> Firebase Admin `updateUser(uid, { emailVerified: true })` setting the final Firebase state. See **§40**
> and design authority **§14C.10**. The table is preserved as the historical record and is not rewritten.
> The "whether verification is enforced" question is answered by the shipped code (it **is** enforced at
> register/exchange/renew) — see §40.

| Status | Item | Detail |
| --- | --- | --- |
| `[✓]` | **Firebase email verification state** | `email_verified` read from the verified token. |
| `[✓]` | **Mongo `emailVerified` persistence** | Written on exchange/link/unlink (`models/user.model.ts`). *(The unlink part was removed by Phase A / F-1 — see §8.)* |
| `[—]` | **Whether verification is currently enforced** | **NOT enforced.** No authorization decision reads `emailVerified` (verified: write-only sites). |
| `[—]` | **Authorization gates** | None. |
| `[—]` | **Login restrictions** | None. |
| `[—]` | **Sensitive-operation restrictions** | None. |
| `[✓]` | **Registration behaviour** | `emailVerified` persisted from claim. |
| `[✓]` | **Linking behaviour** | `emailVerified` moves with `firebaseUid` (CASE C). |
| `[✓]` | **Unlinking behaviour** | Reset to `false`. |
| `[ ]` | **Resend verification** | Superseded — see §40: resend is a server-side **60-second per-UID cooldown** on `POST /api/auth/email-verification/request`. |
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
| `[✓]` | **Password creation** | Register / reset / unlink establish a bcrypt hash. *(The unlink part was removed by Phase A / F-1 — see §8.)* |
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
| `[ ]` | **Firebase-native password reset** | Not implemented — **direction LOCKED 2026-09-29 (§39, design §14C L-3/L-11): Firebase takes over recovery; the 26B/27 path is to be removed later. Nothing removed yet.** |
| `[!]` | **O-8** | Whether Firebase takes over the reset flow — **RESOLVED 2026-09-29 (§39): it does.** Artefact disposition (deleted vs archived) open as **OD-5**. |
| `[!]` | **O-9** | `passwordChangedAt` semantics for Firebase-native accounts — **RESOLVED (design) 2026-09-29 (§39): the credential-change revocation bridge.** Not implemented. |
| `[ ]` | **Credential-change revocation bridge** | **Designed, NOT implemented** (§39 / design §14C.3). Without it a client-side Firebase reset revokes **nothing**. |
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
| `[✓]` | **Firebase unlink invalidation** | All sessions revoked. *(Removed by Phase A / F-1 — see §8.)* |
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
| `[✓]` | **Firebase reauth** | Required for unlink. *(Re-scoped: Phase A / F-1 removed unlink; the same freshness now guards the credential-change bridge — see §8.)* |
| `[✓]` | **Signed `auth_time`** | Read from verified claim. |
| `[✓]` | **300-second freshness window** | Frozen (Option D). |
| `[✓]` | **Fail-closed handling** | Cannot be chosen by a client. |
| `[✓]` | **Unlink protection** | The one implemented step-up point. *(Removed by Phase A / F-1 — see §8.)* |
| `[ ]` | **Future sensitive-operation step-up** | Not implemented beyond unlink. *(Unlink no longer exists — Phase A / F-1; see §8.)* |
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
| `[✓]` | **Account unlinking across businesses** | Impossible — same. *(Removed by Phase A / F-1 — see §8.)* |

---

## 16. ACCOUNT LIFECYCLE

| Status | Item | Detail |
| --- | --- | --- |
| `[✓]` | **Active** | Default status. |
| `[✓]` | **Disabled** | Instant login/API revocation. |
| `[✓]` | **Firebase-linked** | `firebaseUid` set; password door refused. |
| `[✓]` | **Password-authenticated** | Legacy path. |
| `[✓]` | **Provider-linked** | Provider recorded on the Firebase identity. |
| `[✓]` | **Unlinked** | Policy B; new local password. *(Removed by Phase A / F-1 — see §8.)* |
| `[✓]` | **Password changed** | Stamps `passwordChangedAt`. |
| `[✓]` | **Password reset** | Full flow. |
| `[✓]` | **Sessions revoked** | On change/reset/unlink/logout. *(The unlink part was removed by Phase A / F-1 — see §8.)* |
| `[ ]` | **Account recovery (broader)** | Beyond password reset — missing (§22). |
| `[ ]` | **Future deletion/deactivation rules** | Undefined; products are archive-only; user hard-delete not specified. |
| `[✓]` | **Audit implications** | Status/role/link/unlink/session events recorded (§17). *(The unlink part was removed by Phase A / F-1 — see §8.)* |

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
| `[✓]` | **Unlinking** | `FIREBASE_IDENTITY_UNLINKED` / `_CONFLICT`. *(Both actions were removed by Phase A / F-1 — see §8.)* |
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
| `[✓]` | **Reauthentication** | 300 s freshness for unlink. *(Re-scoped: Phase A / F-1 removed unlink — see §8.)* |
| `[!]` | **Email verification** | Not enforced (O-3) — a real gap for provider-asserted addresses. |
| `[ ]` | **Email change protection** | Capability absent (§10). |
| `[ ]` | **MFA** | Future (§21). |
| `[ ]` | **Security notifications** | Future (§20). |
| `[ ]` | **Failed-login detection** | Only rate limiting. |
| `[ ]` | **Suspicious-login detection** | Not implemented. |
| `[✓]` | **Provider linking protection** | Own-account, conflict-refused, no email auto-link. |
| `[✓]` | **Provider unlink protection** | Policy B + freshness + sessions revoked. *(Removed by Phase A / F-1 — see §8.)* |
| `[ ]` | **Break-glass recovery** | Not implemented (§22). |
| `[~]` | **Firebase revocation** | `checkRevoked:true` (**AUTH-01**); no disable sync (§23). |
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
| `[!]` | **O-6** | Unhealable-orphan remedy — OPEN (**not reachable for the current mocked population**: §39). |
| `[!]` | **O-8** | Firebase taking over reset — **RESOLVED 2026-09-29 (§39): it does.** |
| `[!]` | **O-9** | `passwordChangedAt` semantics for Firebase-native — **RESOLVED (design) 2026-09-29 (§39).** |

**Distinction preserved:** existing password-reset functionality is real; broader recovery controls
are missing.

---

## 23. FIREBASE REVOCATION / ACCOUNT DISABLE SYNC

| Status | Item | Detail |
| --- | --- | --- |
| `[✓]` | **Mongo disabled state** | `User.status` ACTIVE/DISABLED. |
| `[ ]` | **Firebase state** | No propagation from Mongo to Firebase. |
| `[ ]` | **Firebase token revocation** | Not implemented. |
| `[✓]` | **`checkRevoked` behaviour** | `true` — **AUTH-01**, per the approved target architecture §9/§10 ("Firebase revocation checking is a security boundary"). **Supersedes the 2026-09-29 L-19 recommendation to remain `false`** (§39 / design §14C.5), retained below as the historical review. MongoDB `status` remains the revocation authority for *Inventory AI sessions*. |
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
| **O-3** | Whether `emailVerified` is enforced | **RESOLVED 2026-09-29** — direction (§39, L-6/L-7) **and** mechanics (§39 / design §14C.9, RG-1…RG-15) | design §14A.5; §14C.9 | Gate is the registration **ordering** + a client verify screen; `requireAuth` deliberately unmodified; unverified Google refused; resend native | None — implement in N-5 (still gated by N-4 and B-2/L-17) |
| **O-4** | M1 vs M2 | **RESOLVED** — M1 (RNFirebase) + P2 durable persistence | P2 decision §8.1 | Forfeits Expo Go (O-11) | None |
| **O-5** | Facebook missing-email onboarding flow | **OPEN** | design §14A.5; R-10 | Blocks Facebook Login | Decide flow |
| **O-6** | Remedy for the unhealable orphan | **OPEN** | design §14A.5; §16.6 | Blocks legacy migration/linking | Decide remedy / accept |
| **O-7** | `google-services.json` / plist storage | **RESOLVED** — EAS build-time injection, not committed | P2 decision §8.1 | Native provider config | None |
| **O-8** | Whether Firebase takes over the password-reset flow | **RESOLVED 2026-09-29 — Firebase takes over recovery** | §39; design §14C L-3/L-11 | 26B/27 + Resend are to be removed in a later step | Decide artefact disposition (**OD-5**) |
| **O-9** | `passwordChangedAt` semantics for Firebase-native accounts | **RESOLVED (design) 2026-09-29 — the credential-change revocation bridge** | §39; design §14C.3 | A Firebase-native reset would otherwise revoke **nothing** | Implement (N-4); name is **OD-1** |
| **O-10** | Invitation implementation | **DIRECTION LOCKED 2026-09-29 (L-12); implementation OPEN** | §39; design §14C.6 N-9 | **Now a hard prerequisite of retiring legacy login** — `users.service.create` writes a hash and no `firebaseUid` | Decide model/lifetime/routes |
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
| Git/branch state | branch `main` @ `934b15a`; `origin/main` @ `934b15a`; **0 ahead / 0 behind**; PRs **#1–#6 merged** (#4 `924f8bc`, #5 `14de2af`, #6 `e97497b`); **0 open PRs**. Phases **1–3 pushed** (`48969e0`, `d340735`, `934b15a`). |

---

## 31. NEXT-WORK GATE

Before Freebuff starts coding any authentication/security work, **all** must be true:

| # | Gate | Current |
| --- | --- | --- |
| G-1 | An authorised phase exists? | **No** |
| G-2 | Is it numbered? | **No** |
| G-3 | Is scope documented? | **No** |
| G-4 | Are prerequisites satisfied? | **No** (external gates open) |
| G-5 | Required owner decisions resolved? | **Partially — the Firebase-only DIRECTION is locked 2026-09-29 (§39): O-8 and O-9 resolved, O-3 now fully RESOLVED (direction *and* mechanics, design §14C.9), O-10 direction locked.**Still blocking implementation: **OD-1, OD-2, OD-4…OD-8** (design §14C.7 — **OD-3 resolved**, **N-4's D2 resolved in §14C.3.8**, and its trigger **OD-9 LOCKED in §14C.3.9**) and **O-5, O-6, O-11**. |
| G-6 | External blockers resolved? | **No** (§25) |
| G-7 | Git working tree understood? | **Yes** |
| G-8 | Protected files preserved? | **Yes** — no protected file was modified. There are now **zero uncommitted protected entries**: all five are committed and equal to `HEAD` (Phase 3 committed the last one, `mobile/eas.json`). The two older SHA-256 mismatches (`http.ts`, `phase06-ai-wire.test.mjs`) were **CRLF-normalisation differences, not content changes** (§32). |
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

**Zero** entries are uncommitted. All five are committed and byte-identical to `HEAD`. Git blob
hashes are used because they are immune to LF/CRLF normalisation (see the historical register below).

```
c1ab09c8998221fa077dcdf053a17e65f398cffd  mobile/eas.json                        (committed by `934b15a`; == HEAD)
86688b7b8468e57b9abeaf3986f23b17bb23b57a  server/src/services/ai/providers/http.ts            (== HEAD)
07601c7ab31009263d0045f20a9b940539184094  server/test/phase06-ai-wire.test.mjs               (== HEAD)
12627bae19ec693bd8d609ac00bd57b602139dce  docs/superpowers/plans/2026-09-11-phase-18c-core-list-screens.md   (== HEAD)
347bcc1365939bed92879f00d781f63f71cf670e  docs/superpowers/plans/2026-09-11-phase-18e-secondary-screens.md   (== HEAD)
```

The five paths remain the protected **set** — the history above is what the safety rules protect.
What changed is only that none of them is uncommitted any more.

### Historical register — SHA-256 as recorded 2026-09-26 (superseded; retained, not erased)

```
10c5ff2e…530  mobile/eas.json                                     still matches; status moved UNCOMMITTED -> COMMITTED by Phase 3 commit `934b15a`
23e91610…213  server/src/services/ai/providers/http.ts            SUPERSEDED — CRLF normalisation, content unchanged
83767f8b…768  server/test/phase06-ai-wire.test.mjs               SUPERSEDED — CRLF normalisation, content unchanged
52d3afef…891  docs/superpowers/plans/…-18c-core-list-screens.md   SUPERSEDED — committed by the Phase 1 reconciliation commit `48969e0`
d000a5d3…297  docs/superpowers/plans/…-18e-secondary-screens.md   SUPERSEDED — committed by the Phase 1 reconciliation commit `48969e0`
```

The Phase 1 reconciliation commit is **`48969e0`** ("docs: reconcile the historical Phase 18C and 18E
implementation plans"). It committed both plans with blob hashes `12627bae…` (18C) and `347bcc13…`
(18E), so they are no longer protected *uncommitted* entries. The two CRLF mismatches were **not**
content changes: those files' git-normalised blobs already equalled `HEAD` exactly.

Phase 2 (**`d340735`**) reconciled this document's own baseline; Phase 3 (**`934b15a`**) committed
`mobile/eas.json` — the last protected file that had been modified but unstaged — leaving **no**
uncommitted protected entries.

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
documentation/cleanup tail. Git state: branch `main` @ `934b15a`; `origin/main` @ `934b15a`;
**0 ahead / 0 behind**; PRs **#1–#6 merged**; **0 open PRs**; Phases **1–3 pushed**; the working
tree holds only `?? .freebuff/`.

### Blocked
iOS provider build/runtime (no iOS build host, P-6); the **new-identity → `REGISTRATION_REQUIRED`**
path is **ENVIRONMENT-BLOCKED** on the available device (§5b); plus P-3/P-4 build/device gates and
Gates 1/2. (The live Firebase project and the Android existing-account Google E2E are no longer
blocked — §5a/§25.)

### Decision Required
**O-5** (Facebook missing-email), **O-6** (orphan remedy — not reachable for the mocked population),
**O-11** (Expo Go policy), plus the Firebase-only register **OD-1, OD-2, OD-4…OD-8, OD-10** (design
§14C.7):
the bridge's name/shape, unlink's fate, the invitation model, the 26B/27 artefact disposition, whether
`/firebase/link` survives, and whether `/register` is removed outright.
*(**D2 is resolved in design §14C.3.8 and its trigger **OD-9 is now LOCKED in §14C.3.9** (2026-09-29,
Phase 32Q — M-1…M-10); **Option E** is a separate deferred owner decision — **OD-10** — and **D2 retains the
cross-device residue F-19**.)*
*(**O-3** is fully resolved — direction **and** mechanics, design §14C.9 (2026-09-29), together with
the **D-5…D-9** registration audit gaps. **O-8** and **O-9** were resolved/direction-locked on
2026-09-29 — §39 — and **O-10**'s direction is locked with its implementation still open.)*

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
- Git state at `934b15a` (branch `main`; `origin/main` at `934b15a`) — see §37.

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

## 37. BASELINE — Phase 3/current-state reconciliation (2026-09-28)

A **new dated baseline**. §36 above is preserved exactly as the historical Phase 2 baseline; this
section supersedes it as the current state and rewrites nothing before it.

| Field | Value |
| --- | --- |
| Branch | `main` |
| HEAD | `934b15a038ccbdeb50c8c246f1a0ed5ae669886d` |
| `origin/main` | `934b15a038ccbdeb50c8c246f1a0ed5ae669886d` |
| Divergence | **0 ahead / 0 behind** |
| Merged PRs | #1 `fa87941`, #2 `dbdf673`, #3 `37f5535`, #4 `924f8bc`, #5 `14de2af`, #6 `e97497b` |
| Open PRs | **0** |
| Phase 1 commit | `48969e0` — reconcile the historical Phase 18C and 18E implementation plans |
| Phase 2 commit | `d340735` — reconcile this checklist's current-state baseline |
| Phase 3 commit | `934b15a` — set the EAS **preview** API URL to the Render origin |
| Push state | Phases **1–3 pushed**; `main` and `origin/main` agree |
| Working tree | `?? .freebuff/` only |
| Uncommitted protected entries | **zero** — all five are committed and equal to `HEAD` |
| `mobile/eas.json` | **committed and clean** (committed by `934b15a`); SHA-256 `10c5ff2e5c1a719ea330fa8bec74bb7d1770efb9070c24b043180ea35d7bd530` |
| WIP backup | `wip/backup-working-tree` @ `e9616cfa19be05dd70abbf0702a1c3ca541fa3c5` — **intact locally and on `origin`** |
| Prior baseline | Phase 2 (`48969e0`), preserved in §36 |

### Protected-file register at this baseline (git blob hashes)

```
c1ab09c8998221fa077dcdf053a17e65f398cffd  mobile/eas.json                        (== HEAD)
86688b7b8468e57b9abeaf3986f23b17bb23b57a  server/src/services/ai/providers/http.ts            (== HEAD)
07601c7ab31009263d0045f20a9b940539184094  server/test/phase06-ai-wire.test.mjs               (== HEAD)
12627bae19ec693bd8d609ac00bd57b602139dce  docs/superpowers/plans/2026-09-11-phase-18c-core-list-screens.md   (== HEAD)
347bcc1365939bed92879f00d781f63f71cf670e  docs/superpowers/plans/2026-09-11-phase-18e-secondary-screens.md   (== HEAD)
```

Use `git hash-object <path>` to re-check. Blob hashes are used because LF/CRLF normalisation cannot
change them — the two false mismatches recorded in §32 were line-ending differences, not content
changes.

### Changed in this reconciliation

Current-state metadata only: the header evidence line, §30 `Git/branch state`, §31 **G-8**, the §32
*current set* register, §33 *Current*, §34, and this new §37. §0–§29 behaviour and security tables,
O-1…O-11, §28 deferred work and security findings, §29 phase history, §35 conflicts and **§36** are
**unchanged**. The dependency-level PII-logging finding (`@react-native-firebase/auth` v26.4.0)
remains in §24 and §28 and was **not** extracted.

---

## 38. BASELINE — Phase 4 deployment-configuration reconciliation (2026-09-29)

A **new dated baseline**. §36 and §37 above are preserved exactly; this section supersedes §37 as the
current state and rewrites nothing before it. It adds no security decision, changes no behaviour and
records no secret.

| Field | Value |
| --- | --- |
| Branch | `main` |
| HEAD | `a95a461b0b8422fef9e167e81a57952cc905ad19` — current at this reconciliation; was `d3092523cc94dc93f58943793e3da19fdb57bbaa` when §38 was first written |
| `origin/main` | `a95a461b0b8422fef9e167e81a57952cc905ad19` |
| Divergence | **0 ahead / 0 behind** |
| Phase 4A commit | `d309252` — set the EAS **production** API URL to the Render origin (one line in `mobile/eas.json`) |
| Phase 4B commits | `0152f8a` (deployment-audit reconciliation), `d14ad86` (ignore/configuration boundary audit), `a95a461` (the two boundary rules) |
| Preceding commits | `6e32717` (Phase 2 — OpenRouter documentation reconciliation), `751d796` (Phase 1 — pin the OpenRouter suite's model) |
| Push state | Phases 1, 2, 4A and 4B pushed; `main`, `origin/main` and the live remote agree |
| Working tree | **clean** — no tracked change and nothing staged. `?? .freebuff/` no longer appears, because `.freebuff/` is now ignored by the repository |
| Open PRs | **0** |
| Merged PRs | #1 `fa87941`, #2 `dbdf673`, #3 `37f5535`, #4 `924f8bc`, #5 `14de2af`, #6 `e97497b` |
| WIP backup | `wip/backup-working-tree` @ `e9616cfa19be05dd70abbf0702a1c3ca541fa3c5` — intact locally and on `origin` |
| Prior baseline | Phase 3 (`934b15a`), preserved in §37 |

### Protected-file register at this baseline (git blob hashes)

```
9060e8c3a120984d88530dcfb3284eeb43f66a74  mobile/eas.json                        (== HEAD)
86688b7b8468e57b9abeaf3986f23b17bb23b57a  server/src/services/ai/providers/http.ts            (== HEAD)
07601c7ab31009263d0045f20a9b940539184094  server/test/phase06-ai-wire.test.mjs               (== HEAD)
12627bae19ec693bd8d609ac00bd57b602139dce  docs/superpowers/plans/2026-09-11-phase-18c-core-list-screens.md   (== HEAD)
347bcc1365939bed92879f00d781f63f71cf670e  docs/superpowers/plans/2026-09-11-phase-18e-secondary-screens.md   (== HEAD)
```

> **`mobile/eas.json` moved from `c1ab09c8998221fa077dcdf053a17e65f398cffd` (§37) to
> `9060e8c3a120984d88530dcfb3284eeb43f66a74`**, by the authorised Phase 4A commit `d309252`. The file's
> `production` profile no longer contains `https://REPLACE-WITH-PRODUCTION-ORIGIN`. §37's value is
> **superseded, not rewritten**.

### Deployment configuration — the two evidence classes

| Setting | Evidence class | Status |
| --- | --- | --- |
| EAS `preview` `EXPO_PUBLIC_API_URL` = `https://ai-inventory-l1mi.onrender.com` | repository | **VERIFIED** (`934b15a`) |
| EAS `production` `EXPO_PUBLIC_API_URL` = `https://ai-inventory-l1mi.onrender.com` | repository | **DONE / FIXED** (`d309252`, Phase 4A) |
| EAS `EXPO_PUBLIC_FIREBASE_*` (all four) + `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | **dashboard-managed** | **VERIFIED** by the project owner |
| EAS `GOOGLE_SERVICES_JSON` / `GOOGLE_SERVICE_INFO_PLIST` (file env vars) | **dashboard-managed** | **VERIFIED** by the project owner |
| Firebase Android SHA-1 / SHA-256 fingerprints | **external console** | **VERIFIED** by the project owner |
| Render service `ai-inventory`, `rootDir: server`, branch `main`, Auto Deploy `On Commit`, health check `/api/health/ready` | **dashboard-managed** | **VERIFIED** by the project owner |
| Render `NODE_ENV=production`, `NODE_VERSION=24`, `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN=7d` | **dashboard-managed** | **VERIFIED** by the project owner |
| Render `AI_PROVIDER=openrouter`, `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `AI_MODEL_OPENROUTER` | **dashboard-managed** | **VERIFIED** by the project owner |
| Render `FIREBASE_SERVICE_ACCOUNT_JSON` | **dashboard-managed** | **VERIFIED** by the project owner |
| Render `TRUST_PROXY=1` | **dashboard-managed** | **VERIFIED** by the project owner |

**The repository cannot see any dashboard-managed value, and its absence from `mobile/eas.json` or
from a repository config file is not evidence that it is unset.** No secret value is recorded here.

### Auth / rate-limit configuration audit (code-derived)

All **twenty-two** `AUTH_*` variables — eleven window/limit pairs — are **optional** and read lazily at
limiter-creation time (`server/src/middlewares/rateLimit.ts`, `authRateConfig`), each with a documented
default; none is in the production fail-fast set (`server/src/config/validateConfig.ts`).
**Render needs no override.** The count is exact and code-derived
(`grep -rhoE 'process\.env\.AUTH_[A-Z0-9_]+' server/src | sort -u` → 22), **not** an estimate.
**AUTH-03 added the session-renewal pair and AUTH-04 the two email-verification pairs**; the earlier
count of sixteen predates both.
`TRUST_PROXY` and `JWT_SECRET` / `JWT_EXPIRES_IN` appear in the table below but are **not** `AUTH_*`
variables and are counted separately.

| Variable | Default | Consumed by |
| --- | --- | --- |
| `AUTH_LOGIN_RATE_LIMIT_WINDOW_MS` / `_MAX` | 900000 / 10 | `createLoginAccountLimiter` (`POST /api/auth/login`, `skipSuccessfulRequests`) |
| `AUTH_LOGIN_IP_RATE_LIMIT_WINDOW_MS` / `_MAX` | 900000 / 60 | `createLoginIpLimiter` (same route) |
| `AUTH_REGISTER_RATE_LIMIT_WINDOW_MS` / `_MAX` | 3600000 / 30 | `createRegisterLimiter` (`POST /api/auth/register`) |
| `AUTH_PASSWORD_RESET_RATE_LIMIT_WINDOW_MS` / `_MAX` | 3600000 / 5 | `createPasswordResetRequestAccountLimiter` (`forgot-password`) |
| `AUTH_PASSWORD_RESET_IP_RATE_LIMIT_WINDOW_MS` / `_MAX` | 3600000 / 20 | `createPasswordResetRequestIpLimiter` (same route) |
| `AUTH_PASSWORD_RESET_CONFIRM_RATE_LIMIT_WINDOW_MS` / `_MAX` | 900000 / 20 | `createPasswordResetConfirmLimiter` (`reset-password`) |
| `AUTH_FIREBASE_EXCHANGE_RATE_LIMIT_WINDOW_MS` / `_MAX` | 900000 / 30 | `createFirebaseExchangeLimiter` (`POST /api/auth/firebase/exchange`) |
| `AUTH_FIREBASE_REGISTER_RATE_LIMIT_WINDOW_MS` / `_MAX` | 3600000 / 30 | `createFirebaseRegisterLimiter` (`POST /api/auth/firebase/register`) |
| `AUTH_SESSION_RENEW_RATE_LIMIT_WINDOW_MS` / `_MAX` | 900000 / 120 | `createSessionRenewLimiter` (`POST /api/auth/renew`, AUTH-03) |
| `AUTH_EMAIL_VERIFICATION_REQUEST_RATE_LIMIT_WINDOW_MS` / `_MAX` | 900000 / 30 | `createEmailVerificationRequestLimiter` (`POST /api/auth/email-verification/request`, AUTH-04) |
| `AUTH_EMAIL_VERIFICATION_CONFIRM_RATE_LIMIT_WINDOW_MS` / `_MAX` | 900000 / 30 | `createEmailVerificationConfirmLimiter` (`POST /api/auth/email-verification/confirm`, AUTH-04) |
| `TRUST_PROXY` | **0** (trust no proxy) | `server/src/config/env.ts` → `app.set('trust proxy', …)` in `server/src/app.ts`; decides what `req.ip` — and therefore every per-IP limiter — resolves to |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | — / `7d` | production fail-fast (≥ 32 chars, parseable timespan) |

`TRUST_PROXY=1` is **effectively required behind Render**, and it is not a hardening reduction: under
trust 0 every client shares the proxy's address, so the per-IP buckets would be global; under trust 1
`req.ip` is the real client and the limiters key as designed. `true` is never acceptable — an unbounded
forwarded chain lets anyone spoof `X-Forwarded-For`. The limiters deliberately key on `request.ip` using
`ipKeyGenerator` (IPv6 masked to /56) rather than the library default, which throws on an
`X-Forwarded-For` header while trust proxy is off.

**Production consistency: yes.** The verified Render configuration — defaults for every `AUTH_*` value,
`TRUST_PROXY=1`, `NODE_ENV=production`, `JWT_EXPIRES_IN=7d`, `CORS_ORIGINS` unset (correct: there are no
browser clients), `JSON_BODY_LIMIT` / `SHUTDOWN_TIMEOUT_MS` / `LOG_REQUESTS` at their defaults — matches
the implemented limiter behaviour. The known in-memory, per-process store limitation (E3) and B2 remain
**open and deferred to V4**, untouched by this baseline.

### Mail configuration audit (code-derived)

Password recovery **is implemented** (Phases 26B-1/2/3, 27, 28) and is **optional by design**: no mail
variable appears in the production fail-fast set, so a deployment boots without them and
`POST /api/auth/forgot-password` answers a fixed **503 `MAIL_NOT_CONFIGURED`**.

| Variable | Requirement | Consumed by |
| --- | --- | --- |
| `MAIL_PROVIDER` | optional; **empty = recovery disabled** | `mailConfig()`, `providers/index.ts` `selectProvider()` |
| `MAIL_FROM` | required when `MAIL_PROVIDER=resend` | `providers/index.ts` (`BUILTINS.resend.requiredEnv`), `resendProvider.ts` |
| `RESEND_API_KEY` | required when `MAIL_PROVIDER=resend` | `resendProvider.ts` (read directly; never a field of `mailConfig()`) |
| `PASSWORD_RESET_URL` | **conditionally required** — `forgot-password` refuses before minting a token without it | `passwordReset.service.ts` (`requestPasswordReset`) |
| `MAIL_APP_NAME` | optional, default `Inventory AI` | `mailConfig()` → the reset template |
| `MAIL_REQUEST_TIMEOUT_MS` | optional, default `10000` | `resendProvider.ts` (`AbortController`) |

None is legacy or unused. The only feature that can fail when they are absent is password recovery, and
it fails as a clean 503 rather than a crash or a boot failure. **Render currently carries none of the
four required mail variables**, so **production password recovery is disabled** — the one genuinely OPEN
item below.

### Status of the Phase 3 deployment findings

| Finding | Status |
| --- | --- |
| **G-1** production EAS API origin was a placeholder | **DONE / FIXED** — `d309252` (Phase 4A) |
| **G-2** Firebase/Google client configuration absent from `mobile/eas.json` | **VERIFIED — NO ACTION REQUIRED** — dashboard-managed EAS environment variables, verified by the project owner; SHA-1/SHA-256 fingerprints configured |
| **G-3** Render `TRUST_PROXY` unset and undocumented | **VERIFIED** on Render (`TRUST_PROXY=1`, project owner); the repository-side documentation gap is closed by this section and by `README.md` |
| **G-4** Render production configuration not enumerated in the repository | **DONE** — the required-variable table is now in `README.md` under the Render deployment section; the environment audit is this section |
| **Mail configuration** | **VERIFIED — NO ACTION REQUIRED** for startup; **OPEN** for password recovery (the feature is correctly disabled because its four variables are not set on Render) |
| **Auth/rate-limit configuration** | **VERIFIED — NO ACTION REQUIRED** — defaults are the production values and `TRUST_PROXY=1` is present and correct |
| **Ignore-boundary decisions** (`.freebuff/`, `.claude/settings.local.json`) | **DONE / VERIFIED** (`a95a461`) — owner-approved, committed to the root `.gitignore`, both rules verified matching, no tracked file newly ignored |

### Known documentation drift found by this audit

- `AI_MAX_TOOL_RESULT_CHARS` is read by `server/src/services/ai/aiConfig.ts` (default `12000`) but is
  **not listed in `server/.env.example`**. Cosmetic; recorded so it is not rediscovered as a defect.
- `docs/DEVELOPMENT_ROADMAP.md` §27J's Phase 32G record still says the `production` profile holds the
  placeholder. That is a **frozen historical record** and is deliberately not rewritten; the current
  value is recorded in §27T.

### The one OPEN item — what it is, and what is deliberately NOT decided

Production password recovery is **disabled** because the Render service carries none of
`MAIL_PROVIDER`, `MAIL_FROM`, `RESEND_API_KEY` or `PASSWORD_RESET_URL`. The feature is **implemented**
and the route correctly answers a fixed 503 `MAIL_NOT_CONFIGURED`. Two things must **not** be read into
this: **Resend is still the implemented, supported transport and was not removed**, and **Firebase-based
password recovery has not been implemented.**

**The production reset architecture is undecided, and this record deliberately does not decide it.**
Choosing between the shipped Resend flow and a Firebase-based reset requires a separate **read-only
audit** first, so **no `PASSWORD_RESET_URL` value is proposed or pre-decided here.** Phase 27's
`inventoryai://reset-password` mobile scheme exists and works, but whether a future decision reuses it
is part of that audit. **Nothing was configured, enabled or changed in this phase.**

### Ignore / configuration-boundary audit (security-relevant result)

The rule-by-rule audit lives in `docs/DEVELOPMENT_ROADMAP.md` §27T. The security-relevant outcome:

- **`mobile/.easignore` excluding `.env` / `.env.*` is load-bearing, not housekeeping.** EAS uses
  `.easignore` *instead of* `.gitignore`, so without that rule a local `mobile/.env` — which holds the
  eight `EXPO_PUBLIC_*` client values — would be uploaded into a remote build archive. The file is
  tracked and must remain the **union** of `mobile/.gitignore` and the relevant root rules.
- **`google-services.json` / `GoogleService-Info.plist` are excluded from both Git and EAS** (owner
  decision **P-1**, **O-7 RESOLVED**). The build input is the `GOOGLE_SERVICES_JSON` /
  `GOOGLE_SERVICE_INFO_PLIST` EAS **file environment variable**. Committing either file is **not**
  required by the architecture and would contradict P-1.
- **Signing material** — `*.jks`, `*.p8`, `*.p12`, `*.key`, `*.pem`, `*.mobileprovision` — is excluded
  from both boundaries and none of it is present in the repository.
- **Two boundary decisions — RAISED, APPROVED, and now CLOSED (`a95a461`).** *As originally recorded:*
  (1) `.freebuff/` was protected by **convention only** and matched by **no** ignore rule, so a blanket
  `git add -A` would have committed it; (2) `.claude/settings.local.json` was ignored only by a
  **machine-local** global excludes file, so any other clone saw it as untracked. *Current state:* the
  owner approved both, and the two rules are now in the **root `.gitignore`** — `.freebuff/` and
  `.claude/settings.local.json`. Both were verified matching after the change, and **no tracked file
  became ignored.** The earlier "no ignore file was changed in this phase" wording was accurate at the
  audit checkpoint and is **superseded, not rewritten.**
- **Integrity:** `git ls-files -i -c --exclude-standard` is **empty** — no tracked file is matched by any
  ignore rule, and no source file under `server/src/`, `server/test/`, `mobile/app/` or `mobile/lib/` is
  silently outside Git. Re-verified after `a95a461`: **still empty.**

### For future audits

> Deployment configuration for this project is split by design. The repository holds the code, the
> `mobile/eas.json` profiles and the **names** of every variable (`server/.env.example`); the **values**
> live in the Render service and the EAS project dashboards. A variable's absence from a repository file
> is therefore **not** evidence that it is unset, and the correct audit is to verify the current
> dashboard configuration rather than to re-flag its absence. Re-derive the code-side list with
> `grep -rhoE 'process\.env\.[A-Z0-9_]+' server/src` and compare it with the dashboards; only a variable
> that the code **requires** and the deployment **lacks** is a finding.

### Changed in this reconciliation

Current-state metadata only: this new §38 (including its ignore/configuration-boundary subsection), the
pointer updates in `docs/freebuff/HANDOFF.md` and `docs/freebuff/BASELINE.md` §13, and the `README.md`
deployment section. §0–§37 behaviour and security tables, O-1…O-11, §28 deferred work, §29 phase history,
§35 conflicts and **§36/§37** are **unchanged**.

**Second pass (same day, after `a95a461`).** §38's current-state fields were advanced: HEAD/`origin/main`,
the Phase 4B commit row, the working-tree row, the `AUTH_*` count (**eleven → sixteen**, code-verified),
the two ignore-boundary decisions (**OPEN** → **DONE / VERIFIED**), and the password-recovery wording —
the previously suggested `PASSWORD_RESET_URL` value is **removed**, and the reset-architecture decision
is recorded as **pending a separate read-only audit**. The original audit wording is preserved above and
marked superseded. No behaviour, grant, owner decision or deferred item changed, and **no secret value is
recorded** anywhere in this section.

---

## 39. FIREBASE-ONLY AUTHENTICATION — LOCKED DECISIONS, THE SESSION-REVOCATION BRIDGE, THE REGISTRATION / EMAIL-VERIFICATION DECISIONS, THE N-4 D2 RESOLUTION & THE OD-9 RECOVERY MARKER (2026-09-29)

> **⛔ SUPERSEDED IN PART 2026-10-02 (AUTH-04).** The **registration / email-verification decisions
> (RG-9/RG-12/RG-13 and their OD-3 resolution)** in this section selected the native Firebase
> verification link/email and native resend. That *mechanism* is superseded by **§40** (custom 6-digit
> Inventory AI code + Resend, design authority **§14C.10**). The rest of §39 (the credential-change
> bridge, D2, the OD-9 recovery marker) is unchanged. The text below is the historical record and is not
> rewritten.

**Documentation only.** No code, test, schema, dependency, environment variable, Firebase Console
setting, EAS configuration or deployment change was made for this section. The authoritative record is
`docs/superpowers/specs/2026-09-18-firebase-auth-design.md` **§14C**; the shipped-record counterpart is
`docs/DEVELOPMENT_ROADMAP.md` **§27U**.

### What was decided

Nineteen decisions are **locked** (design §14C.1, cited here as **L-1…L-19**): Firebase owns
email/password, Google, password reset, email verification and password changes (**L-1…L-5**);
email/password users must have a **verified email before entering the main app** and Google users are
verified **according to Firebase's signed claim**, not because the provider is Google (**L-6, L-7**);
the **Inventory AI JWT + server session remain** and Firebase does **not** replace backend
authorization (**L-8**); **MongoDB remains authoritative** for `businessId`, `role`, `status`,
permissions, lifecycle and tenant isolation (**L-9**); legacy bcrypt login/register (**L-10**), the
custom reset tokens + endpoints + Resend infrastructure (**L-11**), admin-created password accounts
(**L-12**) and the Inventory-specific link/unlink lifecycle (**L-13**) are to be retired or re-scoped;
a **credential-change revocation bridge** is required before native recovery or change-password ships
(**L-14/L-15/L-16**); the **action-link return leg must be verified live** (**L-17**) — **N-2, 2026-09-29: the Android app/OS side is VERIFIED and the Firebase email side is NOT, so the gate stays OPEN (design §14C.4.1, finding F-8)**; business
authorization must **not** move into Firebase custom claims (**L-18**); and `checkRevoked` was reviewed
(**L-19**). **Fifteen further decisions (RG-1…RG-15) fix the registration and email-verification flow
and resolve OD-3 — see *Registration & email verification — OD-3 RESOLVED* below.**

### The security substance — the credential-change revocation bridge (L-14, L-15, L-16)

**The defect it closes.** `passwordChangedAt` is the **only** mechanism that invalidates existing
Inventory AI sessions on a credential change, and, at the time of this record, `checkRevoked` was
`false` (superseded — **AUTH-01** sets it `true`), so Firebase could not
invalidate them either. A Firebase-native reset/change therefore **revokes nothing** — every session
that existed before the change, including an attacker's, survives it. Today's 26B/27 flow does not
have that hole because the server stamps the field; a client-side reset never reaches the server.

**Proposed shape:** `POST /api/auth/credentials-changed` — **AUTHENTICATED** (`requireAuth` + controller,
**no permission**; self-service, like `/logout`, `/sessions` and `/firebase/link`), body `{ idToken }`,
and the validator returns **only** `{ problems, idToken }`, so a body carrying `userId`,
`businessId`, `firebaseUid` or `role` is **inert by construction**.

**L-15 is satisfied twice over, by two independent facts, and this is the security argument:**

1. **Identity binding.** The verified uid **must equal** the account's `firebaseUid`
   (`User.findById(req.user.id)`). A mismatch is refused with one generic `409` that names no account,
   tenant, role or uid, **and nothing is written**. Without this the endpoint would let any caller
   holding *some* Firebase identity revoke *someone else's* sessions.
2. **Freshness.** `authTimeIsFresh(identity.authTime, now)` against
   `FIREBASE_REAUTH_WINDOW_SECONDS` (300 s), from the **signed `auth_time` claim** — never `iat` —
   failing **closed** on an absent claim. A credential change is by definition recent; a stolen
   long-lived token is not.

No single stolen artefact satisfies all three conditions (live Inventory AI session **and** a verified
Firebase credential **and** a fresh signed `auth_time` **and** the uid already attached to that
session's account), and no value a client can type is one of them.

**Writes exactly two things** — `passwordChangedAt = now` and `revokeAllSessions(...)` — so it can
never move a tenant, change a role or change a status. The audit row carries
`{ reason: 'credential_changed' }` and **no uid** (the audit viewer is ADMIN-readable — the 32H/32L
precedent).

**L-16 — ordering, and why it is forced rather than chosen:** Firebase change → bridge (revokes
everything) → **re-exchange** (`/api/auth/firebase/exchange` is **PUBLIC**, so the revocation cannot
block it) → a new JWT whose `iat >= changedAtSec`. The request that performs the change is itself
admitted because `requireAuth` rejects only tokens minted **strictly before** the stamp. The user
therefore stays signed in, and the bridge composes with sign-out-everywhere instead of fighting it.

> **⚠️ The one hazard this design adds, recorded rather than hidden.** The endpoint is **not**
> retryable: a second call stamps a *later* time and revokes everything again, so a replay after the
> re-exchange would kill the brand-new session. Its acknowledgement is a statement about the
> credential, sent **exactly once per change**. If the bridge's response is lost and the client
> retries, the retry arrives with the **old** token and is answered `401 SESSION_INVALIDATED` — which
> the client must treat as **success-equivalent** and proceed to the re-exchange. **This rule must be
> pinned by a test in the implementing step.**

**Rejected alternatives** (design §14C.3.6): a **public** endpoint keyed only on a verified ID token
(turns a stolen Firebase credential into an Inventory AI denial-of-service, and contradicts L-15); a
**Cloud Function / Admin-SDK trigger** (a new infrastructure surface this repository has never had and
no phase authorises); doing nothing (impossible — Firebase cannot revoke an Inventory AI session); and
simply accepting long-lived sessions (contradicts L-14).

### `checkRevoked` review (L-19) — recommendation: **REMAIN `false`** — **SUPERSEDED BY AUTH-01: the shipped behaviour is `true` (see the block below)**

> **SUPERSEDED BY AUTH-01 (recorded 2026-10-07). The shipped behaviour is `checkRevoked: true`.**
> `server/src/services/firebase/tokenVerifier.ts` calls
> `auth.verifyIdToken(idToken, /* checkRevoked */ true)`, which is what the **approved target
> architecture §9/§10** requires: *"Firebase revocation checking is a security boundary."* The
> recommendation below — and the identical one at design §14C.5 — is retained **unrewritten** as the
> historical review L-19 asked for, and it is **not current policy**.
>
> **What is now true, and what is not.** A Firebase-side disable/delete **is** consulted at every
> verification (exchange, renewal and the AUTH-04 pre-session routes). It **still does not end a live
> Inventory AI session**, because the Firebase ID token is never the API bearer credential — MongoDB
> `status`, `passwordChangedAt` and the `sessions` row remain the enforcement points, exactly as L-9
> says. The availability cost this review names is real and is the accepted trade-off of that change:
> a Firebase outage now refuses verification rather than being ignored, and the failure is classified
> as transient (`FIREBASE_UNAVAILABLE` → `503` on authenticated routes), pinned by
> `phaseAUTH01-firebase-verification.test.mjs`. **The availability trade-off itself has no separate
> owner decision record — flagged for the architect.**

Recorded in full at design §14C.5. In security terms: **MongoDB `status` is checked per request by
`requireAuth` and is the revocation authority (L-9).** Setting `checkRevoked: true` would add a network
round trip to Google on **every** exchange, fail closed when Google is unreachable (a Google outage
becomes a total sign-in outage), and **still not revoke a live Inventory AI session** — `requireAuth`
never sees a Firebase token. The narrow gap that remains, stated so it is not mistaken for coverage:
**disabling a user in Firebase only does not stop their Inventory AI session, and will not while
Firebase is not the bearer credential.** Change it only if a separately-approved phase establishes
that Firebase-side disable must take effect at exchange.

### New findings recorded by this decision

| # | Finding |
| --- | --- |
| **F-1** | **A Firebase-native password reset would revoke nothing** without the bridge (§39 above, design §14C.3). This is the O-9 defect becoming live, and it is the reason L-14 gates the work. |
| **F-2** | **A client-side reset never reaches the server**, so any future server-side security consequence of a credential change (audit, notification, revocation) must be re-established explicitly rather than inherited from the 26B/27 flow. |
| **F-3** | **Enumeration resistance relocates to Firebase.** The uniform-202 guarantee is genuinely lost when the request is a client-SDK call; Firebase reports `auth/user-not-found` on a project with enumeration protection off. This is a **relocation, not a new hole** — an attacker can call the SDK directly with the public API key regardless — but the project's own property no longer exists. |
| **F-4** | **`users.service.create` produces an unauthenticatable account under Firebase-only.** It writes a bcrypt `passwordHash` and **no `firebaseUid`**. Retiring legacy login without L-12/O-10 first would lock such users out entirely. **Hard sequencing constraint (N-9).** |
| **F-5** | **Removing the recovery endpoints deletes the subject matter of B2** (distributed reset-mail flooding). **E3** (in-memory, per-process limiter stores) **survives** for the remaining login/exchange limiters. **No shared store is introduced in either direction.** |
| **F-6** | **`User.emailVerified` is written only at exchange/link/register time**, so it is stale between those events — which matters once L-6/L-7 have to make a decision from it (**OD-3**). |
| **F-7** | **No live Firebase project has ever been exercised** for Phases 32B–32L (§25), so none of this can be runtime-claimed. |
| **F-8** | **The existing reset screen reads `token`, not `oobCode`, and a Firebase-native link would therefore dead-end.** Verified on the installed Android development build 2026-09-29 by injecting both parameter names at the OS level: `?token=` renders the reset form, `?oobCode=` renders **"Link incomplete"**. **Router-level custom-scheme delivery is VERIFIED; the Firebase email side is NOT** (design §14C.4.1, roadmap §27U). |
| **F-8b** | **CLOSED (client side) by N-3.** The reset screen now reads `?oobCode=` — a Firebase link renders the form and redeems through Firebase — while `?token=` still goes to the custom endpoint, so both link shapes work. Guarded by `mobile/__tests__/phaseN3-recovery-screens.test.tsx`; the Firebase email side of F-8 is **unchanged and still open**. |
| **F-9** | **N-3 ships the client half of Firebase recovery; the device run then NARROWED the gate without closing it.** Driven by Metro into the F2.9 **development** APK: `?oobCode=` **renders the reset form** (F-8 closed client-side, on a device), the legacy `?token=` path still works, `sendPasswordResetEmail` for `jeffern1233@owner.com` reached the live project and answered **`onComplete:success`**, and `confirmPasswordReset` with a deliberately fake code produced `FirebaseAuthActionCodeException` → the screen's *"invalid or has expired"* copy. **The project ACCEPTED the custom-scheme `ActionCodeSettings`** (no `*-continue-uri` rejection). **Still UNVERIFIED: delivery of the email and the link it contains** — `onComplete:success` is returned even for an address with no account under email-enumeration protection, and the screen deliberately cannot tell the two apart. **Items 3, 6 and 7 remain BLOCKED. L-17 stays OPEN — narrowed, not resolved — and N-4 must not start as though the Firebase half were proven.** |
| **F-12** | **The attached build was a `preview` APK, not a development build, so the first run attempt changed nothing — and that is a prerequisite worth remembering.** A `preview` build embeds its bundle: no `DEBUGGABLE` flag, `run-as` and the dev menu refused, no dev-launcher activity, 126 MB against 258 MB for the development APKs, so **Metro cannot drive it** no matter how the deep link is formed. The device now carries F2.9's development APK **by owner decision**; `preview` `4160dee1-…` can be reinstalled from its EAS artifact URL. |
| **F-13** | **A stale cached bundle looks exactly like a working device run.** The `preview` build rendered the pre-N-3 UI with zero Metro traffic, and `exp+inventory-ai://expo-development-client/?url=…` with a **stray `\r`** in the URL made a later launch fall back to the cache silently. The honest discriminator is not the log but the **screen**: `?oobCode=` rendering *"Link incomplete"* means the old bundle is running. |
| **F-10** | **A Firebase-native reset does not revoke Inventory AI sessions, and that is a real, open gap.** The server never sees the reset, so `passwordChangedAt` is not stamped and no session is revoked — a session held elsewhere stays valid until it expires. The custom flow still revokes server-side. The remedy is the credential-change bridge (§14C.3 / **N-4**), which is designed and **NOT implemented**; the reset screen records this in place and clears only the local session. |
| **F-11** | **The concrete Console dependency, named so it is actionable.** If the project does not accept `inventoryai://reset-password` as a continue URL for an action-code email, the send fails with `auth/invalid-continue-uri` / `auth/unauthorized-continue-uri`; the client answers that with a configuration sentence rather than "try again", because retrying cannot help. Settling it needs the Firebase Console (authorized domains / action-link handling), which is exactly the L-17 gate. |

### Registration & email verification — OD-3 RESOLVED (2026-09-29, Phase 32O)

**Documentation only.** No code, test, schema, dependency, environment variable, Firebase Console
setting, EAS configuration or deployment change was made for this record. The authoritative record is
design **§14C.9**; the shipped-record counterpart is `docs/DEVELOPMENT_ROADMAP.md` **§27U**.

**Fifteen registration decisions are locked** (design §14C.9, cited here as **RG-1…RG-15**): the
registration **order is the mechanism** — Firebase account → **verification email sent** → the user
verifies → `reload()` confirms `emailVerified === true` → **only then** the MongoDB `User` **and**
`Business` are created together (OWNER, `User.businessId` still required) → Inventory AI JWT + session →
main app (**RG-1…RG-4**); **no JWT, no session, no `User` and no `Business` exist before verification**
(**RG-2/RG-3**); the **Firebase UID is the only** Firebase→MongoDB identity join key and email is
**never** one (**RG-5**); MongoDB stays authoritative for `businessId`, `role`, `status`, permissions
and lifecycle (**RG-6**); **`requireAuth` is NOT modified** for this gate (**RG-7**), so the Phase 23/24
authorization order and status-code contract are untouched; an unverified Google identity is
**refused** by Firebase's signed `email_verified` claim rather than by the provider name (**RG-11**);
resend is **native Firebase Auth** with no custom verification-token or mail system (**RG-12**) — a statement **superseded by §40 (AUTH-04)**, whose custom 6-digit flow **does** reach this backend and therefore **does** carry a server-side limiter: a **60-second per-UID resend cooldown** enforced in the challenge write predicate, plus the AD-19 per-IP request/confirm limiters;
`User.emailVerified` is persisted after verified registration and **the server does not call Firebase
on ordinary API requests** (**RG-10**); the legacy `/api/auth/register` path stays **transitional**
until N-6 and is not weakened for this (**RG-14**); and **no** custom claims, Firestore, tenant-less
users, email-based linking, new provider architecture or new mail infrastructure is introduced
(**RG-15**).

**The security substance — the gate is ordering, not a conditional.** An unverified identity has
**nothing to authenticate against**: no `Business`, no `User`, therefore no session, no token and no
authenticated route. That is *why* `requireAuth` is deliberately untouched (**RG-7**) — a check inside
the single authentication choke point would both change the frozen Phase 23/24 contract **and strand
every already-shipped client**, because a server-side check cannot be deployed in lockstep with the
builds it would reject. `requireAuth` remains exactly as §20 freezes it.

**Verification-link return (RG-13): the Inventory AI deep-link flow is SELECTED, and the
Firebase-hosted page is recorded as the fallback.** Neither is implemented. The selection needs **no
new infrastructure** — one scheme (`inventoryai`), Expo-Router path routing, and the
`ActionCodeSettings` shape the live project already **accepted** in N-3 — so it inherits a proven
receiving end. **It also inherits L-17's open gate:** the *mobile/OS* half is verified but the
**Firebase email half has never been exercised**, and unlike recovery there is **no fallback capability
for an unverified user**, which is exactly why the hosted page is kept as a live alternative and why
the delivery half must be measured before the flow is claimed to work.

**Bounded, not solved — the staleness problem (F-6).** `User.emailVerified` is written only at
exchange/link/register time. No per-request Firebase check is added (**RG-10**) and no `requireAuth`
comparison (**RG-7**), so the gate applies **at registration time** and a later Firebase-side
verification change is **not** reflected on an existing session. Recorded rather than presented as
coverage.

**New findings recorded by this decision**

| # | Finding |
| --- | --- |
| **F-14** | **RG-9's “fresh ID token” is not satisfied by the boundary as shipped.** `nativeCurrentIdToken()` (`mobile/lib/firebase-native.ts`) calls `user.getIdToken()` with **no argument**, which returns the **cached** token and refreshes only near expiry — so a token minted *before* verification can still carry `email_verified: false`. A **forced refresh** (`getIdToken(true)`) is the shape RG-9 requires; that is an N-5 change to the boundary module, **not** a guard change. |
| **F-15** | **N-5 does not need the N-3-style guard relaxation.** `sendEmailVerification` and `reload` are **not** in the Phase 1 `FORBIDDEN` verb map, which forbids `sendSignInLinkToEmail`, the auth-state listeners, `setPersistence`, `reauthenticateWith`, `deleteUser(`, `updateEmail(`, `verifyBeforeUpdateEmail(`, `linkWithCredential` and `unlink(`. Recorded so a future implementer does not assume an edit is owed. |
| **F-16** | **There is no verify screen and no verification gate today.** `mobile/app/` holds `index`, `login`, `register`, `register-firebase`, `forgot-password`, `reset-password`; the only `(app)` guard is `status !== 'signedIn' ⇒ /login`. `firebaseAuth.service.ts` states in place that it persists `emailVerified` and **does not enforce** it. |

**What this decision does NOT authorise.** No implementation; **N-5 remains unauthorised** and still
depends on **N-4** and on **B-2/L-17** for its delivery half. No change to `requireAuth`,
`constants/roles.ts`, the mobile RBAC mirror, `session.service.ts` / `session.model.ts`,
`config/jwt.ts`, the global error envelope or any client-facing error code. No removal of the legacy
register path or of the 26B/27 stack. No Firebase Console change. No new dependency, schema field,
index or environment variable — `emailVerified` already exists on the `users` model (Phase 32B) and is
**persisted but not enforced**.

### N-4 D2 — the recovery-context caller RESOLVED (2026-09-29, Phase 32P)

**Documentation only.** No code, test, schema, dependency, environment variable, Firebase Console
setting, EAS configuration or deployment change was made for this record. The authoritative record is
design **§14C.3.8**; the shipped-record counterpart is `docs/DEVELOPMENT_ROADMAP.md` **§27W**.

**The gap.** The bridge (`POST /api/auth/credentials-changed`) is an **authenticated** route, so it needs
a live Inventory AI session — correct for the in-app password *change*, but **unsatisfiable for the
primary password-*reset* flow**: `forgot-password` and `reset-password` are **public** screens, the reset
completes inside Firebase, and the reset screen clears the local session before returning to Login. At
the instant the password changes the caller holds **nothing**, so a Firebase-native reset would have
revoked **nothing**, leaving every prior session — including an attacker's — alive. That is **D2**, it
was raised in the N-4 preflight, and it was **undocumented** until this record.

**The approved sequence (locked), and the distinction it requires.** The fix is to **establish an
authenticated context first**, never to relax authentication: after the reset the user **signs in again
with the new password** → the app takes a **fresh Firebase ID token** (which is also what makes the
**300-second `auth_time` freshness** condition satisfiable) → the **public exchange** mints a
**temporary recovery-context session** → the **bridge** stamps `passwordChangedAt` and calls
`revokeAllSessions()`, which revokes **all** sessions **including that temporary one**
(`revokeAllSessions` has **no caller exception**) → the **re-exchange** mints the **final** session,
valid because its `iat >= changedAtSec`. The recovery-context session is **structurally an ordinary
session** — **no new session type, no new field, no “recovery” flag** — so §20's frozen session surface
is untouched. A client that stops after the bridge has revoked everything *and* signed itself out:
**loud and recoverable** (sign in again — the exchange needs only an ID token), **never silent**.

**Restated as still binding — not newly decided.** `passwordChangedAt` **and** `revokeAllSessions()`
remain the **N-4 invariant**; a Firebase ID token is **never** the application's permanent bearer
credential; the **Firebase UID → MongoDB `User`** binding stays authoritative
(`verifyFirebaseIdToken(idToken).uid` must equal `User.findById(req.user.id).firebaseUid`, with no email
join and no client-supplied identity, tenant or role); **no public unauthenticated
`credentials-changed` endpoint** is introduced (§14C.3.6's rejection **stands**); and **no Cloud
Function / Admin-SDK trigger** is introduced (§14C.3.6's rejection **stands**).

**New findings recorded by this decision**

| # | Finding |
| --- | --- |
| **F-17** | **The reset flow's bridge call is bounded by the 300 s freshness window, and it must not be widened for recovery.** If the user takes longer than `FIREBASE_REAUTH_WINDOW_SECONDS` between signing in again and calling the bridge, the bridge answers `409 FIREBASE_REAUTHENTICATION_REQUIRED`; the correct response is to sign in again. Separately, if the bridge's response is lost the retry arrives with the stale pre-bridge token and is answered `401 SESSION_INVALIDATED`, which is **success-equivalent** and must proceed to the re-exchange — the §14C.3.5 rule, now covering recovery too, still **to be pinned by a test**. |
| **F-18** | **D2's remaining piece is the trigger, and it is recorded as OD-9 rather than chosen silently.** How the client knows, at the post-reset sign-in, that it must run the bridge is **not** settled. Any solution must **not** be a public/unauthenticated route, must **not** let a client-supplied value steer a bridge call against an account (the account is always `req.user.id`), must **not** mint a session outside `POST /api/auth/firebase/exchange`, must **not** add a field to `sessions`/`User` without a separately-approved phase, and must make skipping the bridge **impossible or detectable**. *(**Superseded 2026-09-29 (Phase 32Q, §14C.3.9):** the trigger is now **LOCKED** — the durable, non-secret recovery marker, **M-1…M-10** — and it satisfies each constraint listed here.)* |

**What this decision does NOT authorise.** No implementation; **N-4 remains unauthorised**. No change to
`requireAuth`, the session model/service, `constants/roles.ts`, the mobile RBAC mirror, `config/jwt.ts`,
the error envelope or any client-facing code. No new route, session type, field, dependency or
configuration. No Firebase Console change. **D2's closure is architectural (reachability) only** —
nothing was built, and **L-17 remains OPEN**.

### Recovery-request failure investigation (2026-09-29) — one real defect fixed, one legacy limit documented

**The report.** `jeffern123@owner.com` appeared to complete a recovery request; every other address,
including a working Gmail, answered the single generic sentence `Unable to send the reset link. Please
try again.` The underlying worry was that legacy MongoDB accounts cannot use Firebase recovery. The
authoritative record is design **§14C.4.3**; **only two mobile files changed** — no server file, route,
permission, schema, dependency, environment variable, Firebase Console setting or EAS configuration.

**Measured, not assumed.** The served development bundle inlines the Firebase project id, so a
configured build takes the **Firebase** path and the 26B endpoint is unreachable in it. The project's
own `accounts:sendOobCode` answers **HTTP 200 for an address with no account** when called with the
app's exact parameters (and `400 INVALID_EMAIL` for a malformed one), which means **email-enumeration
protection is ON** for this project. The deployed 26B endpoint answers **503 `MAIL_NOT_CONFIGURED` for
every address** — that check runs before the account lookup — so the fallback cannot send mail in
production either, and it would surface the server's own sentence rather than the generic one.

| # | Finding |
| --- | --- |
| **F-17** | **`auth/email-not-found` was unclassified. FIXED.** The Identity Toolkit answers `EMAIL_NOT_FOUND` for an address with no account; the **JavaScript** SDK normalises that onto `auth/user-not-found`, but the **native** Android mapping does not — it lowercases and de-hyphenates the code and rewrites only the codes it names explicitly. So `INDISTINGUISHABLE_CODES` was complete for an SDK this app no longer ships and incomplete for the one it does. The effect was a wrong message **and a rebuilt enumeration oracle** — only addresses that exist reached the success state — for exactly the population the flow is meant to help. Now listed in `INDISTINGUISHABLE_CODES` and in `INVALID_ACTION_CODE_CODES`, so requesting a link and redeeming it cannot disagree. Nothing is weakened: the code is answered *sent*, the same answer Firebase's own protection gives that address. |
| **F-18** | **The client discarded the failure code. FIXED.** Every failure was reduced to safe copy while the decided code was dropped, so four causes rendered identically on a device and this investigation had to be done by reading the platform's error mapping by hand. `app/forgot-password.tsx` now renders a second, **`__DEV__`-only** element naming the source and the code (`firebase: …` / `server: …`, or `(no code)` when the failure was not a Firebase rejection). The person's sentence is byte-identical with and without it, it does not exist in a release bundle, and it can carry no address, token, password or SDK message. Guarded by `phaseN3-recovery-screens.test.tsx` and pinned in source by the N-3 suite. |
| **F-19** | **A Mongo-only account has no password authority to exercise, and this is a design limit rather than a bug.** With enumeration protection ON the request answers `200` and **nothing is sent**; the screen shows the fixed sentence, and there is neither an error nor an email. No code is changed for it: **no auto-linking on an email match** (§14A.3/R-7), **no migration**, no restoration of the 26B/27 reset path, and Firebase **remains the password authority**. The remedy is the invitation path (**L-12 / N-9**). Separately and more sharply: an account that acquires a Firebase identity still carries no `firebaseUid`, so the exchange answers `REGISTRATION_REQUIRED` and legacy login is refused `FIREBASE_SIGN_IN_REQUIRED` — **unreachable until an operator gives it an identity.** |

**Environment finding from the same session, and it is NOT a Firebase matter.** *(Corrected 2026-10-07:
this passage previously said `MONGODB_DB_NAME` was empty and that development therefore resolved to
`inventoryai_dev_db`. The working tree says otherwise, and the correction is the more important
statement — see the operational consequence at the end of this note.)* `server/.env` sets
`NODE_ENV=development` **with `MONGODB_DB_NAME=inventoryai_test_db` set explicitly**, so the development
server resolves to the **test** database. The resolver's rule is exactly this: *a test run always uses
the test database; otherwise an explicit `MONGODB_DB_NAME` wins; otherwise `NODE_ENV` decides* — and here
the value is explicit, so `inventoryai_dev_db` has **never** been used. That is why a read-only listing
of the cluster shows `inventoryai_prod_db` and `inventoryai_test_db` — the two environments something has
written to — and **no `inventoryai_dev_db` and no legacy `inventory_ai`**. MongoDB creates a database on
first write, so an environment that has never been used is **absent, not broken**; **no configuration was
changed to make it appear or disappear**, and no credential or URI value is recorded here.

**Operational consequence (the reason this correction matters).** Local development and
`npm run test:db` currently resolve to the **same** database, so a running development server and a
DB-backed test run write to the same collections. Run `npm run test:db` with the development server
stopped, and give development its own `MONGODB_DB_NAME` if that sharing is not wanted. This is a
configuration observation, not a defect: the test run is still fail-closed by name — a test process
refuses to connect anywhere except `inventoryai_test_db`.

### OD-9 LOCKED — the automatic recovery marker (2026-09-29, Phase 32Q)

**Documentation only.** No code, test, schema, dependency, environment variable, Firebase Console
setting, EAS configuration or deployment change. Authoritative record: design **§14C.3.9**
(**M-1…M-10**); phase record: `docs/DEVELOPMENT_ROADMAP.md` **§27X**.

**OD-9 is the one question D2 left open** — how the client knows, at the post-reset sign-in, that it must
run the bridge. It is now **locked**.

**M-1 — durable, non-secret recovery marker.** `expo-secure-store`, key
**`inventoryai.auth.passwordResetPending`**, holding **only an account fingerprint** (a hash of the
reset account's email) — **no password, no `oobCode`, no Firebase ID token, no Inventory AI JWT, no
`userId`, no `businessId`, no `role` and no tenant data**. It is a **flow selector, never a credential**,
and it is **never** proof of identity or authorization.

**M-2 — created with `verifyPasswordResetCode(oobCode)`.** Supported natively on **Android and iOS**,
returning the account's **email**. The email is **memory-only** (automatic sign-in + fingerprint) and
**never becomes an authorization source**; the server still derives the account exclusively from
`requireAuth → req.user.id → Mongo User → firebaseUid`, and no client-supplied `userId`, `businessId`,
`role` or tenant can steer which account is revoked.

**M-3 — F1 automatic recovery approved.** `verifyPasswordResetCode → write marker →
confirmPasswordReset → signInWithEmail → temporary public exchange → credentials-changed →
revokeAllSessions → final public exchange → applySession(final)`.

**M-4 — the temporary session is a local variable** — never persisted, never passed to `applySession`,
never navigated with, never placed in route params. `revokeAllSessions()` revokes it together with
every other active session because it has **no caller exception**.

**M-5 — `401 SESSION_INVALIDATED` is success-equivalent** for a retry after a previously successful
bridge: clear the marker and continue to the final exchange.

**M-6 — lifecycle:** created **before** the password-change operation; cleared after a successful bridge
acknowledgement or `401 SESSION_INVALIDATED`; **kept** on `409 FIREBASE_REAUTHENTICATION_REQUIRED` and on
transport failure; **never consumed on a fingerprint mismatch**; and the **legacy `?token=` recovery must
never create it**, because that server flow already performs the revocation.

**M-7 — the cross-device limitation, stated so OD-9 is not overstated.** A reset on **Device A**
followed by the first password sign-in on **Device B** **cannot be detected** by this client-local
marker, so no bridge runs there. **OD-9 closes D2 for the device that completed the recovery** (and that
device's later sign-ins) and covers every interruption state **on that device**; it is **not** a
universal cross-device revocation guarantee.

**M-8 — Option E is DEFERRED.** Server-side `passwordUpdatedAt` derivation would close M-7, but it needs
a Mongo field plus an extra Firebase Admin lookup (and a partial N-4 redesign). **Nothing of it is
introduced** — no field, no lookup — and it is recorded as a **separate future owner decision**.

**M-9 — N-4 architecture unchanged:** `requireAuth`, `passwordChangedAt`, `revokeAllSessions()`, the
UID→Mongo `User` mapping, Mongo business/role authority and the JWT/session architecture all stay as
they are. **No new session type and no new session field**; the marker lives on the client, never on
`sessions`.

**M-10 — L-17 remains the end-to-end gate**, and it gains one requirement: the live device test must
confirm **`verifyPasswordResetCode()` returns the correct email and does not consume the reset code**.
If it ever proved destructive the failure is safe and retryable (`auth/invalid-action-code` → the
screen's existing *"invalid or has expired"*).

**New findings recorded by this lock**

| # | Finding |
| --- | --- |
| **F-19** | **The marker is device-local, so D2 retains one residue that no client-side mechanism can close** (M-7): a reset completed on one device with the next sign-in on another leaves the old sessions alive until a bridge runs on the completing device. |
| **F-20** | **Option E is the only identified way to close F-19 without the forbidden constructs** — it introduces no public endpoint, no Function/trigger, no second credential, no client-supplied identity and no email authority — but it costs a `User` field and a Google round trip on the sign-in path, and it would make the bridge largely redundant. **Deferred, not adopted.** |
| **F-21** | **`verifyPasswordResetCode` is a new runtime dependency of the design** (it supplies both the sign-in email and the fingerprint). It is present on Android and iOS in the installed SDK, but **its non-destructiveness has never been exercised against a live project**, which is why M-10 adds it to L-17. |
| **F-22** | **A forced token refresh must never be substituted for the recovery sign-in.** `getIdToken(true)` moves `iat` but **leaves `auth_time` alone**, so it satisfies neither the bridge's 300 s freshness check nor the “authenticated with the NEW password” premise. |

**What this lock does NOT authorise.** No implementation; **N-4 remains unauthorised**. No change to
`requireAuth`, the session model/service, `constants/roles.ts`, the mobile RBAC mirror, `config/jwt.ts`,
the error envelope or any client-facing code. No new route, session type, field, dependency,
configuration or Mongo field. No Firebase Console change and no Admin lookup. **L-17 stays OPEN**, and
**D2's residue (F-19) stays documented**.

### What is UNCHANGED, and must be

`middlewares/authenticate.ts` (check order, codes, `req.user`/`req.auth` shapes); `session.service.ts`
and `session.model.ts`; `config/jwt.ts`; `constants/roles.ts` and the mobile RBAC mirror; the Phase 23
route classification; the §14.1 password-authority guard **while the legacy path still exists**; the
global error envelope; and every client-facing error code. **L-8 is an instruction to preserve these,
not a licence to relax them.** **No Firebase custom claim is introduced (L-18).**

### What this decision does NOT authorise

**No implementation.** No route, service, validator, screen or test may be added on the strength of
this section. No Firebase Console change. No removal of the legacy path, the recovery endpoints, the
reset-token model or the Resend mail layer — every one of those artefacts **still exists and still
works**, and its disposition is **OD-5**. No weakening of the §14.1 guard. No claim that the
action-link flow works (**L-17** is a live-test gate that is **still open**: N-2 verified the Android app/OS
side on 2026-09-29 but the **Firebase email side was never exercised** — see §39 finding F-8 and design
§14C.4.1).

### Changed in this reconciliation

This new §39; the §11 (O-8/O-9 + Firebase-native reset rows), §22 (O-6/O-8/O-9 rows), §23
(`checkRevoked` row), §27 (O-3, O-8, O-9, O-10 rows), §G-5 and §"Decision Required" updates; and the
corresponding pointers in `docs/superpowers/specs/2026-09-18-firebase-auth-design.md` §14.1 / §14A.5 /
§18 / §21 / the new §14C, `docs/DEVELOPMENT_ROADMAP.md` §27U, `docs/SYSTEM_SPECIFICATION.md` §29,
`CLAUDE.md` §2 and `README.md`. **§0–§38 behaviour and security tables, §28 deferred work, §29 phase
history, §35 conflicts and §36/§37 are otherwise unchanged**, no owner decision was silently reopened,
and **no secret value is recorded**.

> **Added 2026-09-29 (Phase 32O) to §39.** The *Registration & email verification — OD-3 RESOLVED*
> subsection and its findings **F-14…F-16**; the O-3 row (now resolved outright), the G-5 row and the
> **Decision Required** list in this checklist; and the corresponding pointers in
> `docs/superpowers/specs/2026-09-18-firebase-auth-design.md` **§14C.9** (plus the §14C.6 N-5, §14C.7
> OD-3 and §14A.5 O-3 annotations), `docs/DEVELOPMENT_ROADMAP.md` §27U,
> `docs/SYSTEM_SPECIFICATION.md` §29, `CLAUDE.md` §2 and `README.md`. The text above this note is the
> Phase 32N record and is **not** rewritten; **no production, test, schema, dependency, Console, EAS or
> deployment change was made**, and **no secret value is recorded**.

> **Added 2026-09-29 (Phase 32P) to §39.** The *N-4 D2 — the recovery-context caller RESOLVED*
> subsection and its findings **F-17/F-18**; the §39 title; and the **G-5** and **Decision Required**
> register mentions of **OD-9**; with the corresponding pointers in
> `docs/superpowers/specs/2026-09-18-firebase-auth-design.md` **§14C.3.8** (plus the §14C.3.1, §14C.6
> N-4 and §14C.7 rows), `docs/DEVELOPMENT_ROADMAP.md` **§27W**, `docs/SYSTEM_SPECIFICATION.md` §29,
> `CLAUDE.md` §2 and `README.md`. The text above this note is the Phase 32N/32O record and is **not**
> rewritten; **no production, test, schema, dependency, Console, EAS or deployment change was made**,
> and **no secret value is recorded**.

> **Added 2026-09-29 (Phase 32Q) to §39.** The *OD-9 LOCKED — the automatic recovery marker* subsection
> and its findings **F-19…F-22**; the §39 title; the **G-5** and **Decision Required** register mentions
> of **OD-9**; the added **L-17** requirement (`verifyPasswordResetCode` must return the correct email
> **without consuming the code**); and the corresponding pointers in
> `docs/superpowers/specs/2026-09-18-firebase-auth-design.md` **§14C.3.9** (plus the §14C.3.8 tail,
> §14C.4 and the §14C.7 OD-9 row), `docs/DEVELOPMENT_ROADMAP.md` **§27X**,
> `docs/SYSTEM_SPECIFICATION.md` §29, `CLAUDE.md` §2 and `README.md`. The text above this note is the
> Phase 32N/32O/32P record and is **not** rewritten; **no production, test, schema, dependency,
> Console, EAS or deployment change was made**, and **no secret value is recorded**.

---

## 40. AUTH-04 — CUSTOM 6-DIGIT EMAIL VERIFICATION CODE (SUPERSEDES THE FIREBASE VERIFICATION-LINK FLOW) — 2026-10-02

**Documentation only.** No application, mobile or server source, test, dependency, schema, index,
environment variable, Firebase Console setting, EAS configuration or deployment change was made for this
record, and no secret value is recorded. It is the checklist counterpart of the design authority's
**§14C.10**.

**What is superseded.** §39's registration/email-verification record (RG-9 / RG-12 / RG-13 and its OD-3
resolution) selected the **native Firebase verification email/link and native resend**. That mechanism is
**superseded**: email verification is a **custom 6-digit Inventory AI code delivered through Resend**,
with Firebase Admin `updateUser(uid, { emailVerified: true })` setting the final Firebase verification
state. **Do not** re-derive the link flow from §39; it is preserved there as the historical record only.

**Preserved (unchanged).** Firebase is the identity provider; MongoDB/backend is the application
authority; `firebaseUid` is the only Firebase→MongoDB join key and email is never one; the Inventory
JWT/session is separate from the Firebase ID token; **`requireAuth` is not modified**; verification is
decided from the signed claim, never the provider name; no custom claims, Cloud Function or custom
long-lived refresh token.

**Recorded design (design authority §14C.10, AD-1…AD-19).** CSPRNG 6-digit code · HMAC-SHA256 with domain
separation (`codeHmac`/`emailHmac`) · required `EMAIL_VERIFICATION_CODE_PEPPER` (503
`EMAIL_VERIFICATION_NOT_CONFIGURED`, no unkeyed fallback, production fail-fast) · 10-minute expiry ·
5 attempts · 60-second resend cooldown · one active challenge per uid in `email_verification_challenges`
· unique `{uid}` index + TTL `{expiresAt}` index (cleanup only) · atomic supersession and atomic attempt
reservation · write-first/consume-second with `usedAt` never unset · concurrency-safe confirmation ·
already-verified idempotency · no plaintext code/email/pepper at rest or in logs · allowlisted structured
logging.

**API contract.** Two **pre-session Firebase-authenticated** (not public) endpoints:
`POST /api/auth/email-verification/request { idToken }` and
`POST /api/auth/email-verification/confirm { idToken, code }`. No `requireAuth`, no Inventory session, no
client-controlled uid/email/userId/businessId/role; confirmation creates no session. Error codes: 400
`FIREBASE_TOKEN_INVALID` · 503 `FIREBASE_NOT_CONFIGURED` · 503 `FIREBASE_UNAVAILABLE` · 400
`FIREBASE_TOKEN_INVALID` (Admin user-not-found/disabled) · 503 `FIREBASE_NOT_CONFIGURED` (Admin
invalid-credential) · 503 `FIREBASE_UNAVAILABLE` (other Admin write failure) · 400
`INVALID_VERIFICATION_CODE` · 503 `EMAIL_VERIFICATION_NOT_CONFIGURED` · 429
`EMAIL_VERIFICATION_RATE_LIMITED` · 503 `EMAIL_VERIFICATION_MAIL_FAILED`.

**Mail.** Delivered by Inventory AI through the existing provider-agnostic mail boundary
(`services/mail/`), extended with a template and `sendEmailVerificationEmail`. **Brevo is a supported
provider and was the provider used for the AUTH-04-G live acceptance; Resend remains a supported
provider.** Configuration failure fails **before** minting a code (existing challenge untouched); a
delivery failure after creation leaves the new challenge current, does not restore the old one, applies
no rollback, and keeps the cooldown.

**Status (AUTH-04-H close-out, 2026-10-04).** **SHIPPED.** AUTH-04-A (challenge primitives), AUTH-04-B
(Firebase Admin bridge + challenge-domain lifecycle), AUTH-04-C (HTTP surface), AUTH-04-D (rate
limiting), AUTH-04-E (server hardening close-out) and AUTH-04-F (mobile verification flow) are shipped;
**AUTH-04-G PASSED its live end-to-end acceptance gate (2026-10-04, Brevo)** — request HTTP 200 with the
exact success envelope, Brevo `sent` → `delivered`, confirmation HTTP 200 with `Email verified.`, Firebase
`emailVerified` false → true, the Mongo challenge consumed, and safe-log checks passed. **AUTH-04-H**
(this close-out) reconciles the status statements. The route, model, indexes, tests and `.env.example`
names all exist.

**Resolved decision — restart while unverified (AUTH-04-F, shipped).** The earlier open question is
**closed by the shipped AUTH-04-F behaviour**: on restart, when no Inventory AI session token exists, the
native Firebase identity is probed **read-only**; an **unverified** identity **resumes the verification
screen**, a **verified** identity goes to **Login** for a user-driven exchange, and a **probe failure**
produces the unreachable verification state. The probe performs **no automatic sign-in, exchange or
session restoration**.

---

## 41. C3 — MOBILE SIGN-IN VOCABULARY STANDARD & THE WIDENED LOCAL-PASSWORD GATE (2026-10-07)

**Mobile presentation and gating only.** No server file, route, permission, role grant, session, schema,
index, environment variable, dependency, EAS configuration or deployment setting changed, and **no new
authentication capability was added**. The server remains the security boundary; this section records the
words the app uses and the condition under which it offers a local password action. Shipped record:
`docs/DEVELOPMENT_ROADMAP.md` **§27Z**.

**The vocabulary standard.** The Profile identity area is a **"Sign-in methods"** section ("Manage the ways
you can sign in to your Inventory AI account.") that names methods in user terms: **"Email & Password"**
with the existing **"Change password"** action; **"Google sign-in"** ("Use your Google account to sign in
to Inventory AI.") with the action **"Add Google sign-in"**; and **"Change sign-in password"**, the title of
the provider-held branch and of the `disconnect-firebase` screen. A separate **"Security"** card holds the
device-storage statement and **"Active sessions"**. The retired wording is pinned out: **no** "Connect
Google" as the app-facing action, **no** "Disconnect Firebase", and no `disconnect` substring on the
Profile surface at all.

**Rule — no provider is named where the provider is not known.** `authMethods` publishes a capability, not
the identity behind it, so a provider-held credential could be Google **or** a Firebase email/password
identity and the app cannot tell them apart. For `{ password: false, firebase: true }` the rendered surface
must contain neither `google` nor `firebase`.

**The widened gate.** The shipped condition is exactly
`user?.authMethods?.password === false || user?.authMethods?.firebase === true`. The first half is Phase
32K's; the second is defensive and is the point of the pass: `{ password: true, firebase: true }` is a
legacy password account that later attached a Firebase identity, whose retained `passwordHash` is **inert**
— `loginWithPassword` refuses it with 403 `FIREBASE_SIGN_IN_REQUIRED` (Phase 32E) and `/change-password`
answers 409 `PASSWORD_NOT_APPLICABLE` (Phase 32K) **before** any hash comparison — so it has no local
password to manage. **Capability is not credential existence:** a Firebase-linked account still retains its
legacy hash, and `password: false` does not mean "no credential exists".

**Authority and guards — unchanged by C3.** `authMethodsFor`
(`server/src/services/auth.service.ts:230`) derives `{ password: !firebaseUid, firebase: Boolean(firebaseUid) }`,
so the current server produces only the two complementary shapes and the widened branch covers a shape it
does not produce. Mongo-only accounts keep the local bcrypt/password authority; Firebase-linked and
Firebase-native accounts have Firebase as password authority. The server guards and their meanings are
preserved exactly as Phases 32E/32K pin them.

**Verification (mobile only).** `auth-terminology-standard` (new, 182 lines, 5 cases),
`phase32k-password-capability-gating`, `phase32m-connect-google-profile` and `phaseA-change-password-screen`
— **4 suites / 29 tests, 0 fail**; full `npx jest` — **47 suites / 644 tests, 0 fail**; `tsc --noEmit` and
`eslint .` clean. **No server suite was run for this pass**, because no server file changed. Commit
`ca0d4ae` — `refactor: standardise the mobile sign-in vocabulary and gate local password actions` — 7 files,
+312/−59.

session restoration**.

---

> **MAINTENANCE.** This is a living navigation document. On any authentication/security change:
> reconcile against evidence, update only evidence-supported statuses, record newly completed and
> remaining work, preserve unresolved decisions and deferred items, update external-verification
> status, the current authorised phase and the next-work gate, and **never** silently remove
> historical work, mark code-only work as externally verified, or mark planned work as authorised.
> Read this checklist before starting any future authentication/security implementation; if the
> requested work conflicts with it or with existing architecture, **STOP and report the conflict.**
