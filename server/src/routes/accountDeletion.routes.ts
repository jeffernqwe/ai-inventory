import { Router } from 'express';

import {
  accountDeletionHeaders,
  renderAccountDeletionPage,
} from '../pages/accountDeletionPage.ts';

/**
 * The public account-deletion page (see pages/accountDeletionPage.ts).
 *
 * MOUNTED AT `/account-deletion`, OUTSIDE `/api`, for the same reason `/privacy` is: it is
 * an HTML page read by a person or a store reviewer in a browser, and Play asks for a
 * plain web address rather than a JSON route.
 *
 * PUBLIC AND UNAUTHENTICATED because somebody who cannot sign in is exactly one of the
 * people who needs it. It reads no request data, performs no I/O and has no branch that
 * can fail, so it adds no failure mode to the service.
 */
const router = Router();

router.get('/', (_req, res) => {
  for (const [name, value] of Object.entries(accountDeletionHeaders())) {
    res.setHeader(name, value);
  }
  res.status(200).send(renderAccountDeletionPage());
});

export default router;
