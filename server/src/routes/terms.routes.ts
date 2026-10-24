import { Router } from 'express';

import { renderTermsOfUsePage, termsOfUseHeaders } from '../pages/termsOfUse.ts';

/**
 * The public Terms of Use (see pages/termsOfUse.ts).
 *
 * MOUNTED AT `/terms`, OUTSIDE `/api`, for the same reason as `/privacy` and
 * `/account-deletion`: it is an HTML page a person or a store reviewer reads in a browser, not
 * a JSON endpoint.
 *
 * PUBLIC AND UNAUTHENTICATED because terms that need a login cannot be read by somebody
 * deciding whether to create an account. It reads no request data, performs no I/O and has no
 * branch that can fail.
 */
const router = Router();

router.get('/', (_req, res) => {
  for (const [name, value] of Object.entries(termsOfUseHeaders())) {
    res.setHeader(name, value);
  }
  res.status(200).send(renderTermsOfUsePage());
});

export default router;
