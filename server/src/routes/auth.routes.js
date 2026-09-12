import { Router } from 'express';

import { register, login, me, changePassword, updateMe, logout, listSessions, revokeSession } from '../controllers/auth.controller.js';
import requireAuth from '../middlewares/authenticate.js';
import {
  createLoginAccountLimiter,
  createLoginIpLimiter,
  createRegisterLimiter,
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
