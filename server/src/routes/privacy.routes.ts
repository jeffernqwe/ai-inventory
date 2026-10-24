import { Router } from 'express';

import { privacyPolicyHeaders, renderPrivacyPolicyPage } from '../pages/privacyPolicy.ts';

/**
 * The public privacy policy (see pages/privacyPolicy.ts).
 *
 * MOUNTED AT `/privacy`, OUTSIDE `/api`, deliberately: it is an HTML page read by a person or
 * a store reviewer in a browser, not a JSON endpoint. An `/api` prefix would promise a contract
 * to negotiate, and Play's review asks for a plain web address.
 *
 * PUBLIC AND UNAUTHENTICATED because that is the requirement — a policy that needs a login
 * cannot be read by someone deciding whether to create an account. It reads no request data,
 * performs no I/O and has no branch that can fail, so it adds no failure mode to the service.
 */
const router = Router();

router.get('/', (_req, res) => {
  for (const [name, value] of Object.entries(privacyPolicyHeaders())) {
    res.setHeader(name, value);
  }
  res.status(200).send(renderPrivacyPolicyPage());
});

export default router;
