import { Router } from 'express';

import { register, login, me, changePassword, updateMe, logout, listSessions, revokeSession } from '../controllers/auth.controller.ts';
import { forgotPassword, resetPassword as resetPasswordHandler } from '../controllers/passwordReset.controller.ts';
import {
  passwordResetCodeRequest,
  passwordResetCodeConfirm,
} from '../controllers/passwordResetCode.controller.ts';
import { firebaseExchange, firebaseRegister, firebaseLink, credentialsChanged, renew } from '../controllers/firebaseAuth.controller.ts';
import { emailVerificationRequest, emailVerificationConfirm } from '../controllers/emailVerification.controller.ts';
import requireAuth from '../middlewares/authenticate.ts';
import {
  createLoginAccountLimiter,
  createLoginIpLimiter,
  createRegisterLimiter,
  createPasswordResetRequestAccountLimiter,
  createPasswordResetRequestIpLimiter,
  createPasswordResetConfirmLimiter,
  createFirebaseExchangeLimiter,
  createFirebaseRegisterLimiter,
  createSessionRenewLimiter,
  createEmailVerificationRequestLimiter,
  createEmailVerificationConfirmLimiter,
  resetLoginAccountBucketOnSuccess,
} from '../middlewares/rateLimit.ts';
import type { AuthRateConfig } from '../middlewares/rateLimit.ts';

/**
 * The limiter overrides a router may be built with. Deliberately NOT a new
 * type: `AuthRateConfig` is the complete set every limiter factory reads, and
 * `Partial` of it is exactly what those factories already accept, so this names
 * the existing contract rather than duplicating it. `createAuthRouter()` with no
 * argument stays valid — every key is optional.
 */
type AuthRouterOptions = {
  limits?: Partial<AuthRateConfig>;
};

/**
 * Factory. Each call returns a router whose public-auth rate limiters have
 * their OWN fresh in-memory stores. The shipped app mounts the singleton below;
 * tests build fresh routers (optionally with overridden limits) so rate-limit
 * behavior is deterministic and state never leaks between cases.
 *
 * @param {AuthRouterOptions} [options] Optional per-limiter overrides.
 */
export function createAuthRouter({ limits }: AuthRouterOptions = {}) {
  const router = Router();

  // Public — protected from credential stuffing / mass registration (Phase 07B).
  router.post('/register', createRegisterLimiter(limits), register);

  // The two login limiters are built here rather than inline because the third
  // handler needs a handle on the ACCOUNT limiter: it clears that bucket (and
  // only that bucket) once a login has actually succeeded. See
  // `resetLoginAccountBucketOnSuccess` for why the IP bucket is deliberately
  // excluded, and why this is a fourth handler rather than a call the controller
  // makes — the reset is decided by the response, not by the controller's body.
  const loginAccountLimiter = createLoginAccountLimiter(limits);
  router.post(
    '/login',
    loginAccountLimiter,
    createLoginIpLimiter(limits),
    resetLoginAccountBucketOnSuccess(loginAccountLimiter),
    login
  );

  // Public — password recovery (Phase 26B-3). NO requireAuth and no session: the
  // whole point of these two routes is that the caller cannot authenticate. The
  // token travels in the POST body, never in a URL, so it cannot reach the
  // access log (httpLogger records req.path only) or a Referer header.
  //
  // forgot-password is limited per account AND per IP, reset-password per IP —
  // see middlewares/rateLimit.js for why they count every attempt rather than
  // only the failures, the way login does.
  router.post(
    '/forgot-password',
    createPasswordResetRequestAccountLimiter(limits),
    createPasswordResetRequestIpLimiter(limits),
    forgotPassword
  );
  router.post('/reset-password', createPasswordResetConfirmLimiter(limits), resetPasswordHandler);

  // AUTH-06 — password reset by an emailed six-digit code. PUBLIC for the same reason the two
  // routes above are: the caller cannot authenticate, and every step of the journey happens before
  // a session could exist. No `requireAuth`, no permission, and no `req.user` read: the account is
  // resolved server-side from the challenge the code belongs to.
  //
  // The body travels in a POST, never in a URL, so the code and the new password cannot reach the
  // access log (`httpLogger` records `req.path` only) or a `Referer` header.
  //
  // THE LIMITERS ARE THE EXISTING ONES, deliberately rather than new factories: they already key
  // on the submitted address and the caller's IP, which is exactly the budget this surface needs,
  // and adding a near-identical factory would give the project two places to change one policy.
  // The request route is limited per address AND per IP; the confirm route per IP.
  router.post(
    '/password-reset/code',
    createPasswordResetRequestAccountLimiter(limits),
    createPasswordResetRequestIpLimiter(limits),
    passwordResetCodeRequest
  );
  router.post(
    '/password-reset/confirm',
    createPasswordResetConfirmLimiter(limits),
    passwordResetCodeConfirm
  );

  // Public — Firebase authentication (Phase 32C). Both routes are reachable ONLY
  // by a caller who does not hold an Inventory AI JWT, which is why they carry no
  // requireAuth: the exchange exists to turn a Firebase ID token into a session
  // precisely when there is no session yet, and requiring one would make it able
  // to mint only sessions that already exist. Naming a permission is equally
  // impossible — the caller has no role here, and the role they end up with comes
  // from the MongoDB User the verified uid resolves to, never from this request.
  //
  // The ID token travels in the POST body, never a URL, so it cannot reach the
  // access log (httpLogger records req.path only) or a Referer header — the same
  // reasoning the recovery routes use for the reset token.
  //
  // Both are per-IP limited from the day they ship: the exchange mints sessions
  // on an unauthenticated endpoint, and registration creates a Business. Neither
  // limiter sets skipSuccessfulRequests — see middlewares/rateLimit.ts.
  router.post('/firebase/exchange', createFirebaseExchangeLimiter(limits), firebaseExchange);
  router.post('/firebase/register', createFirebaseRegisterLimiter(limits), firebaseRegister);

  // AUTH-04-C/D — the email-verification code flow (design §14C.10). PRE-SESSION and
  // Firebase-AUTHENTICATED, which is why they carry no `requireAuth`: the caller holds
  // a Firebase ID token and no Inventory AI session at all, because a session is only
  // minted by the exchange above, and the whole point of this flow is that the identity
  // is verified but has no tenant yet. Naming a permission is equally impossible — the
  // caller has no role here, and the uid is read from the VERIFIED token inside the
  // service, never from the body.
  //
  // Middleware order is limiter → controller, with the limiter FIRST so the budget is
  // spent before any Firebase signature verification, database work or outbound email.
  // Both are per-IP and neither sets skipSuccessfulRequests — see
  // middlewares/rateLimit.ts for why, and for why no identity-keyed bucket is possible
  // on this surface (the identity is unknown until after verification).
  //
  // The ID token travels in the POST body, never a URL, so — like every other Firebase
  // route — it cannot reach the access log (httpLogger records req.path only) or a
  // Referer header.
  //
  // NEITHER ROUTE CREATES A SESSION. Confirmation sets Firebase's `emailVerified` and
  // nothing else; the Inventory AI session is still created only by the exchange above.
  router.post(
    '/email-verification/request',
    createEmailVerificationRequestLimiter(limits),
    emailVerificationRequest
  );
  router.post(
    '/email-verification/confirm',
    createEmailVerificationConfirmLimiter(limits),
    emailVerificationConfirm
  );

  // Protected
  router.get('/me', requireAuth, me);
  // Phase 15: self-service account security + profile.
  router.patch('/me', requireAuth, updateMe);
  router.post('/change-password', requireAuth, changePassword);
  // Phase 26A: session lifecycle. Authenticated routes only — no new permission
  // is involved, because a user manages nothing but their own sessions, and the
  // owning userId comes from req.user, never from the request.
  router.post('/logout', requireAuth, logout);
  router.get('/sessions', requireAuth, listSessions);
  router.delete('/sessions/:id', requireAuth, revokeSession);

  // AUTH-03: session renewal. AUTHENTICATED — no permission, because a user
  // manages nothing but their own session, and both the account (`req.user.id`) and
  // the session (`req.auth.jti`) come from the token that authenticated the
  // request, never from the body. Middleware order is requireAuth → limiter →
  // controller: the limiter sits immediately before the handler that spends a
  // Firebase `checkRevoked` verification, matching `ai.routes.ts`'s
  // `requireAuth, requirePermission, aiRateLimiter, controller` ordering, so an
  // unauthenticated caller is refused before consuming any budget. The ID token
  // travels in the POST body, so it cannot reach the access log or a Referer.
  router.post('/renew', requireAuth, createSessionRenewLimiter(limits), renew);

  // Phase 32H: identity linking. AUTHENTICATED, and the authentication IS the
  // operation's ownership proof (design §14A.4) rather than a convenience — the
  // caller must already hold the account they are attaching an identity to, which
  // is exactly the evidence the exchange's collision refusal lacks. It therefore
  // names no permission: the subject is `req.user.id`, the caller's own account,
  // and a capability that governed "what you may do to others" would be the wrong
  // instrument for "what you may attach to yourself" — the same reasoning the
  // session routes above carry.
  //
  // No rate limiter, deliberately and consistently: no authenticated route in this
  // application is limited. Each attempt requires a live Inventory AI session AND a
  // Firebase credential, and the only work it can do is a local signature
  // verification plus two indexed lookups, so the limiter it would need is not the
  // one that protects the public routes. Adding one means a new factory and a new
  // config entry in middlewares/rateLimit.ts — scope this phase does not have, and
  // no finding that asks for it.
  //
  // The ID token travels in the POST body, like the exchange's, so it cannot reach
  // the access log (httpLogger records req.path only) or a Referer header.
  router.post('/firebase/link', requireAuth, firebaseLink);

  // N-4: the credential-change bridge. AUTHENTICATED, and once again the
  // authentication IS the operation's ownership proof rather than a convenience —
  // the account is `req.user.id` and the identity must equal the uid already on
  // it, so no permission key could express "record a credential change on my own
  // account" without inventing an authorization concept the catalogue does not
  // have. It is registered as `requireAuth, controller` — no second middleware —
  // which is also why it is not rate-limited: every authenticated route in this
  // application is unlimited, and each attempt here requires a live session AND a
  // verified, RECENT Firebase credential whose uid matches this account.
  //
  // It is the route the approved recovery sequence reaches last-but-one: the user
  // signs in again with the new password, the PUBLIC exchange above mints a
  // temporary ordinary session, and this route records the change and revokes
  // EVERY session — that temporary one included, because `revokeAllSessions` has no
  // caller exception. The client then re-exchanges, and the surviving session is
  // valid because its `iat` is not before the stamp. Revoking the caller's own
  // session is therefore the mechanism rather than a cost of it, and it is why this
  // route answers `200 { changedAt }` instead of trying to preserve the token it
  // arrived on.
  //
  // The ID token travels in the POST body, like every other Firebase route, so it
  // cannot reach the access log (httpLogger records req.path only) or a Referer
  // header.
  router.post('/credentials-changed', requireAuth, credentialsChanged);

  return router;
}

const authRouter = createAuthRouter();

export default authRouter;
