/**
 * Shared field validation for the authentication screens.
 *
 * WHY THIS EXISTS. Every auth screen already checked its own required fields before
 * submitting — every one except `login.tsx`, which sent an empty form straight to
 * Firebase (or, on a build with no Firebase configuration, to
 * `POST /api/auth/login`) and reported the generic "Unable to sign in. Please try
 * again." for the single mistake a person is most likely to make. Two things follow
 * from that:
 *
 *   1. The rules live in ONE place, so five screens cannot each invent their own
 *      wording for the same problem. The copy below is the copy the screens already
 *      showed, so consolidating it changes no existing sentence.
 *   2. The EMAIL FORMAT rule can exist at all. It was previously absent from every
 *      screen, so a malformed address travelled to Firebase or to the server and came
 *      back described in words written for a developer ("email must be a valid email
 *      address"). `EMAIL_INVALID` is deliberately the same sentence the Firebase error
 *      table uses for `auth/invalid-email`, so one mistake reads one way whichever
 *      layer notices it first.
 *
 * THIS IS UX VALIDATION, NOT A SECURITY BOUNDARY. It saves a round trip and produces
 * a sentence a person can act on; the server remains the authority
 * (`server/src/utils/validate.ts`) and nothing here decides who may sign in. THE EMAIL
 * RULE IS DELIBERATELY THE SERVER'S OWN — the same shape and the same length bound —
 * because a client rule stricter than the server's would invent a refusal the backend
 * never asked for.
 *
 * WHAT IS DELIBERATELY NOT HERE. There is no minimum password length. At SIGN-IN that
 * would be a guess about an account rather than a rule about an input, and an account
 * that predates the current 8-character policy would be told its own correct password
 * is too short. The server's `validateLogin` draws the same line — presence only — and
 * this mirrors it. Length rules belong on the screens that CHOOSE a password
 * (`register.tsx`, `reset-password.tsx`, `change-password.tsx`).
 */

/** The address field is empty. Unchanged copy from the screens that already had it. */
export const EMAIL_REQUIRED = 'Email is required';

/** An address is present but not usable. Mirrors the Firebase table's own sentence. */
export const EMAIL_INVALID = 'Enter a valid email address.';

/** The password field is empty. Unchanged copy from the screens that already had it. */
export const PASSWORD_REQUIRED = 'Password is required';

/**
 * The password LENGTH rule, for the screens that CHOOSE a password.
 *
 * These two numbers are the server's own (`PASSWORD_MIN`/`PASSWORD_MAX` in
 * `server/src/utils/validate.ts`) and are pinned to it by
 * `__tests__/auth-validation-rules.test.ts`, so they cannot drift any more than the
 * email rule can. The sentences are the ones `reset-password.tsx` and
 * `change-password.tsx` already showed; this only makes them shared.
 */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;
export const PASSWORD_TOO_SHORT = 'Password must be at least 8 characters';
export const PASSWORD_TOO_LONG = 'Password must be at most 72 characters';

/**
 * The server's own address rule, copied rather than re-invented:
 * `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` with a 254-character bound
 * (`server/src/utils/validate.ts`). Same shape, same bound — so this layer can never
 * refuse an address the server would have accepted.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX = 254;

/**
 * The problem with an email address, or `null`.
 *
 * `value` IS TRIMMED HERE, because a trailing space is the most common way a correct
 * address becomes an incorrect one and it is invisible on a phone keyboard. Every
 * caller in this project sends the trimmed form onward — the server normalises the
 * same way — so testing the untrimmed string would refuse input the request would
 * have accepted.
 */
export function emailProblem(value: string): string | null {
  const email = value.trim();
  if (!email) return EMAIL_REQUIRED;
  if (email.length > EMAIL_MAX || !EMAIL_RE.test(email)) return EMAIL_INVALID;
  return null;
}

/**
 * The problem with a sign-in password, or `null`. Presence only — see the note above
 * on why a length rule does not belong at sign-in.
 */
export function passwordProblem(value: string): string | null {
  return value ? null : PASSWORD_REQUIRED;
}

/**
 * The problem with a password being CHOSEN, or `null` — presence assumed to be
 * satisfied (a caller checks {@link passwordProblem} first, so an empty field reports
 * `required` rather than `too short`).
 *
 * This exists because Registration was the one screen that chose a password without
 * checking its length: a 5-character password was sent, and the server's answer came
 * back under the input in words written for a developer — "password must be at least 8
 * characters". `reset-password.tsx` and `change-password.tsx` already checked it; this
 * brings the third screen into line and gives all three one sentence.
 */
export function passwordStrengthProblem(value: string): string | null {
  if (value.length < PASSWORD_MIN) return PASSWORD_TOO_SHORT;
  if (value.length > PASSWORD_MAX) return PASSWORD_TOO_LONG;
  return null;
}

/**
 * The email/password pair as the field-keyed map a screen's `Input`s read.
 *
 * Returns an EMPTY OBJECT when both are usable, so a caller's whole guard is
 * `if (Object.keys(problems).length) return;` — the same shape `register.tsx` already
 * builds by hand, which is what keeps this from being a second convention.
 */
export function credentialsProblems(email: string, password: string): Record<string, string> {
  const problems: Record<string, string> = {};
  const emailIssue = emailProblem(email);
  const passwordIssue = passwordProblem(password);
  if (emailIssue) problems.email = emailIssue;
  if (passwordIssue) problems.password = passwordIssue;
  return problems;
}
