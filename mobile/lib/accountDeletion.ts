import { deleteAccount as apiDeleteAccount } from './api';
import type { ApiResponse } from './api';
import { currentFirebaseIdToken } from './firebase-auth';

/**
 * Self-service account deletion (2026-10-24).
 *
 * WHY THIS IS A MODULE AND NOT JUST CODE IN THE SCREEN. Two decisions have to agree
 * with the server and with each other, and neither is a layout concern:
 *
 *   1. WHAT COUNTS AS RE-AUTHENTICATION. A Firebase-linked account proves itself with
 *      an ID token minted by the identity provider; a legacy password account proves
 *      itself with its current password. The screen must not have to know which, and
 *      the choice must not be made from anything the person types.
 *   2. THE CONFIRMATION WORD. It is a constant on both sides — the server compares
 *      against `DELETE_CONFIRMATION_PHRASE` in `accountDeletion.service.ts`, and a
 *      server test reads THIS file to prove the two still agree. Getting it wrong on
 *      either side makes deletion impossible to confirm rather than unsafe, but it is
 *      exactly the kind of copy that drifts silently.
 *
 * WHAT THIS MODULE NEVER DOES: it never sends an account id, a business id, a role or
 * a Firebase uid. The account is the session's own, and the identity is whatever the
 * provider says it is.
 */

/** The word a person must type. Pinned to the server's copy by `ACCOUNT-DELETION.test.mjs`. */
export const DELETE_CONFIRMATION = 'DELETE';

/** A refusal this module produces before any request is made. */
export class AccountDeletionError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'AccountDeletionError';
    this.code = code;
  }
}

export interface DeleteMyAccountInput {
  /** The session's access token. The account deleted is this token's own. */
  token: string;
  /** The typed confirmation word, untrimmed — the module trims it. */
  confirmation: string;
  /** True when the account signs in through Firebase; the identity provider is asked. */
  firebase: boolean;
  /** Required only for a legacy password account. */
  password?: string;
}

/**
 * Deletes the signed-in person's account.
 *
 * Resolves only when the server has confirmed the account is gone. Every failure is
 * thrown for the caller to show:
 *
 *   - a blank/mistyped confirmation and a missing password are refused HERE, so the
 *     request is not spent against the server's per-account budget;
 *   - a Firebase account with no live identity is refused HERE as `NO_IDENTITY`,
 *     because a request without a credential would only be a 400 from the server;
 *   - everything else (`ApiError`) carries the server's own status, code and sentence,
 *     including the last-owner 409 and the 429. None of them is a 401, so a screen may
 *     show them without signing the person out.
 *
 * The caller is responsible for clearing the local session afterwards: the server has
 * already ended every session this account held, so the token in hand is dead.
 */
export async function deleteMyAccount({
  token,
  confirmation,
  firebase,
  password,
}: DeleteMyAccountInput): Promise<ApiResponse> {
  const typed = confirmation.trim();

  if (typed !== DELETE_CONFIRMATION) {
    throw new AccountDeletionError(`Type ${DELETE_CONFIRMATION} to confirm.`, 'CONFIRMATION_REQUIRED');
  }

  if (firebase) {
    const idToken = await currentFirebaseIdToken();
    if (!idToken) {
      // Nothing is sent. The account is untouched, and the message names the remedy
      // rather than implying the deletion failed.
      throw new AccountDeletionError(
        'Your sign-in could not be confirmed. Sign in again, then retry the deletion.',
        'NO_IDENTITY'
      );
    }
    return apiDeleteAccount(token, { confirmation: typed, idToken });
  }

  if (!password) {
    throw new AccountDeletionError('Your current password is required.', 'PASSWORD_REQUIRED');
  }

  return apiDeleteAccount(token, { confirmation: typed, currentPassword: password });
}
