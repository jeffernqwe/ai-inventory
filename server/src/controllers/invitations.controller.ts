/**
 * Invitation-based onboarding — the HTTP surface (2026-10-25).
 *
 * THREE AUTHENTICATED HANDLERS and ONE PUBLIC one, and the split is the design:
 *
 *   GET    /api/invitations              — list this business's live invitations
 *   POST   /api/invitations              — invite an address at a role (sends the mail)
 *   DELETE /api/invitations/:id          — withdraw a pending invitation
 *   GET    /api/auth/invitation?token=…   — PUBLIC: what an invitation offers, by its token
 *
 * THE PUBLIC READ TAKES THE TOKEN AS A QUERY PARAMETER, NOT A PATH SEGMENT, and that is a
 * logging decision rather than a stylistic one: the access log records the PATH and never
 * the query (Phase 08A, re-proved for the reset page). A token in the path would sit in
 * every log line and every intermediary's access record for as long as logs are kept, and
 * one leaked log would be a working invitation for a week.
 *
 * The three management routes are registered behind `requireAuth` AND
 * `requirePermission(PERMISSIONS.USERS_MANAGE)`, the same binding `POST /api/users` uses.
 * Inviting somebody is adding a member, so it belongs to the permission that already
 * governs membership; no new permission is introduced.
 *
 * The preview is public because the person using it has not signed in — that is what an
 * invitation is FOR. It reads only the token, returns only the invited address, role,
 * business name and expiry, and discloses nothing an inbox-holder would not already know.
 *
 * `businessId` NEVER comes from the request. The service reads it from `req.user`, which
 * `requireAuth` populated from the MongoDB document the session resolves to.
 *
 * WHY THE LANDING URL IS BUILT HERE. The mail needs an absolute address, and the server
 * knows the origin the request arrived on. Deriving it per request means a deployment
 * behind Render, a staging host and `localhost` all produce links that work without a new
 * environment variable to forget. `trust proxy` is already configured for the deployment,
 * so `req.protocol` is the public one.
 */

import type { Request, Response } from 'express';

import { isObjectId, validateInvitationCreate } from '../utils/validate.ts';
import { invalidId, throwValidation } from '../utils/errors.ts';
import { invitationsService } from '../services/invitations.service.ts';
import { INVITATION_TOKEN_PATTERN } from '../constants/invitations.ts';

/**
 * The request context, local and structural, following `users.controller.ts`: declaring
 * `user` on Express's global `Request` would let any module read an authoritative-looking
 * `req.user` on a PUBLIC route — and this file holds one.
 */
type AuthenticatedRequest = Request & {
  user?: { id: string; businessId: string; role: string };
};

function paramId(req: AuthenticatedRequest) {
  if (!isObjectId(req.params.id)) invalidId();
  return req.params.id as string;
}

/** The absolute origin in front of this request, with no trailing slash. */
function requestOrigin(req: Request): string {
  const host = req.get('host');
  return `${req.protocol}://${host ?? 'localhost'}`;
}

export const invitationsController = {
  async list(req: AuthenticatedRequest, res: Response) {
    const result = await invitationsService.list(req.user!);
    res.json(result);
  },

  async create(req: AuthenticatedRequest, res: Response) {
    const v = validateInvitationCreate(req.body ?? {});
    if (v.problems.length) throwValidation(v.problems);
    const invitation = await invitationsService.create(
      req.user!,
      // Both are the strings the validator checked: reaching this line means `problems`
      // was empty, so the address passed `emailProblems` and the role is in the list.
      { email: v.email, role: v.role as string },
      requestOrigin(req)
    );
    res.status(201).json(invitation);
  },

  async revoke(req: AuthenticatedRequest, res: Response) {
    await invitationsService.revoke(req.user!, paramId(req));
    res.status(204).send();
  },

  /**
   * PUBLIC. The token is the entire input; no session is read or issued and nothing about
   * the caller is recorded beyond the request's path, which does not contain the token.
   *
   * Shape is checked before the lookup, so a malformed value is a 400 field error and
   * never reaches the collection.
   */
  async preview(req: Request, res: Response) {
    const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
    if (!INVITATION_TOKEN_PATTERN.test(token)) {
      throwValidation([{ field: 'token', message: 'must be a valid invitation token' }]);
    }
    const result = await invitationsService.preview(token);
    res.json(result);
  },
};

export default invitationsController;
