import { Router } from 'express';

import { renderResetLinkPage, resetLinkHeaders } from '../pages/resetPasswordLink.ts';
import { firebaseProjectId } from '../services/firebase/index.ts';

/**
 * The landing page for Firebase password-reset emails (see pages/resetPasswordLink.ts).
 *
 * MOUNTED AT `/auth`, OUTSIDE `/api`, ON PURPOSE: the URL is configured in the Firebase
 * console as the action URL for the password-reset template, so it is read by a phone's
 * browser rather than by this project's clients. An `/api` prefix would suggest a JSON
 * endpoint with a contract to negotiate; this is one HTML page whose only job is to hand
 * a one-time code to the app.
 *
 * PUBLIC AND UNAUTHENTICATED, which is the correct shape rather than a concession: the
 * person resetting a password has, by definition, no usable password. Nothing is
 * authorized here. The page reads a query string and writes markup, and the code it
 * forwards is redeemed by Firebase inside the app, so a request to this route grants no
 * access to anything even if it is replayed.
 *
 * IT CANNOT FAIL. There is no I/O — no database, no Firebase call, no mail — so the
 * handler is synchronous and every branch produces a page. That is deliberate: a link
 * that 500s is a link the person cannot use, and the one thing this route must not do is
 * add a failure mode to account recovery.
 */
const router = Router();

router.get('/reset', (req, res) => {
  const page = renderResetLinkPage(req.query, firebaseProjectId());

  res.status(page.status);
  for (const [name, value] of Object.entries(resetLinkHeaders())) {
    res.setHeader(name, value);
  }
  res.send(page.html);
});

export default router;
