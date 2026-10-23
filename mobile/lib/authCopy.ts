import { ApiError } from './client';

/**
 * The plumbing the auth screens had copied, in one place.
 *
 * WHY THIS EXISTS. `fieldMap` had been pasted into every screen that reads a 400's `fields`
 * array, and `formatRemaining` into every screen that shows a wait. Copies do not drift
 * loudly — they drift one sentence at a time, and a person then reads two different
 * explanations of the same refusal depending on which screen they were on. These two
 * functions are the ones whose behaviour must be identical everywhere, so they live here
 * and nowhere else.
 *
 * WHAT THIS IS NOT. It is not a translation table for every server code. Each screen still
 * owns the sentences that describe its own step (a reset screen and a sign-in screen are
 * describing different situations even when the code is the same), and the shared sentences
 * that are genuinely global live in `lib/validation.ts` next to the rules they state.
 */

/**
 * The field-keyed messages from a 400's `fields` array, or an empty object.
 *
 * The shape is the one a screen's `Input`s already read (`fieldErrors[field]`), and an
 * empty result is the caller's signal to fall back to the banner — so a response with no
 * field detail never renders an empty, unactionable red line under an input.
 */
export function fieldErrorsFrom(err: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (err instanceof ApiError && Array.isArray(err.fields)) {
    for (const problem of err.fields) out[problem.field] = problem.message;
  }
  return out;
}

/**
 * A short, human wait: seconds below a minute, otherwise minutes and seconds.
 *
 * Used for two different clocks — a resend cooldown and a code's remaining lifetime — so it
 * must never round a live second down to zero and it must never say "0s" while a control is
 * still disabled. `Math.ceil` lives at the call site, where the deadline is known.
 */
export function formatRemaining(seconds: number): string {
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
  }
  return `${seconds}s`;
}
