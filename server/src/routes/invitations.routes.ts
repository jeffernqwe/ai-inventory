import { Router } from 'express';

import requireAuth from '../middlewares/authenticate.ts';
import { requirePermission } from '../middlewares/authorize.ts';
import { createInvitationSendLimiter } from '../middlewares/rateLimit.ts';
import { invitationsController } from '../controllers/invitations.controller.ts';
import { PERMISSIONS } from '../constants/roles.ts';

/**
 * Invitation management (2026-10-25).
 *
 * Bound to `users.manage`, the permission that already governs membership: an invitation
 * adds a member, and giving it its own permission would mean a role could invite people
 * yet not manage them — a distinction nobody asked for and one more thing to keep in the
 * Phase 22/23/24 matrices.
 *
 * The limiter sits AFTER `requireAuth` and `requirePermission`, so an anonymous or
 * unprivileged caller is refused before it is charged a bucket, and it is keyed on the
 * account rather than the address (see middlewares/rateLimit.ts).
 *
 * The service is what enforces the cross-role rule (an ADMIN cannot invite an ADMIN),
 * exactly as `users.service` does for direct creation. The route table is deliberately
 * the same shape as `routes/users.routes.ts`.
 */
const router = Router();

// Each registration is written on ONE line on purpose: the Phase 23 authorization guard
// reads a route's declaration from the source text, and a declaration wrapped across lines
// is invisible to it. Keeping the shape of `routes/users.routes.ts` also keeps the two
// readable side by side.
router.get('/', requireAuth, requirePermission(PERMISSIONS.USERS_MANAGE), invitationsController.list);
router.post('/', requireAuth, requirePermission(PERMISSIONS.USERS_MANAGE), createInvitationSendLimiter(), invitationsController.create);
router.delete('/:id', requireAuth, requirePermission(PERMISSIONS.USERS_MANAGE), invitationsController.revoke);

export default router;
