# Inventory AI — Authentication & User Verification Target Architecture

**Status:** APPROVED TARGET ARCHITECTURE
**Scope:** User Authentication, User Verification, Application Sessions, Credential Recovery, Authorization Boundary, and Related Security/UX Contracts
**Implementation Status:** Architecture approved; implementation proceeds in controlled phases.

---

## 1. Purpose

This document defines the approved target architecture for Inventory AI authentication and user verification.

It is the source of truth for future implementation work related to:

* user registration
* email/password authentication
* email verification
* Owner/Admin/Manager/Staff authentication
* Firebase identity handling
* Inventory AI application sessions
* Inventory JWTs
* session renewal
* password change
* password reset
* logout
* session revocation
* account/business status
* rate limiting
* authentication error handling
* tenant isolation
* legacy authentication retirement

Existing implementation is evidence only. It must not override this target architecture when the existing implementation conflicts with it.

---

# 2. Core Authority Model

Inventory AI uses three distinct authority layers.

## 2.1 Firebase Authentication — Identity Authority

Firebase Authentication answers:

> Who is this authenticated person?

Firebase owns:

* Firebase UID
* Email/password credentials
* Google authentication when later implemented
* Firebase authentication sessions
* email verification state
* password reset
* password changes
* provider identity
* Firebase-side credential revocation

Firebase UID is the permanent identity link to the Inventory AI user.

---

## 2.2 Inventory AI Backend/MongoDB — Application Authority

The Inventory AI backend answers:

> What is this authenticated user allowed to do inside Inventory AI?

MongoDB/backend owns:

* User
* Business
* business membership
* role
* account status
* permissions
* business lifecycle/status
* application-specific authorization

The client must never be trusted to choose or override:

* userId
* businessId
* role
* OWNER status
* permissions

---

## 2.3 Inventory AI Session/JWT — Application Access Authority

Inventory AI maintains its own application session.

The Inventory JWT provides short-lived API access.

The Inventory session provides server-side application session control, including:

* device/session identity
* revocation
* expiration
* logout
* logout everywhere
* application session auditing

---

# 3. Identity Rule

The identity relationship is:

Firebase UID → MongoDB User.firebaseUid

Email must NOT be used as the identity join key.

Inventory AI must never automatically link accounts merely because email addresses match.

Provider linking, including future Google linking, must be explicit and authenticated.

---

# 4. Authentication vs Authorization

Authentication answers:

> Who are you?

Authorization answers:

> What are you allowed to do?

All human users use the same authentication mechanism:

* Owner
* Admin
* Manager
* Staff

They authenticate through Firebase Authentication using their own credentials.

Their role and permissions are separately determined by the Inventory AI backend.

---

# 5. User Authentication Model

The initial authentication method is:

**Email & Password**

The general flow is:

User credentials
→ Firebase Authentication
→ Firebase UID
→ Firebase ID token
→ Inventory AI backend
→ Firebase token verification
→ application authorization checks
→ Inventory AI session
→ Inventory JWT

MongoDB must not become a second password authority.

---

# 6. Email Verification

Email verification is required before an Inventory AI application session can be created or renewed.

The mobile client may check verification status for UX purposes, but the backend is the security boundary.

The backend must verify the Firebase ID token and its verification state.

Email verification proves:

> The user controls the email address associated with the Firebase identity.

Email verification does NOT itself grant:

* OWNER role
* ADMIN role
* business membership
* permissions

Those are application authorization decisions.

Firebase is the target authoritative source for authentication email verification.

The existing MongoDB email verification field is considered migration-era duplication and may eventually be retired after all dependencies are removed.

---

# 7. Owner Registration

The initial Owner registration flow is:

1. User enters email and password.
2. Firebase creates the authentication identity.
3. Firebase sends email verification.
4. User verifies the email.
5. Mobile reloads/refreshes the Firebase user state.
6. Backend verifies the Firebase identity and verified-email state.
7. Backend provisions the new Business and User.
8. Backend assigns the initial user as OWNER according to the server-controlled registration flow.
9. Backend creates an Inventory AI session.
10. Backend issues an Inventory JWT.
11. User enters the application.

The client must not be trusted to assign itself OWNER.

---

# 8. Admin, Manager, and Staff Authentication

Owner, Admin, Manager, and Staff use the same Firebase authentication mechanism.

Each human user has:

* their own Firebase UID
* their own email
* their own authentication credentials
* their own verified email
* their own Inventory AI User record
* their own role/business membership

When an existing authorized user creates/invites another user, the creator does not create or know the new user's permanent password.

The invited user establishes their own authentication credentials and verifies their own email.

The backend assigns the invited user's:

* businessId
* role
* status
* permissions

based on the authorized provisioning/invitation flow.

Example hierarchy:

Owner → may provision/invite Admin
Admin → may provision/invite Manager/Staff according to permissions
Manager → may provision/invite Staff according to permissions

Exact RBAC permissions are a separate authorization design and must remain server-controlled.

---

# 9. Firebase Token Verification

Every Firebase ID token presented to the Inventory AI backend must be verified server-side.

The target verification behavior uses Firebase Admin verification with revocation checking enabled:

verifyIdToken(idToken, true)

The backend must validate the expected Firebase token claims/environment, including:

* audience
* issuer
* subject/UID
* issued-at
* expiration
* authentication time

The Firebase UID from the verified token must match the MongoDB user's firebaseUid.

No email-based identity matching is allowed.

---

# 10. Firebase Revocation

Firebase revocation checking is a security boundary.

A stale/revoked Firebase credential must not be able to create a new Inventory AI application session.

Target behavior:

Revoked Firebase token
→ Firebase verification with revocation checking
→ reject
→ no Inventory session

Normal Inventory API requests do not call Firebase.

Firebase verification is performed when Firebase credentials are presented for authentication/session operations.

---

# 11. Inventory JWT

Inventory JWTs are application access tokens.

Target claims:

* sub
* jti
* iat
* exp
* iss
* aud

Authorization data must not be treated as authoritative JWT claims.

Do not place authoritative:

* role
* businessId
* permissions

inside the JWT.

Authorization is derived server-side from the authenticated application identity and MongoDB state.

---

# 12. Inventory Session

Each Inventory JWT must correspond to a live Inventory AI session.

Target session concept:

* userId
* jti
* deviceLabel
* createdAt
* lastUsedAt
* expiresAt
* revokedAt

The session jti uniquely identifies the application session.

A revoked session must not be usable.

A new JWT must not resurrect a revoked session.

---

# 13. JWT Lifetime

Approved target:

**Inventory JWT lifetime: approximately 1 hour.**

Short JWT lifetime reduces the useful lifetime of a stolen application access token.

Because the JWT is short-lived, session renewal is required.

---

# 14. Absolute Session Cap

Approved target:

**Inventory session absolute cap: 14 days.**

JWT renewal must not make an individual Inventory session immortal.

Example:

1-hour JWT
→ renewal
→ renewal
→ renewal
→ ...
→ maximum 14-day session lifetime
→ session can no longer renew

After the session reaches its absolute cap, the user may authenticate through Firebase again and obtain a new Inventory session.

The absolute cap belongs to the Inventory session, not the human account.

---

# 15. Session Renewal

The preferred renewal architecture is proactive renewal before JWT expiration.

A valid, unexpired Inventory JWT can access the renewal endpoint.

The renewal flow:

1. Mobile detects that the JWT is approaching expiration.
2. Mobile performs one controlled renewal operation.
3. Backend validates the current Inventory session.
4. Backend verifies the presented Firebase ID token.
5. Firebase revocation checking is enabled.
6. Firebase UID matches the application user.
7. Firebase email remains verified.
8. Backend issues a new Inventory JWT.
9. The existing session jti is retained.
10. The session row is not unnecessarily recreated.

Renewal must not create a new session row for every JWT renewal.

---

# 16. Expired JWT

An expired Inventory JWT must not be passed through a special expired-JWT renewal mechanism.

If the Inventory JWT is already expired:

1. Mobile determines that recovery may be possible.
2. Firebase may still have an authenticated session.
3. Mobile obtains a current Firebase ID token.
4. Mobile performs the normal Firebase exchange.
5. Backend verifies Firebase identity/revocation/verification.
6. Backend creates a new Inventory session.
7. Backend issues a new Inventory JWT.

This keeps the architecture simple and avoids custom long-lived backend refresh tokens.

---

# 17. No Custom Backend Refresh Token

Inventory AI will not introduce a separate long-lived custom backend refresh token for this architecture.

Firebase already provides the underlying authenticated identity/session mechanism.

Inventory AI uses:

* short-lived Inventory JWT
* server-side Inventory session
* Firebase-backed renewal/re-exchange

---

# 18. Mobile Authentication State

The client should conceptually distinguish:

* SIGNED_OUT
* SIGNED_IN
* RENEWING
* DEGRADED
* REAUTH_REQUIRED

Transient Firebase/network failures must not unnecessarily destroy a still-valid Inventory session.

If the Inventory JWT remains valid, normal application access should continue where possible.

If authentication becomes terminally invalid, the user must be signed out/re-authenticated.

---

# 19. Transient vs Terminal Authentication Failures

Authentication errors must be classified.

## Terminal

Examples:

* Firebase credential revoked
* Firebase token invalid
* account disabled
* authentication identity deleted where applicable
* Inventory session revoked
* Inventory session invalidated

These may require sign-out or re-authentication.

## Transient

Examples:

* network failure
* Firebase temporary outage
* backend temporary outage
* timeout
* service unavailable

Transient failures must not automatically clear a valid Inventory session.

Unknown Firebase/backend failures should not be treated as terminal unless there is evidence that the authentication state itself is invalid.

---

# 20. Password Change

Firebase owns the user's authentication password.

Target flow:

1. User chooses Change sign-in password.
2. User performs the required recent-authentication confirmation.
3. Firebase updates the password.
4. Firebase automatically advances the credential validity boundary.
5. React Native Firebase remains signed in and adopts the replacement credential.
6. The current post-change Firebase credential can be presented to the backend.
7. Backend verifies it with revocation checking.
8. Inventory application session invalidation is performed.
9. Existing Inventory sessions are revoked as required.
10. A fresh Inventory session is created.
11. User continues with the new application session.

Physical Android/RN Firebase testing confirmed that the post-change credential is accepted by the backend with Firebase revocation checking enabled.

Therefore:

* mandatory post-change re-login is not required
* forced getIdToken(true) is not required for correctness in the tested flow
* explicit revokeRefreshTokens() is not required after password change

These must not be added solely because of the earlier theoretical concern that was disproven by runtime evidence.

---

# 21. Password Reset

Firebase owns password reset.

Target flow:

Forgot Password
→ Firebase password reset email
→ user sets new password
→ Firebase invalidates affected old credentials
→ user signs in again
→ Firebase token
→ Firebase revocation check
→ Inventory session creation

Any local reset marker/bridge used during migration is an optimization only.

The marker must never be the sole security mechanism.

Correctness must remain dependent on Firebase credential validity/revocation and the short-lived Inventory JWT.

---

# 22. passwordChangedAt Retirement

The existing passwordChangedAt field is migration-era behavior.

It must not be removed prematurely.

Retirement sequence:

1. Ensure legacy password change invalidates application sessions correctly.
2. Retire legacy password recovery.
3. Remove passwordChangedAt dependency from authentication middleware.
4. Remove passwordChangedAt writes.
5. Remove the User schema field.
6. Remove related tests/docs/code.

Final Firebase-only architecture should not depend on passwordChangedAt.

---

# 23. Mongo passwordHash Retirement

MongoDB passwordHash is not part of the final credential authority.

The final architecture must not maintain two competing password systems.

Legacy password authentication must be retired safely before passwordHash is removed.

Final state:

Firebase owns the password credential.

---

# 24. Legacy Authentication Retirement

The following are migration-era candidates for retirement:

* legacy Mongo password login
* legacy /api/auth/login
* legacy /api/auth/register
* legacy custom password recovery endpoint
* bcrypt password verification
* passwordHash
* passwordChangedAt
* duplicate Mongo email verification state where no longer needed

Retirement must happen in dependency order.

Do not delete migration dependencies prematurely.

---

# 25. Logout

Logout has two layers.

## Inventory session

1. Revoke the current Inventory session server-side.
2. Clear the local Inventory session.

## Firebase session

3. Sign out the Firebase client session.

If Firebase sign-out fails temporarily, Inventory access must already be cleared.

A pending Firebase sign-out operation may be retried later.

---

# 26. Logout Everywhere

Logout everywhere must revoke all Inventory AI sessions for the user.

Target:

User selects Logout everywhere
→ backend revokes all application sessions
→ local application session cleared
→ Firebase local session signed out

Firebase identity state and Inventory application session state are separate authorities and must not be conflated.

---

# 27. Account Disabled

MongoDB application status controls Inventory AI account access.

If User.status becomes DISABLED:

Firebase identity may still exist and remain valid, but Inventory AI must reject application access.

This is an authorization/application-state decision, not necessarily a Firebase identity failure.

---

# 28. Business Suspension

Business status is independently checked.

A valid Firebase identity and active user do not automatically imply an active Inventory AI workspace.

If a business is suspended/inactive:

* preserve the distinction between authentication and workspace availability
* do not mislabel the condition as an invalid token
* provide an appropriate application-level state/message

---

# 29. Tenant Isolation

The backend must derive tenant authorization from trusted server-side identity/application state.

The client must not choose its own authoritative businessId.

Protected data access must follow the authenticated user's server-side business membership.

Conceptual flow:

Inventory JWT
→ Inventory session
→ authenticated User
→ trusted businessId
→ authorized query

Never use an arbitrary client-provided businessId as the authorization authority.

---

# 30. Registration and Provisioning Correctness

Registration/provisioning must be safe against:

* duplicate taps
* concurrent requests
* retries
* app closure
* network retry
* duplicate users
* duplicate business creation
* partial failures

Frontend validation is UX only.

Backend validation and database uniqueness/constraints are the correctness/security boundary.

---

# 31. Rate Limiting

Backend rate limits must use:

* HTTP 429
* stable application-level error code
* Retry-After when applicable

Example:

RATE_LIMITED
Retry-After: 120

Mobile must translate this into contextual UI.

Example:

> Too many sign-in attempts. Please wait 2 minutes before trying again.

The client must not hardcode the retry duration as the source of truth.

Rate-limit architecture applies to:

* login
* registration
* verification email resend
* password reset
* provider operations
* session renewal
* AI requests
* uploads/imports
* other expensive operations

---

# 32. Authentication Error UX

Raw Firebase/backend errors must never be exposed directly to users.

Examples that must remain internal:

* auth/invalid-credential
* auth/too-many-requests
* FIREBASE_TOKEN_INVALID
* RATE_LIMITED
* HTTP 429
* raw stack traces

Technical errors should pass through an application-level error mapping layer.

Target flow:

Technical error
→ stable application error
→ operation-aware mapper
→ human-readable UI

Messages should communicate, when applicable:

1. What happened
2. Why it happened
3. What the user should do
4. When they can retry

---

# 33. Loading UX

Authentication operations must use contextual loading states.

Examples:

* Signing you in…
* Creating your account…
* Sending verification email…
* Checking your email verification…
* Updating your password…
* Signing you out…

Duplicate actions must be prevented while an operation is in progress.

---

# 34. Error/Warning/Info/Success UX

Messages must be:

* readable
* multiline-safe
* dynamically sized
* accessible
* clearly distinguishable by semantic state

Do not use tiny error text.

Do not use fixed-height containers that clip long messages.

---

# 35. Reactive 401 Handling

The client must not treat every HTTP 401 as a signal to blindly renew.

Examples:

SESSION_EXPIRED
→ controlled recovery/renewal/re-exchange

SESSION_REVOKED
→ sign out

SESSION_INVALIDATED
→ sign out

INVALID_TOKEN
→ sign out

ACCOUNT_DISABLED
→ sign out or appropriate blocked state

BUSINESS_NOT_ACTIVE
→ preserve authentication state but block workspace access

FIREBASE_UNAVAILABLE
→ preserve valid session; retry later

Renewal/recovery paths must not recursively trigger themselves.

---

# 36. SESSION_EXPIRED

The backend should distinguish an expired Inventory JWT from other authentication failures.

SESSION_EXPIRED is recoverable in cases where the Firebase identity remains valid.

Malformed/forged/revoked/invalid sessions must not be treated as ordinary expiration.

---

# 37. Concurrency and Race Conditions

The implementation must explicitly handle:

### Logout during renewal

A stale renewal response must not resurrect a logged-out session.

### Concurrent renewal

Use single-flight behavior so multiple requests do not create competing renewal operations.

### JWT expiry during renewal

Allow one controlled fallback to Firebase exchange.

### Firebase revocation during renewal

Treat as terminal authentication failure.

### Stale mobile responses

Only apply authentication results that still belong to the current authentication state.

An auth/session epoch or equivalent mechanism may be used.

---

# 38. Google Sign-in

Google is not part of the first Email/Password implementation phase.

The architecture must support it later through Firebase Authentication.

Target:

Google
→ Firebase Authentication
→ Firebase UID
→ Inventory AI backend
→ application session

Google does not become a separate backend authentication system.

---

# 39. Provider Linking

Future Google linking must be explicit and authenticated.

Never automatically merge/link accounts based only on matching email addresses.

The backend must use Firebase UID/provider identity and an authenticated linking flow.

---

# 40. Security Invariants

The following are architectural invariants:

1. Firebase UID is the identity link.
2. Firebase owns authentication credentials.
3. MongoDB/backend owns application authorization.
4. Client-selected businessId is never trusted as authorization authority.
5. Every Inventory JWT corresponds to an application session.
6. Revoked Inventory sessions cannot be reused.
7. Revoked Firebase credentials cannot create new Inventory sessions.
8. Unverified Firebase identities cannot obtain Inventory sessions.
9. Accounts are never automatically linked by email.
10. MongoDB must not remain a second password authority in the final architecture.
11. Raw authentication errors are never exposed directly to users.
12. Server-provided retry timing is authoritative.
13. Transient Firebase failures do not unnecessarily destroy valid Inventory sessions.
14. Authentication and authorization remain separate concerns.
15. Owner/Admin/Manager/Staff use the same authentication system.

---

# 41. Proven Runtime Evidence

The following has been confirmed through physical Android/RN Firebase testing:

* React Native Firebase updatePassword leaves the user authenticated.
* React Native Firebase adopts the replacement credential.
* The ordinary cached post-change Firebase ID token was accepted by the backend.
* The backend was tested with Firebase revocation checking enabled.
* A stale control Firebase token was rejected by the same strict verification path.
* TEMP → credentials-changed bridge → FINAL exchange succeeded.
* Existing Inventory sessions were revoked as part of the password-change bridge.
* Mandatory post-change reauthentication is not required for the tested flow.
* Explicit Firebase revokeRefreshTokens() is not required after password change.

These findings supersede earlier theoretical concerns where they conflict.

---

# 42. Implementation Principles

Implementation must follow:

* KISS
* DRY
* Separation of Concerns
* Modularity
* Loose Coupling / High Cohesion
* SOLID where it materially improves maintainability
* abstraction only where justified
* security over convenience where necessary
* simplicity over speculative complexity

Do not introduce abstractions merely to satisfy a principle.

---

# 43. Implementation Workflow

Authentication implementation must be performed in controlled phases.

For every meaningful/risky phase:

1. Verify branch.
2. Verify HEAD.
3. Verify working tree.
4. Identify protected uncommitted work.
5. Implement only the approved phase.
6. Run targeted tests.
7. Run relevant integration/runtime tests.
8. Review changed files.
9. Verify protected files were not modified.
10. Commit completed work with a factual commit message.
11. Push/verify GitHub backup when appropriate.

Never perform without explicit approval:

* reset
* restore
* clean
* stash
* force-push
* history rewrite
* merge
* rebase
* cherry-pick
* destructive cleanup
* alteration of protected uncommitted work

---

# 44. Implementation Phase Direction

Implementation should proceed approximately in this dependency order. These implementation phases use the `AUTH-*` naming scheme so they cannot be confused with the project's historical `Phase NN` numbering:

### AUTH-00 — Architecture Baseline

* establish this document as the target source of truth
* reconcile implementation documentation
* identify current-vs-target gaps

### AUTH-01 — Firebase Verification Foundation

* Firebase token verification
* revocation checking
* issuer/audience validation
* UID matching
* verified-email enforcement
* application error contract

### AUTH-02 — Session/JWT Foundation

* 1-hour JWT
* session model
* 14-day absolute cap
* session revocation behavior
* JWT claim hardening

### AUTH-03 — Session Renewal

* proactive renewal
* same-jti renewal
* single-flight
* expiry handling
* controlled fallback exchange
* transient/terminal handling
* renewal rate limiting

### AUTH-04 — Registration & Email Verification

* Owner registration
* verification gate
* server-side provisioning
* duplicate/concurrency safety

### AUTH-05 — Password Change & Recovery

* Firebase-owned password change
* application session invalidation
* Firebase password reset
* migration bridge
* legacy recovery retirement

### AUTH-06 — User Provisioning

* Owner/Admin/Manager/Staff account provisioning
* invitation flow
* verified email requirement
* server-controlled role/business assignment

### AUTH-07 — Authorization/RBAC Integration

* role/permission enforcement
* business isolation
* account/business status behavior

### AUTH-08 — Legacy Authentication Retirement

* remove legacy Mongo password authority
* remove legacy login/register/recovery
* retire passwordHash
* retire passwordChangedAt
* retire duplicate verification state where safe

### AUTH-09 — Full UX & Security Acceptance

* error mapping
* loading states
* rate-limit UX
* session expiry UX
* accessibility/readability
* integration tests
* physical-device validation
* final security review

This phase order may be refined after repository inspection, but implementation must remain consistent with this target architecture.

---

# 45. Freebuff Instruction

Before modifying authentication-related code, Freebuff must:

1. Read this document.
2. Inspect the current implementation.
3. Compare current behavior against the target architecture.
4. Report differences and risks.
5. Do not assume current behavior is correct because tests pass.
6. Do not create implementation changes until the specific phase is approved.
7. Preserve protected uncommitted work.
8. Follow the project's Git safety rules.

Freebuff is an implementation/repository evidence source, not the authority that defines the target architecture.

The target architecture is defined by this document and the approved project decisions.

---

# 46. Final Target

The desired final system is conceptually:

Firebase Authentication
→ verified Firebase identity
→ Inventory AI backend
→ server-side User/Business/Role authorization
→ Inventory Session
→ short-lived Inventory JWT
→ protected, tenant-isolated APIs

With:

* Firebase-owned credentials
* Firebase-owned verification
* Firebase revocation checking
* backend-owned authorization
* server-controlled tenant membership
* short-lived application tokens
* bounded application sessions
* safe renewal
* explicit credential recovery
* controlled role provisioning
* meaningful user-facing errors
* rate-limit awareness
* explicit concurrency handling
* safe retirement of legacy authentication

This architecture is approved as the target direction for Inventory AI authentication and user verification.
