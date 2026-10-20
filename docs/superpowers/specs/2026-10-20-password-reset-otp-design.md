# Password Reset by In-App Six-Digit Code — Design

**Status:** decided 2026-10-20 (owner). Supersedes the Firebase-email reset path as the primary
recovery journey. Nothing here removes the 26B token endpoints or the AUTH-05 page; both stay,
inert.

**Why this document exists:** the Firebase Console refused a custom action URL, and then refused
every email-template write at all (`EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED`, Google issue 520781452).
Any design that routes the reset email through a template we configure is therefore unbuildable.
This design removes that dependency instead of working around it.

---

## 1. What was wrong, in order

1. `POST /api/auth/forgot-password` (26B) mints a link with our own token and mails it through
   Brevo. Working, but the link lands in a browser, and its token flow is the legacy bcrypt
   password authority.
2. Phase N-3 moved recovery to Firebase: the app calls `sendPasswordResetEmail` with no
   `ActionCodeSettings`, so Firebase composes the link from the **project's password-reset email
   template**. The user ends at `https://<project>.firebaseapp.com/__/auth/action` — a browser
   form. A Firebase-native reset also **revokes nothing** (the recorded D2/OD-9 gap).
3. AUTH-05 built `GET /auth/reset` so that template could forward `?oobCode=` to
   `inventoryai://reset-password`. It is correct and tested, and it is **unshipped** — the files
   are untracked and `HEAD` does not contain them.
4. The console cannot be pointed at that page, or at anything else: the template editor answers
   *"Email template updates are currently unavailable for this project."* for a Subject edit and
   for a default authorized domain alike. There is no bypass from our side (the Admin REST
   `projects.updateConfig` path is reported to fail identically).

So the AUTH-05 page is not wrong; it is **unreachable**. Recovery must therefore stop depending on
Firebase's mailer, its templates and its hosted page.

## 2. The decision

The user proves control of the mailbox with a **six-digit Inventory AI code**, then sets the new
password **inside the app**. The code is minted, digested, stored, mailed and checked by our own
server, exactly as the AUTH-04 email-verification code already is.

It follows the flow the account-creation journey already uses, so a person meets one code
experience in this product, not two, and the mail arrives from the same Brevo sender as the
verification code.

## 3. The journey

```
forgot-password screen            (email field)
        │  POST /api/auth/password-reset/code        { email }
        ▼                                          202, one fixed sentence
  Brevo: "Your Inventory AI reset code"             six digits, 10 minutes
        │
reset-password-code screen        (code + new password + confirm)
        │  POST /api/auth/password-reset/confirm     { email, code, newPassword, confirmPassword }
        ▼
  Firebase Admin: updateUser(uid, { password })
  User: passwordChangedAt = now
  revokeAllSessions({ userId, businessId, now })
  Firebase Admin: revokeRefreshTokens(uid)          (best effort, logged)
  audit: PASSWORD_RESET_COMPLETED
        ▼                                          200 "Password changed. Please sign in again."
  Login
```

## 4. Reuse map — what is borrowed, and what is deliberately not

| Concern | Reused |
|---|---|
| Code generation, keyed digest, timing-safe compare | the primitives and the reasoning of `services/emailVerification/code.ts`, **re-implemented in its own module under reset domain labels** (§5.1) |
| Challenge lifecycle | AUTH-04's shape: one conditional `findOneAndUpdate` carries the cooldown; one atomic reservation carries the attempt budget; `usedAt` is only ever set |
| Policy numbers | 6 digits, 10-minute TTL, 5 attempts, 60-second resend cooldown |
| Pepper | `EMAIL_VERIFICATION_CODE_PEPPER` — the same server secret, different domain labels, so no new environment variable and no deployment change |
| Delivery | `services/mail` → Brevo, with a dedicated reset-code template |
| Revocation | `revokeAllSessions` and the `passwordChangedAt` stamp, exactly as `credentialsChanged.service.ts` uses them |
| Audit | `AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED` / `PASSWORD_RESET_COMPLETED`, with a `businessId`, which the verification flow could not write |
| Limiters | the existing `forgot-password` per-email and per-IP factories, and the reset-confirm per-IP factory |

**Not borrowed:** the Firebase ID token. A person resetting a password is signed out and holds no
Firebase credential, so nothing on this surface verifies one, and the identity is established by
the code plus the mailbox instead.

## 5. The four load-bearing decisions

### 5.1 The challenge is keyed by the email, under its own domain labels

AUTH-04 keys its challenge by `uid` because it starts from a verified token. This flow starts from
an address, so its key is an HMAC of the normalized email under `reset-email:`, and its code digest
is an HMAC under `reset-code:`. The labels are **different from the verification flow's**, so a
digest minted for one purpose can never be accepted by the other — the property
`constants/emailVerification.ts` states, kept true rather than assumed.

The primitives are duplicated rather than shared, on purpose: the shared module's fixed labels are
part of the AUTH-04 contract its suite pins, and parameterising them would put a caller-controlled
value inside the one place that is supposed to be a constant.

Why not key on the plain address: the collection then holds a readable list of addresses that
someone asked to reset, which is a target list. A keyed digest under a distinct label is not
reversible without the pepper.

### 5.2 Email is a lookup key, never an identity source

The request path finds the account the ordinary way `26B` already does — a `User` lookup by
normalized address — and **pins that account's `_id` on the challenge row**. The confirm path
resolves the account from `reserved.userId`; it does not look the account up by the submitted
email again. So the supplied address can only ever *address a challenge*, and the subject of the
write is the document that was found and recorded when the code was issued.

This is not a Firebase→MongoDB identity join: `firebaseUid` still comes from the `User` row, and
the `uid` handed to the Admin SDK is that row's `firebaseUid`, never anything derived from the
request.

### 5.3 The request path cannot be used to enumerate accounts

- One status (202) and one fixed sentence for every non-error outcome: code sent, no such account,
  account not eligible, code already pending, delivery failed.
- The **send is detached**, like Phase 28 B1, so the 202 does not wait on Brevo and a delivery
  failure cannot become an observable difference.
- A 503 is answered only for conditions checked **before** the account lookup (mail usable, pepper
  usable), so it is identical for every caller.
- The resend cooldown is per challenge, so it can only be reached by someone who already received a
  code — the same rule AUTH-04 applies to its own resend refusal.
- Residual, recorded rather than glossed: an existing account costs one extra MongoDB write
  (the challenge). That term is the same order as the lookup itself and is accepted, in the terms
  Phase 29 recorded for B1's residual.

### 5.4 The reset revokes, because the server performs the change

A Firebase-native reset completes inside Firebase and the server never learns of it — which is why
it revokes nothing. Here the server makes the change, so it can also make it final:

1. `updateUser(uid, { password })` — a separate Admin bridge with a **hardcoded single-field
   payload**, so no caller can ask this module to write anything else (the `userUpdater.ts`
   property, kept).
2. `User.passwordChangedAt = now` — the stamp `authenticate.ts` already compares `iat` against, so
   tokens issued before this instant are rejected.
3. `revokeAllSessions({ userId, businessId, now })` — closes the same-second hole the integer-second
   stamp cannot.
4. `revokeRefreshTokens(uid)` — **best effort**: the password is already changed and returning a
   failure would be false. A failure is logged with a fixed reason so the residual is visible.

After this, an existing device's session is gone and its Firebase refresh token is revoked, so it
cannot silently re-exchange its way back in. It must sign in with the new password.

## 6. Contract

### `POST /api/auth/password-reset/code` — public

Body: `{ email }`. Validator: the existing email rules (`validateForgotPassword`).

| Outcome | Answer |
|---|---|
| Accepted (sent, unknown account, ineligible account, delivery failed) | `202` `{ message: "If an account exists for that email, a password reset code has been sent." }` |
| Malformed email | `400 VALIDATION_ERROR` with an `email` problem |
| Mail or pepper unusable | `503 PASSWORD_RESET_CODE_NOT_CONFIGURED` |
| Resend cooldown active | `202`, the same body, and **no send** — see §6.1 |
| Route limiter | `429 PASSWORD_RESET_RATE_LIMITED` from the existing limiter handler |

### 6.1 The cooldown is silent, and a 429 there would have been an enumeration oracle

This contract was implemented first with `429 PASSWORD_RESET_CODE_RATE_LIMITED` + `Retry-After` for
an active resend cooldown, by analogy with AUTH-04's verification code, and then corrected the same
day. The analogy does not hold: **AUTH-04's request route is `requireAuth`'d**, so a caller refused
for timing has already proved control of the account and learns nothing new. This route is **public**.

A challenge row exists only for an **eligible** account, so the refusal was reachable only for one.
An address could be classified in two requests — first `202`, then `429` means an account exists,
`202` again means it does not — which is precisely the oracle every other part of the design
(uniform status, uniform body, detached send, silent ineligibility) exists to prevent. **The
cooldown therefore resolves as an ordinary `202` and simply sends nothing**, leaving the code
already in the person's inbox valid for its full ten minutes, so the suppressed mail costs them
nothing. The only `429` this route can return comes from the route limiters, which are keyed on the
submitted address and the caller's IP and answer identically for both address classes.

`PASSWORD_RESET_CODE_RATE_LIMITED`, its `retryAfterSeconds` field and the controller's `Retry-After`
site were **deleted with the fix**, so no later reader can reintroduce the refusal by wiring the
already-present pieces back together.

### `POST /api/auth/password-reset/confirm` — public

Body: `{ email, code, newPassword, confirmPassword }`.

| Outcome | Answer |
|---|---|
| Password changed | `200` `{ message: "Password changed. Please sign in again." }` |
| Malformed payload (missing field, short password, mismatched confirmation) | `400 VALIDATION_ERROR` with field problems, **before** any attempt is spent |
| Wrong / expired / used / exhausted code | `400 INVALID_PASSWORD_RESET_CODE`, one message for all four |
| Pepper unusable | `503 PASSWORD_RESET_CODE_NOT_CONFIGURED` |
| Route limiter | `429` |

`confirmPassword` is checked in the validator and **not returned**, so a mistyped confirmation can
never spend an attempt — the same split `validateResetPassword` uses for its token.

## 7. Non-goals

- No change to `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`, the reset-token
  model or the `?token=` branch. Kept, documented as legacy.
- No removal of `GET /auth/reset` (AUTH-05). It is unshipped and unreachable, and still the right
  destination if the template editor is ever restored.
- No new permission, role, claim or `User` schema field.
- No new dependency, no new environment variable.
- No email-verification change: that flow is keyed by uid and stays exactly as shipped.
- No password *policy* change — the existing 8–72 rule is reused.

## 8. Open items this design does not close

- **L-17** stays open: it is the Firebase-email return path, and this flow does not use it. It
  becomes moot for the primary journey rather than resolved.
- A reset performed on one device still only revokes sessions server-side, so a *Firebase* session
  that survives a failed refresh-token revocation is recorded as a residual (§5.4 step 4).
- iOS remains unverified on this host.
