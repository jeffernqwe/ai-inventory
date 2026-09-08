import { Router } from 'express';

import { register, login, me } from '../controllers/auth.controller.js';
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

  return router;
}

const authRouter = createAuthRouter();

export default authRouter;
