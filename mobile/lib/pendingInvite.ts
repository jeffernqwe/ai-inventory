/**
 * The invitation this run is accepting, held in MEMORY ONLY.
 *
 * WHY A MODULE AND NOT A ROUTE PARAMETER. The token is a bearer-ish value: it resolves an
 * invitation and, together with a verified identity for the invited address, creates a
 * membership. Putting it in a route parameter would write it into navigation state that can
 * be logged, restored from persistence, or copied by deep-link handling; putting it here
 * means it dies with the process and never reaches a URL inside the app.
 *
 * WHY IT IS NOT PERSISTED AT ALL. Unlike the session token, an invitation is not needed
 * across launches: the email still contains the link, and opening it again re-creates this
 * value. Persisting it would turn a seven-day invitation into a stored secret on the
 * device for no benefit. A cold start therefore forgets it, and the screens say so by
 * offering the link again rather than pretending to be mid-flow.
 *
 * NOTHING AUTHORIZES FROM THIS VALUE. It is sent to the server with a Firebase ID token;
 * the server resolves the invitation, compares the invited address with the VERIFIED
 * identity's address, and reads the tenant and role from its own row. A tampered value here
 * can only fail.
 */

interface PendingInvite {
  token: string;
  email: string;
  businessName: string | null;
  role: string;
}

let pending: PendingInvite | null = null;

/** Records the invitation being accepted. */
export function setPendingInvite(invite: PendingInvite): void {
  pending = { ...invite };
}

/** The invitation being accepted, or null. A copy, so a caller cannot mutate the store. */
export function getPendingInvite(): PendingInvite | null {
  return pending ? { ...pending } : null;
}

/** Forgets it. Called once a session exists, and when the person abandons the invitation. */
export function clearPendingInvite(): void {
  pending = null;
}

export default { setPendingInvite, getPendingInvite, clearPendingInvite };
