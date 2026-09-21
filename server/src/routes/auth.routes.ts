import { Router } from 'express';

import { register, login, me, changePassword, updateMe, logout, listSessions, revokeSession } from '../controllers/auth.controller.ts';
import { forgotPassword, resetPassword as resetPasswordHandler } from '../controllers/passwordReset.controller.ts';
import { firebaseExchange, firebaseRegister, firebaseLink } from '../controllers/firebaseAuth.controller.ts';
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
  router.post('/login', createLoginAccountLimiter(limits), createLoginIpLimiter(limits), login);

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

  return router;
}

const authRouter = createAuthRouter();

export default authRouter;
