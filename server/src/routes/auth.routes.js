import { Router } from 'express';

import { register, login, me, changePassword, updateMe, logout, listSessions, revokeSession } from '../controllers/auth.controller.js';
import { forgotPassword, resetPassword as resetPasswordHandler } from '../controllers/passwordReset.controller.js';
import requireAuth from '../middlewares/authenticate.js';
import {
  createLoginAccountLimiter,
  createLoginIpLimiter,
  createRegisterLimiter,
  createPasswordResetRequestAccountLimiter,
  createPasswordResetRequestIpLimiter,
  createPasswordResetConfirmLimiter,
} from '../middlewares/rateLimit.js';

/**
 * Factory. Each call returns a router whose public-auth rate limiters have
 * their OWN fresh in-memory stores. The shipped app mounts the singleton below;
 * tests build fresh routers (optionally with overridden limits) so rate-limit
 * behavior is deterministic and state never leaks between cases.
 *
 * @param {{ limits?: object }} [options] Optional per-limiter overrides.
 */
export function createAuthRouter({ limits } = {}) {
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

  return router;
}

const authRouter = createAuthRouter();

export default authRouter;
