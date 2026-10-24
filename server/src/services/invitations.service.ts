/**
 * Invitation-based onboarding — the domain logic.
 *
 * WHAT THIS MODULE OWNS: creating an invitation, listing and revoking one, reading one
 * by its token, and resolving one at the moment a new account is created. It does NOT
 * create accounts and it never touches a password: `firebaseAuth.service.ts` remains the
 * only place a Firebase identity becomes an Inventory AI user, and it calls
 * `resolvePendingForRegistration` here so the tenant and role it writes come from the
 * invitation rather than from a request body.
 *
 * WHY THE ROLE AND TENANT COME FROM THE ROW, NOT THE REQUEST. The invitee proves an
 * EMAIL; the invitation is the server's record of what that address was offered. Reading
 * `businessId` or `role` from the acceptance request would let the holder of any token
 * choose their own tenant or promote themselves. The acceptance payload therefore has no
 * such field to send.
 *
 * WHAT A LEAKED TOKEN BUYS: nothing on its own. The token resolves an invitation; the
 * account is created only against a VERIFIED Firebase identity whose address equals the
 * invited address, so possession without the inbox is inert. That is why the token can be
 * a plain random value mailed to the address instead of a second managed secret.
 *
 * THE ADDRESS IS STORED IN THE CLEAR HERE, unlike the reset flows' keyed digests, and the
 * difference is deliberate: reset challenges exist to hide WHO asked to recover an
 * account, while an invitation cannot function without its address — the same address is
 * compared against a verified claim and the mail is sent to it. It is consequently the
 * one field the deletion path must not retain, which is why revoking and deleting an
 * account remove its invitations rather than anonymising them.
 */

import { createHash, randomBytes } from 'node:crypto';

import mongoose from 'mongoose';

import Invitation from '../models/invitation.model.ts';
import Business from '../models/business.model.ts';
import User from '../models/user.model.ts';
import ApiError from '../utils/ApiError.ts';
import { normalizeEmail } from '../utils/validate.ts';
import { notFound } from '../utils/errors.ts';
import { recordAudit } from './audit.service.ts';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../constants/audit.ts';
import { assertActiveBusiness } from './business.service.ts';
import { MailNotConfigured, MailDeliveryError, sendInvitationEmail } from './mail/index.ts';
import {
  INVITABLE_ROLES,
  INVITATION_EMAIL_IN_USE,
  INVITATION_EMAIL_MISMATCH,
  INVITATION_INVALID,
  INVITATION_MAIL_FAILED,
  INVITATION_MAIL_NOT_CONFIGURED,
  INVITATION_TTL_DAYS,
  INVITATION_TTL_MS,
} from '../constants/invitations.ts';
import { ROLES } from '../constants/roles.ts';

type IdLike = string | mongoose.Types.ObjectId;

type Actor = {
  id: IdLike;
  businessId: IdLike;
  role: string;
};

type CreatePayload = {
  email: string;
  role: string;
};

/** SHA-256 of the token. The only form ever written or queried. */
function tokenDigest(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** 32 bytes of CSPRNG output as hex — 256 bits, so guessing is not a threat model. */
function mintToken(): string {
  return randomBytes(32).toString('hex');
}

/** The shape the screens receive. Never the token, never its digest. */
function toPublicInvitation(doc: {
  _id: unknown;
  email: string;
  role: string;
  createdAt?: Date;
  expiresAt: Date;
  invitedBy: unknown;
}) {
  return {
    id: String(doc._id),
    email: doc.email,
    role: doc.role,
    createdAt: doc.createdAt ?? null,
    expiresAt: doc.expiresAt,
    invitedBy: doc.invitedBy ? String(doc.invitedBy) : null,
  };
}

/** A Mongo duplicate-key error, whatever its exact shape. */
function isDuplicateKey(err: unknown) {
  return (err as { code?: unknown } | null | undefined)?.code === 11000;
}

/**
 * Refuses an invitation whose role the inviter may not assign.
 *
 * Mirrors `users.service` deliberately, including the ADMIN-into-ADMIN rule: an
 * invitation must not be a quieter route to a grant the direct API refuses. OWNER is
 * rejected outright — the enum on the model already refuses it, so this is the readable
 * message rather than a schema error.
 */
type InvitableRole = (typeof INVITABLE_ROLES)[number];

function assertAssignableRole(actor: Actor, role: string): asserts role is InvitableRole {
  if ((INVITABLE_ROLES as readonly string[]).includes(role) === false) {
    throw new ApiError(400, 'role must be one of ADMIN, MANAGER, STAFF', 'VALIDATION_ERROR');
  }
  if (actor.role === ROLES.ADMIN && role === ROLES.ADMIN) {
    throw new ApiError(403, 'Admins cannot create or assign other admins', 'ADMIN_RESTRICTED');
  }
}

export const invitationsService = {
  /**
   * Creates (or replaces) the one pending invitation for an address in the caller's
   * business, then mails it.
   *
   * ORDER: write the row, send the mail, and on a delivery failure DELETE the row and
   * report the failure. The alternative — mailing first — would send a link that names
   * no pending invitation, and the alternative to withdrawing — keeping a row whose mail
   * never arrived — would show an admin a pending member who was never asked and cannot
   * respond. The row is worthless without its message, so it goes with it.
   *
   * REPLACING A PENDING INVITATION IS INTENTIONAL: re-inviting somebody whose link
   * expired, or whose role changed, must not fail with "already invited". The old token
   * stops working because its digest is overwritten, which is also the revocation
   * mechanism for a resent link.
   */
  async create(actor: Actor, { email, role }: CreatePayload, landingBaseUrl: string) {
    assertAssignableRole(actor, role);
    await assertActiveBusiness(actor.businessId);

    const normalized = normalizeEmail(email);
    if (!normalized) {
      throw new ApiError(400, 'Validation failed', 'VALIDATION_ERROR');
    }

    // Emails are globally unique on `users`, so an existing account anywhere cannot be
    // invited: acceptance would have to merge two tenants, which is refused elsewhere
    // (Phase 32C/32H) and is not something this flow may invent.
    const existingUser = await User.exists({ email: normalized });
    if (existingUser) {
      throw new ApiError(
        409,
        'This email already belongs to an Inventory AI account',
        INVITATION_EMAIL_IN_USE
      );
    }

    const token = mintToken();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    // Read the two display values the mail needs. Neither is an authorization input.
    const [business, inviter] = await Promise.all([
      Business.findById(actor.businessId).select('name').lean(),
      User.findById(actor.id).select('name').lean(),
    ]);

    let invitation;
    const pending = await Invitation.findOne({
      businessId: actor.businessId,
      email: normalized,
      status: 'PENDING',
    });
    if (pending) {
      pending.role = role;
      pending.tokenHash = tokenDigest(token);
      pending.expiresAt = expiresAt;
      pending.invitedBy = actor.id as mongoose.Types.ObjectId;
      await pending.save();
      invitation = pending;
    } else {
      try {
        invitation = await Invitation.create({
          businessId: actor.businessId,
          email: normalized,
          role,
          tokenHash: tokenDigest(token),
          invitedBy: actor.id,
          status: 'PENDING',
          expiresAt,
        });
      } catch (err) {
        // Two admins pressed send at once and the partial unique index caught the second
        // one. That is not an error the caller should see: the address now has exactly one
        // pending invitation, which is the invariant this route promises. Re-read it and
        // rotate it to this request's token so the message about to be mailed is valid.
        if (!isDuplicateKey(err)) throw err;
        const raced = await Invitation.findOne({
          businessId: actor.businessId,
          email: normalized,
          status: 'PENDING',
        });
        if (!raced) throw err;
        raced.role = role;
        raced.tokenHash = tokenDigest(token);
        raced.expiresAt = expiresAt;
        raced.invitedBy = actor.id as mongoose.Types.ObjectId;
        await raced.save();
        invitation = raced;
      }
    }

    const base = landingBaseUrl.replace(/\/+$/, '');
    const inviteUrl = `${base}/invite?token=${token}`;
    const appUrl = `inventoryai://invite?token=${token}`;

    try {
      await sendInvitationEmail({
        to: normalized,
        inviteUrl,
        appUrl,
        businessName: business?.name ?? 'the business',
        inviterName: inviter?.name ?? 'An administrator',
        role,
        expiresInDays: INVITATION_TTL_DAYS,
      });
    } catch (err) {
      // Withdraw the row: an invitation nobody can receive must not sit in the pending
      // list, and its token must not remain redeemable.
      await Invitation.deleteOne({ _id: invitation._id }).catch(() => {});

      if (err instanceof MailNotConfigured) {
        throw new ApiError(
          503,
          'Email is not configured on this server, so the invitation was not sent. Ask an operator to configure mail.',
          INVITATION_MAIL_NOT_CONFIGURED
        );
      }
      if (err instanceof MailDeliveryError) {
        throw new ApiError(
          502,
          'The invitation email could not be delivered. Check the address and try again.',
          INVITATION_MAIL_FAILED
        );
      }
      throw err;
    }

    await recordAudit({
      businessId: actor.businessId,
      userId: actor.id,
      action: AUDIT_ACTIONS.INVITATION_SENT,
      entityType: AUDIT_ENTITY_TYPES.INVITATION,
      entityId: invitation._id,
      // The role is governance information; the ADDRESS is not, and is omitted on
      // purpose so a later account deletion cannot leave it readable in the trail.
      metadata: { role },
    });

    return toPublicInvitation(invitation);
  },

  /** This business's live invitations, newest first. Expired rows are filtered out. */
  async list(actor: Actor) {
    const docs = await Invitation.find({
      businessId: actor.businessId,
      status: 'PENDING',
      expiresAt: { $gt: new Date() },
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(100);
    return { items: docs.map(toPublicInvitation), total: docs.length };
  },

  /** Withdraws a pending invitation. Scoped to the caller's business, so a foreign id is a 404. */
  async revoke(actor: Actor, id: IdLike) {
    const invitation = await Invitation.findOne({
      _id: id,
      businessId: actor.businessId,
      status: 'PENDING',
    });
    if (!invitation) notFound();
    invitation.status = 'REVOKED';
    // The token must stop resolving the moment it is revoked; the status is what every
    // predicate tests, and nulling the digest means a leaked copy cannot even find the row.
    invitation.tokenHash = tokenDigest(`revoked:${randomBytes(16).toString('hex')}`);
    await invitation.save();

    await recordAudit({
      businessId: actor.businessId,
      userId: actor.id,
      action: AUDIT_ACTIONS.INVITATION_REVOKED,
      entityType: AUDIT_ENTITY_TYPES.INVITATION,
      entityId: invitation._id,
      metadata: { role: invitation.role },
    });
  },

  /**
   * The invitee's read-only view of an invitation: which address it is for, which business
   * and role it offers, and when it stops working. Public, because the caller has not
   * signed in yet — the token is the whole proof, and nothing here is actionable without
   * the inbox it was mailed to.
   */
  async preview(token: string) {
    const invitation = await Invitation.findOne({
      tokenHash: tokenDigest(token),
      status: 'PENDING',
      expiresAt: { $gt: new Date() },
    }).lean();
    if (!invitation) {
      throw new ApiError(404, 'This invitation is no longer valid. Ask for a new one.', INVITATION_INVALID);
    }
    const business = await Business.findById(invitation.businessId).select('name').lean();
    return {
      email: invitation.email,
      role: invitation.role,
      businessName: business?.name ?? null,
      expiresAt: invitation.expiresAt,
    };
  },

  /**
   * Resolves the invitation a registration is being completed against.
   *
   * Called by `registerBusinessFromFirebase` AFTER it has verified the token, the
   * `emailVerified` claim and the address, so the invitation decides the tenant and the
   * role and nothing else. The email comparison is here — not only in the caller — so a
   * second caller could not forget it.
   *
   * Expiry, revocation and prior acceptance all answer the SAME 404/invalid code: the
   * token holder learns that the invitation is not usable, not which of the three
   * happened, and a replayed acceptance cannot distinguish itself from a revoked one.
   */
  async resolvePendingForRegistration(token: string, verifiedEmail: string) {
    const invitation = await Invitation.findOne({
      tokenHash: tokenDigest(token),
      status: 'PENDING',
      expiresAt: { $gt: new Date() },
    });
    if (!invitation) {
      throw new ApiError(404, 'This invitation is no longer valid. Ask for a new one.', INVITATION_INVALID);
    }
    if (invitation.email !== normalizeEmail(verifiedEmail)) {
      throw new ApiError(
        403,
        'This invitation was sent to a different email address. Sign in with that address to accept it.',
        INVITATION_EMAIL_MISMATCH
      );
    }
    return invitation;
  },

  /** Marks an accepted invitation spent, recording which account it produced. Never unset. */
  async markAccepted(invitationId: IdLike, userId: IdLike) {
    await Invitation.updateOne(
      { _id: invitationId, status: 'PENDING' },
      { $set: { status: 'ACCEPTED', acceptedBy: userId, acceptedAt: new Date() } }
    );
  },
};

export default invitationsService;
