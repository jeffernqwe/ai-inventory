/**
 * Account-deletion constants shared by the validator, the service and the tests.
 *
 * WHY A CONSTANTS MODULE rather than a literal in each place: the confirmation word is
 * compared by the HTTP payload validator (so a mistyped word is a FIELD error under the
 * input), re-checked by the service (defence in depth), and asserted by the mobile suite
 * against `mobile/lib/accountDeletion.ts`. Three copies of `'DELETE'` would be three
 * places to drift, and a drift makes deletion impossible to confirm rather than unsafe —
 * the kind of failure that looks like a client bug for a long time.
 */

/** The word a person must type to confirm account deletion. */
export const DELETE_CONFIRMATION_PHRASE = 'DELETE';

/** The placeholder name written over a deleted person's name. */
export const DELETED_USER_NAME = 'Deleted user';

/** RFC 2606 reserves `.invalid`: mail to the tombstone address can never be delivered. */
export const DELETED_EMAIL_DOMAIN = 'deleted.invalid';

export default {
  DELETE_CONFIRMATION_PHRASE,
  DELETED_USER_NAME,
  DELETED_EMAIL_DOMAIN,
};
