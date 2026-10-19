/**
 * AI error types. These are deliberately distinct from the general ApiError
 * envelope so the AI controller can map them to clean client responses:
 *
 *   AiNotConfigured  -> 503 AI_NOT_CONFIGURED (operator must configure the server)
 *   AiProviderError  -> 502 AI_UNAVAILABLE    (transient upstream failure)
 *   AiQuotaExceeded  -> 429 AI_QUOTA_EXCEEDED (a LIMIT was reached, not an outage, AI-6)
 *   AiTimeout        -> 504 AI_TIMEOUT        (the turn outlasted its own deadline, AI-1)
 *   AiAbandoned      -> 499 AI_ABANDONED      (the CALLER went away, AI-1)
 *   AiOutputLimit    -> 502 AI_OUTPUT_LIMIT   (the model spent its own output budget, AI-10)
 *
 * A FAILURE CAN STILL KNOW WHAT IT COST. `AiOutputLimit` may carry the model it
 * happened on and the token spend the gateway reported, because that class is raised
 * at the one place where both are already parsed — and a spent output budget is
 * exactly the turn whose cost an operator needs. Before this, the AI-5 turn line
 * reported `in=0 out=0 model=unknown` for it (found on the device 2026-10-17), which
 * is the opposite of the truth: the model burned its entire budget. Nothing else
 * carries accounting today, so the reader stays narrow on purpose.
 *
 * No type carries secrets, stack traces, or internal URIs. Provider internals
 * (raw upstream bodies, keys) are logged server-side only.
 *
 * Each error has its OWN status and its OWN code because each failure needs a
 * different thing from the reader: configure the server, retry the service, wait,
 * stop retrying and come back later, ask for less at once. Collapsing any two of
 * them is what made a spent allowance look like a broken server (AI-6) and what
 * made a spent output budget look like one too (AI-10).
 */

export const AI_NOT_CONFIGURED = 'AI_NOT_CONFIGURED';
export const AI_UNAVAILABLE = 'AI_UNAVAILABLE';
export const AI_QUOTA_EXCEEDED = 'AI_QUOTA_EXCEEDED';
export const AI_TIMEOUT = 'AI_TIMEOUT';
export const AI_ABANDONED = 'AI_ABANDONED';
export const AI_OUTPUT_LIMIT = 'AI_OUTPUT_LIMIT';

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
 * The model spent its whole output budget (`AI_MAX_OUTPUT_TOKENS`) before producing
 * anything usable — no text, no tool call (AI-10).
 *
 * Deliberately NOT an AiProviderError, for the same reason AiTimeout, AiAbandoned and
 * AiQuotaExceeded are not: nothing upstream failed and nothing is unavailable. The
 * gateway answered 2xx with an empty body because the model was still working when it
 * hit its own cap, and the correct thing to tell the member is therefore *not* "try
 * again in a moment" — the same question spends the same budget again. It is the one
 * class the controller maps to its own sentence, and the one that used to arrive as a
 * provider outage: measured twice on the 50 000-product tenant 2026-10-16 (§27BG Q4,
 * §27CK) at 31 421 ms and 31 789 ms, with the turn's tool already run and answered.
 */
export class AiOutputLimit extends Error {
  declare code: string;

  /** The model whose output budget was spent, when the wire named one. */
  model?: string;

  /** What it burned before it ran out of room, when the gateway reported it. */
  usage?: { inputTokens: number; outputTokens: number } | null;

  constructor(
    message = 'The assistant ran out of room before it could answer. Please ask a shorter or more specific question.',
    accounting: AiErrorAccounting = {},
  ) {
    super(message);
    this.name = 'AiOutputLimit';
    this.code = AI_OUTPUT_LIMIT;
    // Adopted only when present: an absent report stays absent rather than becoming
    // a zero, so a turn line can never present "not measured" as "cost nothing".
    if (typeof accounting.model === 'string' && accounting.model) this.model = accounting.model;
    if (accounting.usage) this.usage = accounting.usage;
  }
}

/**
 * The accounting a failure may know: the model it happened on and the tokens spent.
 *
 * A shape rather than an import, so this module keeps depending on nothing — the
 * neutral `ProviderUsage` it mirrors is structurally identical, and the service
 * assigns it straight back into its own usage variable.
 */
export interface AiErrorAccounting {
  model?: string;
  usage?: { inputTokens: number; outputTokens: number } | null;
}

/**
 * Read whatever accounting an error carries, and nothing else.
 *
 * Deliberately defensive about the two known fields and silent about everything
 * else: these values end up in a log line, so a malformed one must be dropped
 * rather than printed. Undefined fields stay undefined, so a failure that knows
 * nothing cannot make the service's counters look measured.
 */
export function aiErrorAccounting(err: unknown): AiErrorAccounting {
  const e = err as { model?: unknown; usage?: unknown } | null | undefined;
  const out: AiErrorAccounting = {};
  if (typeof e?.model === 'string' && e.model) out.model = e.model;
  const raw = e?.usage as { inputTokens?: unknown; outputTokens?: unknown } | null | undefined;
  if (raw && typeof raw.inputTokens === 'number' && typeof raw.outputTokens === 'number') {
    out.usage = { inputTokens: raw.inputTokens, outputTokens: raw.outputTokens };
  }
  return out;
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
    err instanceof AiAbandoned ||
    err instanceof AiOutputLimit
  );
}

export default {
  AiNotConfigured,
  AiProviderError,
  AiQuotaExceeded,
  AiTimeout,
  AiAbandoned,
  AiOutputLimit,
  AI_NOT_CONFIGURED,
  AI_UNAVAILABLE,
  AI_QUOTA_EXCEEDED,
  AI_TIMEOUT,
  AI_ABANDONED,
  AI_OUTPUT_LIMIT,
  isAiError,
  aiErrorAccounting,
};
