# Password Reset by In-App Code — Implementation Plan

> **For agentic workers:** execute task by task. Steps use checkbox (`- [ ]`) syntax. TDD is
> mandatory: every test is written and watched failing before the code it describes.

**Goal:** a user who forgot their password receives a six-digit code by email and sets a new
password inside the app, without a browser and without depending on Firebase's email templates.

**Architecture:** a new public request/confirm pair under `/api/auth/password-reset`, a
`password_reset_challenges` collection keyed by a keyed digest of the address, an Admin-SDK
credential-write bridge, and a mobile screen that mirrors the existing verification-code screen.

**Tech Stack:** Node 24 (native type stripping), Express, Mongoose, firebase-admin, React Native /
Expo Router, node:test on the server and Jest on mobile.

**Spec:** `docs/superpowers/specs/2026-10-20-password-reset-otp-design.md`

> **Correction recorded during execution (2026-10-20):** Task 2's cooldown case below was written to
> expect `PASSWORD_RESET_CODE_RATE_LIMITED` with `retryAfterSeconds`. That was implemented, then
> removed the same day: on a **public** route a 429 reachable only for an existing account is an
> enumeration oracle. The shipped behaviour is a silent `202` with no send (design **§6.1**), and the
> plan is left as written so the reversal is visible rather than quietly tidied away.

## Global Constraints

- No new dependency. No new environment variable.
- Reuse `EMAIL_VERIFICATION_CODE_PEPPER` with **distinct** digest labels (`reset-code:`,
  `reset-email:`).
- Policy values: 6 digits, 10-minute TTL, 5 attempts, 60-second resend cooldown.
- Never persist, log or return a plaintext code, a digest, the pepper or a password.
- The request path answers one 202 and one sentence for every non-error outcome.
- Server files are TypeScript, `.ts` import specifiers, `erasableSyntaxOnly`-safe.

## Review Focus

1. An unknown address must be indistinguishable from a known one, including when Brevo fails.
2. A wrong code must spend exactly one attempt; a malformed payload must spend none.
3. `confirmPassword` mismatch must be refused before the service is called.
4. The account written must be the one resolved at request time, not one derived from the
   submitted email at confirm time.
5. A successful reset must leave no usable prior session.

---

### Task 1: Vocabulary and challenge model

**Files:**
- Create: `server/src/constants/passwordResetCode.ts`
- Create: `server/src/services/passwordResetCode/code.ts`
- Create: `server/src/models/passwordResetChallenge.model.ts`
- Test: `server/test/AUTH06-password-reset-code-model.test.mjs`

**Interfaces — produces:**
`PASSWORD_RESET_CODE_LENGTH`, `_TTL_MINUTES`, `_MAX_ATTEMPTS`, `_RESEND_COOLDOWN_SECONDS`,
`PASSWORD_RESET_CHALLENGE_COLLECTION`, `PASSWORD_RESET_CODE_DOMAIN`, `PASSWORD_RESET_EMAIL_DOMAIN`,
`PASSWORD_RESET_CODE_NOT_CONFIGURED`, `INVALID_PASSWORD_RESET_CODE`,
`PASSWORD_RESET_CODE_MAIL_FAILED`, `PASSWORD_RESET_CODE_RATE_LIMITED`,
`PASSWORD_RESET_CODE_LOG_EVENTS`;
`generateResetCode(): string`, `hashResetCode(pepper, code): string`,
`hashResetEmail(pepper, email): string`, `resetDigestMatches(a, b): boolean`;
model `PasswordResetChallenge` with `emailHmac` (unique), `userId`, `codeHmac`, `expiresAt`,
`attempts`, `usedAt`, `lastSentAt`.

- [ ] Test: the five digits test — `formatResetCode(42) === '000042'`, generated codes are always
      six digits, digests are 64 hex chars, and a code digest never equals an email digest for the
      same input (`'1234'` code vs `'1234'` address).
- [ ] Run it; expect failure (`Cannot find module`).
- [ ] Implement the constants, the primitives (copying AUTH-04's rejection-sampled single draw and
      `timingSafeEqual` guard) and the model.
- [ ] Test the model: `emailHmac` unique index declared, `userId` required, collection name from
      the constant, no `uid` field.
- [ ] Run both; expect pass.

### Task 2: The request lifecycle

**Files:**
- Create: `server/src/services/passwordResetCode/request.ts`
- Create: `server/src/services/passwordResetCode/errors.ts`
- Create: `server/src/mail` template addition: `server/src/services/mail/templates/passwordResetCode.ts`,
  and `sendPasswordResetCodeEmail` in `server/src/services/mail/index.ts`
- Test: `server/test/AUTH06-password-reset-code-request.test.mjs`

**Interfaces — produces:** `requestPasswordResetCode({ email }): Promise<void>`;
`PasswordResetCodeError` (`code`, optional `retryAfterSeconds`); `retryAfterSecondsFor(lastSentAt, now)`;
`sendPasswordResetCodeEmail({ to, code, expiresInMinutes })`.

- [ ] Test: unconfigured mail → throws `PASSWORD_RESET_CODE_NOT_CONFIGURED` **before** any lookup
      (assert no User query, no challenge write).
- [ ] Test: unknown address → resolves, no challenge write, no send.
- [ ] Test: eligible account → one challenge with reset-domain digests and `userId` pinned; the
      mail call receives the plaintext code; response resolves before the send settles.
- [ ] Test: a send rejection is logged and the service still resolves (202 stays uniform).
- [ ] Test: an immediate second request → **shipped as a silent 202 with no send**, and it answers
      identically for an unknown address (the oracle guard). ~~`PASSWORD_RESET_CODE_RATE_LIMITED` with
      `retryAfterSeconds` in `[1, 60]`~~ — see the correction note at the top.
- [ ] Run; expect failures. Implement; run; expect pass.

### Task 3: The confirm lifecycle and the credential write

**Files:**
- Create: `server/src/services/passwordResetCode/confirm.ts`
- Create: `server/src/services/firebase/passwordUpdater.ts` (`updateFirebaseUserPassword`,
  `revokeFirebaseRefreshTokens`, delegate setter/resetter)
- Modify: `server/src/services/firebase/index.ts` (export the two)
- Test: `server/test/AUTH06-password-reset-code-confirm.test.mjs`

**Interfaces — produces:** `confirmPasswordResetCode({ email, code, newPassword }): Promise<{ changedAt: Date }>`.

- [ ] Test: wrong code → one `INVALID_PASSWORD_RESET_CODE`, `attempts` incremented by exactly 1,
      password untouched.
- [ ] Test: attempts at the cap → refused without incrementing.
- [ ] Test: correct code → password set for the **challenge's** `userId`'s `firebaseUid`,
      `passwordChangedAt` stamped, `revokeAllSessions` called with that user and business, challenge
      consumed, audit `PASSWORD_RESET_COMPLETED` written, `changedAt` returned.
- [ ] Test: a `revokeRefreshTokens` failure is logged and does **not** fail the reset.
- [ ] Test: an admin password write failure leaves the challenge unspent and propagates the
      classified error.
- [ ] Run; expect failures. Implement; run; expect pass.

### Task 4: HTTP surface, routes and limiters

**Files:**
- Create: `server/src/controllers/passwordResetCode.controller.ts`
- Modify: `server/src/utils/validate.ts` (add `validatePasswordResetCodeRequest`,
  `validatePasswordResetCodeConfirm`)
- Modify: `server/src/routes/auth.routes.ts` (two public routes, existing limiters)
- Modify: `server/test/phase23-authorization-contract.test.mjs` (declare both as PUBLIC)
- Modify: `server/test/phase-docs-route-inventory.test.mjs` + `docs/SYSTEM_SPECIFICATION.md` (§48 /
  route inventory) for the new count
- Test: `server/test/AUTH06-password-reset-code-http.test.mjs`

- [ ] Test: request 202 for known, unknown and mail-failing cases, with an identical body; 400 for a
      malformed address; 429 with `Retry-After` on cooldown.
- [ ] Test: confirm 200 on success; 400 `INVALID_PASSWORD_RESET_CODE` on a wrong code; 400 with
      `newPassword`/`confirmPassword` field problems and **no attempt spent**; 503 when
      unconfigured.
- [ ] Test: neither route requires `requireAuth`; both are rate-limited.
- [ ] Run; expect failures. Implement; run; expect pass.
- [ ] Update the route inventory and authorization-contract declarations; run those suites.

### Task 5: Mobile

**Files:**
- Modify: `mobile/lib/api.ts` (two wrappers)
- Modify: `mobile/app/forgot-password.tsx` (code request, then navigate)
- Create: `mobile/app/reset-password-code.tsx`
- Modify: `mobile/lib/firebase-auth.ts` (remove `sendFirebasePasswordResetEmail`)
- Modify: `mobile/lib/firebase-native.ts` (remove `nativeSendPasswordResetEmail`)
- Modify: `mobile/app/reset-password.tsx` (keep `?oobCode=`/`?token=`, drop the "link" framing)
- Tests: `mobile/__tests__/password-reset-code.test.tsx`, and update
  `mobile/__tests__/phaseN3-firebase-recovery.test.ts`,
  `mobile/__tests__/phase1-rnfirebase-foundation.test.ts`

- [ ] Test: the new screen rejects a short code client-side without a request; sends
      `{ email, code, newPassword, confirmPassword }`; shows field problems per input; honours
      `Retry-After` on resend; navigates to Login on success.
- [ ] Test: `forgot-password` posts the address, then routes to the code screen **only** on 202, and
      never calls the Firebase mailer.
- [ ] Run; expect failures. Implement; run; expect pass.
- [ ] Update the N-3 and Phase 1 suites for the removed send path.

### Task 6: Records

**Files:**
- Modify: `CLAUDE.md` (one phase entry), `docs/DEVELOPMENT_ROADMAP.md` (a dated record),
  `docs/AUTH_SECURITY_MASTER_CHECKLIST.md` (F-item), `README.md` if it lists the flow.

- [ ] Write the record: what shipped, the reused pieces, the console finding, the residuals
      (best-effort refresh-token revocation, L-17 now moot for this journey, iOS unverified).
- [ ] Run the doc suites (`phase-index-integrity`, `phase-docs-*`).

### Task 7: Verification

- [ ] `cd server && npx tsc --noEmit && npx eslint . && node scripts/check-module-graph.mjs`
- [ ] `npm test` (server, full)
- [ ] `cd mobile && npx tsc --noEmit && npx jest`
- [ ] Report anything that fails or could not run; never report an unrun check as passing.
