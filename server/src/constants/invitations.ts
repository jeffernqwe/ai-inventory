/**
 * Invitation-based onboarding — the flow's own vocabulary.
 *
 * WHY THIS EXISTS. Today the only way to add a colleague is `POST /api/users`, which
 * makes an admin invent a password for somebody else and hand it over. That is both a
 * security smell (a password known to two people) and the single hard prerequisite for
 * retiring the legacy password login: `users.service.create` writes a `passwordHash`
 * and no `firebaseUid`, so removing legacy login would strand every account it created.
 *
 * An invitation moves the credential decision to the person who will use it. The admin
 * names an address and a role; the INVITEE proves that address through the existing
 * AUTH-04 six-digit verification and then creates their own Firebase identity. The
 * server never sees, generates or stores a password for them.
 *
 * THE INVITATION IS NOT A CREDENTIAL FOR AN ACCOUNT. Holding the token proves only
 * that the holder received a message addressed to a particular email; acceptance
 * additionally requires a VERIFIED Firebase identity for that same address. A leaked
 * link therefore grants nothing on its own, which is why the token can be a plain
 * random value mailed to the address rather than a second secret to manage.
 *
 * SEVEN DAYS. Long enough for somebody to read mail on Monday and act on Friday, short
 * enough that an unanswered invitation does not linger as a standing grant. The dated
 * value is the flow's policy and is imported by the template, the service and the
 * client-facing copy rather than restated in each.
 */

/** The collection the model declares, exported so tests and tooling agree on the name. */
export const INVITATION_COLLECTION = 'invitations';

/** How long an invitation stays redeemable. */
export const INVITATION_TTL_DAYS = 7;

/** The same window in milliseconds — what the service adds to "now". */
export const INVITATION_TTL_MS = INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000;

/**
 * The roles an invitation may carry.
 *
 * OWNER is deliberately absent, and not because of an oversight: a business already has
 * an owner by construction, the ownership-transfer question is a separate product
 * decision, and `users.service` refuses to create an OWNER through the API for exactly
 * the same reason. An invitation that could mint an OWNER would be a second, quieter
 * way to do the thing that route refuses.
 */
export const INVITABLE_ROLES = Object.freeze(['ADMIN', 'MANAGER', 'STAFF'] as const);

/** The 32-byte token's hex length. Validated before a lookup so a malformed value is a 400. */
export const INVITATION_TOKEN_LENGTH = 64;

/**
 * The accepted token shape: exactly the hex `randomBytes(32)` produces.
 *
 * Shared by the request validator and the landing page so both recognise the same values,
 * and so neither can accept something the other would refuse.
 */
export const INVITATION_TOKEN_PATTERN = new RegExp(`^[a-f0-9]{${INVITATION_TOKEN_LENGTH}}$`);

/** The invitation is unknown, expired, revoked or already accepted — one answer, no oracle. */
export const INVITATION_INVALID = 'INVITATION_INVALID';

/**
 * The signed-in identity's verified address is not the address that was invited.
 *
 * Separate from INVITATION_INVALID because the remedy is different and the client can
 * name it: the invitation is fine, the account is wrong. Nothing about the invitation's
 * tenant or role is disclosed with it.
 */
export const INVITATION_EMAIL_MISMATCH = 'INVITATION_EMAIL_MISMATCH';

/** The address is already a member of an Inventory AI business (emails are globally unique). */
export const INVITATION_EMAIL_IN_USE = 'INVITATION_EMAIL_IN_USE';

/** The invitation was created but the mail could not be delivered, so it was withdrawn. */
export const INVITATION_MAIL_FAILED = 'INVITATION_MAIL_FAILED';

/** Mail is not configured at all. Pre-send, so the caller is told to ask an operator. */
export const INVITATION_MAIL_NOT_CONFIGURED = 'INVITATION_MAIL_NOT_CONFIGURED';

/** Per-account cap on invitations sent, so the endpoint cannot be used to post mail at scale. */
export const INVITATION_SEND_RATE_LIMITED = 'INVITATION_SEND_RATE_LIMITED';

/** Per-IP cap on previewing an invitation token. */
export const INVITATION_PREVIEW_RATE_LIMITED = 'INVITATION_PREVIEW_RATE_LIMITED';
