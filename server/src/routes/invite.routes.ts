import { Router } from 'express';

import {
  invitationLinkHeaders,
  isInvitationToken,
  renderInvitationLinkErrorPage,
  renderInvitationLinkPage,
} from '../pages/invitationLink.ts';

/**
 * The public landing page for invitation emails (2026-10-25).
 *
 * MOUNTED AT `/invite`, OUTSIDE `/api`, for the same reason as `/privacy`, `/terms`,
 * `/account-deletion` and `/auth/reset`: it is an HTML page a mail client opens in a
 * browser, not a JSON endpoint.
 *
 * PUBLIC AND UNAUTHENTICATED by necessity — the person following an invitation has no
 * account yet. It reads one query parameter, validates its SHAPE, and writes it into a
 * constant `inventoryai://` address. It resolves nothing, redeems nothing and touches no
 * database, so holding this page's URL grants nothing; the token is only ever spent in
 * the app, against a verified identity for the invited address.
 *
 * `no-store` and `no-referrer` because the URL carries the token: a cached copy or a
 * Referer header would spread a working invitation link to places nobody chose.
 */
const router = Router();

router.get('/', (req, res) => {
  for (const [name, value] of Object.entries(invitationLinkHeaders())) {
    res.setHeader(name, value);
  }

  const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
  if (!isInvitationToken(token)) {
    res.status(400).send(renderInvitationLinkErrorPage());
    return;
  }
  res.status(200).send(renderInvitationLinkPage(token));
});

export default router;
