/**
 * AI error types. These are deliberately distinct from the general ApiError
 * envelope so the AI controller can map them to clean client responses:
 *
 *   AiNotConfigured  -> 503 AI_NOT_CONFIGURED (operator must configure the server)
 *   AiProviderError  -> 502 AI_UNAVAILABLE    (transient upstream failure)
 *   AiQuotaExceeded  -> 429 AI_QUOTA_EXCEEDED (a LIMIT was reached, not an outage, AI-6)
 *   AiTimeout        -> 504 AI_TIMEOUT        (the turn outlasted its own deadline, AI-1)
 *   AiAbandoned      -> 499 AI_ABANDONED      (the CALLER went away, AI-1)
 *
 * No type carries secrets, stack traces, or internal URIs. Provider internals
 * (raw upstream bodies, keys) are logged server-side only.
 *
 * Each error has its OWN status because the four failures need four different
 * things from the reader: configure the server, retry the service, wait — or,
 * for AI-6, stop retrying immediately and come back later. Collapsing any two of
 * them is what made a spent allowance look like a broken server.
 */

export const AI_NOT_CONFIGURED = 'AI_NOT_CONFIGURED';
export const AI_UNAVAILABLE = 'AI_UNAVAILABLE';
export const AI_QUOTA_EXCEEDED = 'AI_QUOTA_EXCEEDED';
export const AI_TIMEOUT = 'AI_TIMEOUT';
export const AI_ABANDONED = 'AI_ABANDONED';

export class AiNotConfigured extends Error {
  declare code: string;

  constructor(message = 'The AI assistant is not configured on this server.') {
    super(message);
    this.name = 'AiNotConfigured';
    this.code = AI_NOT_CONFIGURED;
  }
}

export class AiProviderError extends Error {
  declare code: string;

  constructor(message = 'The AI service could not be reached.', code = AI_UNAVAILABLE) {
    super(message);
    this.name = 'AiProviderError';
    this.code = code;
  }
}

/**
 * The AI gateway refused the call because a LIMIT was reached (AI-6).
 *
 * Deliberately NOT an AiProviderError, for the same reason AiTimeout is not one:
 * "the plan's allowance is spent" and "the service is broken" are different
 * facts. Measured on the hardware 2026-10-13 (§27BF), the dominant failure at this
 * tier is a `429 free-models-per-day` quota answer — and it used to reach the
 * member as `502 AI_UNAVAILABLE`, *"temporarily unavailable, please try again in
 * a moment"*, which is false twice over: nothing upstream is unavailable, and
 * retrying in a moment cannot help while a daily allowance is spent.
 *
 * Raised from exactly one place — a 429 in providers/http.ts. Every other non-2xx
 * stays an AiProviderError on purpose: a 5xx really is an outage, and
 * reclassifying one as a limit would tell a member to wait for something that is
 * broken. The converse direction matters just as much: a rate limit is NOT
 * retried by the turn loop, because AI-2's rule is that a provider refusal is
 * never answered by paying for it twice while the cause is hidden.
 */
export class AiQuotaExceeded extends Error {
  declare code: string;

  constructor(message = 'The AI assistant has reached its usage limit. Please try again later.') {
    super(message);
    this.name = 'AiQuotaExceeded';
    this.code = AI_QUOTA_EXCEEDED;
  }
}

/**
 * One chat turn exceeded its own wall-clock deadline (AI-1).
 *
 * Deliberately NOT an AiProviderError: "we gave up waiting" and "the provider
 * failed" are different facts, need different client copy, and must not be
 * reported to a user as an unreachable server. The turn deadline in
 * ai.service.ts is what raises it.
 */
export class AiTimeout extends Error {
  declare code: string;

  constructor(message = 'The assistant took too long to answer. Please try again.') {
    super(message);
    this.name = 'AiTimeout';
    this.code = AI_TIMEOUT;
  }
}

/**
 * The caller went away before the answer existed (AI-1).
 *
 * Its own type so that an abandoned turn is not logged as a timeout and, above
 * all, is not turned into a 502 written to a socket nobody is reading. The 499
 * it maps to is the conventional nginx "client closed request" status, and it
 * exists here for the same reason the abort probe mattered: before AI-1 an
 * abandoned turn left no server-side trace at all, so a request the client had
 * given up on was indistinguishable from a response the client never asked for.
 */
export class AiAbandoned extends Error {
  declare code: string;

  constructor(message = 'The request was cancelled before the assistant answered.') {
    super(message);
    this.name = 'AiAbandoned';
    this.code = AI_ABANDONED;
  }
}

/**
 * True for every error the AI layer raises on purpose. ai.service.ts uses this to
 * let its own failures through its provider-failure catch untouched — which is
 * what keeps an AiTimeout an AiTimeout rather than a 502.
 */
export function isAiError(err: unknown) {
  return (
    err instanceof AiNotConfigured ||
    err instanceof AiProviderError ||
    err instanceof AiQuotaExceeded ||
    err instanceof AiTimeout ||
    err instanceof AiAbandoned
  );
}

export default {
  AiNotConfigured,
  AiProviderError,
  AiQuotaExceeded,
  AiTimeout,
  AiAbandoned,
  AI_NOT_CONFIGURED,
  AI_UNAVAILABLE,
  AI_QUOTA_EXCEEDED,
  AI_TIMEOUT,
  AI_ABANDONED,
  isAiError,
};
