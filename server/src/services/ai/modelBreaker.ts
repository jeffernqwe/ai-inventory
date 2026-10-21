/**
 * AI-30 — a short memory for models that just failed, so a turn stops paying for a
 * model the deployment already knows is broken.
 *
 * THE PROBLEM. AI-29 fails a turn over to the next configured model, but the
 * configured primary is tried FIRST on every new turn. A permanently dead model
 * therefore costs one failed request per turn — and, on a free tier, a share of a
 * shared allowance — for as long as an operator leaves it configured. The failover
 * makes a broken model survivable; it does not make it cheap.
 *
 * WHAT THIS IS. A closed-open breaker per model id, entirely in memory:
 *
 *   closed     failures < 5 -> the model is tried normally.
 *   open       failures >= 5 -> the model is skipped until `openUntil`.
 *   half-open  `openUntil` has passed -> the model is tried again. A failure
 *              re-opens it immediately (the count is not reset at cooldown end);
 *              a success closes it and forgets the count.
 *
 * WHY THE COUNT IS NOT RESET AT COOLDOWN END. Resetting it would let a dead model
 * cost five more failed requests every 30 seconds instead of one. Keeping the count
 * means the first failure after a cooldown re-opens the breaker at once.
 *
 * WHAT TOUCHES IT. Availability failures: the MODEL_FAILOVER_STATUSES class
 * (404/410/5xx) and, since AI-31, a CLASSIFIED transport failure (`network`,
 * `timeout`, `invalid_response`). A transport failure is not the model's fault, but
 * five consecutive ones mean no model can serve this process for now, so counting
 * them stops the assistant from paying for the same outage on every turn. They never
 * cause an in-turn failover — another model would travel the same broken path.
 *
 * WHAT NEVER TOUCHES IT. A spent allowance (429/402), a bad key or request
 * (400/401/403), a configuration error, and an error that carries neither a status
 * nor a declared kind: none is evidence that the assistant is unavailable for a
 * while, and none may make the next turn skip a model that was never broken.
 *
 * SCOPE. One process, one map. It is deliberately not persisted and not shared
 * between instances: a cooldown is a 30-second fact about *this* process's recent
 * experience, and a restart is exactly the moment to re-test everything. It is also
 * not a health registry — `npm run ai:check` remains the way to prove a model
 * answers.
 */

/** Default consecutive model-specific failures that open the breaker. */
export const MODEL_FAILURE_THRESHOLD = 5;

/** Default cooldown once the threshold is reached. */
export const MODEL_COOLDOWN_MS = 30_000;

/**
 * The cooldown ceiling. A model that keeps failing after each trial is retried less and less
 * often — 30 s, 60 s, 2 min, 4 min, then no more than every 5 min — so a permanently dead
 * model costs a handful of probes per hour instead of one per cooldown window.
 */
export const MODEL_COOLDOWN_MAX_MS = 300_000;

/** How the breaker is tuned. Both values come from `aiConfig()`, so `.env` owns them. */
export interface ModelBreakerOptions {
  threshold?: number;
  cooldownMs?: number;
  maxCooldownMs?: number;
}

interface BreakerEntry {
  /** Consecutive MODEL-specific failures; cleared by one success. */
  failures: number;
  /** `null` while closed; a timestamp while open (or after a failed half-open trial). */
  openUntil: number | null;
  lastFailureAt: number;
  /** How many times the breaker has opened since the last success; drives the backoff. */
  opens: number;
}

/** Kept small on purpose: keyed by `provider.model`, so one entry per configured model. */
const entries = new Map<string, BreakerEntry>();

function keyOf(model: string | null | undefined): string {
  return typeof model === 'string' ? model.trim() : '';
}

/** Consecutive model-specific failures recorded for an id (0 when it has none). */
export function modelFailureCount(model: string | null | undefined): number {
  const key = keyOf(model);
  return key ? (entries.get(key)?.failures ?? 0) : 0;
}

/** True while a model is inside its cooldown window. */
export function isModelCooling(model: string | null | undefined, now: number = Date.now()): boolean {
  const key = keyOf(model);
  if (!key) return false;
  const entry = entries.get(key);
  return Boolean(entry && entry.openUntil !== null && entry.openUntil > now);
}

/** Milliseconds until a cooling model becomes eligible again (0 when it is not cooling). */
export function modelCooldownRemainingMs(model: string | null | undefined, now: number = Date.now()): number {
  const key = keyOf(model);
  if (!key) return 0;
  const entry = entries.get(key);
  if (!entry || entry.openUntil === null) return 0;
  return Math.max(0, entry.openUntil - now);
}

/**
 * Record one model-specific failure and report what it did to the breaker.
 *
 * `opened` is true when this failure took the model out of selection (the threshold was
 * reached, or a half-open trial failed). `cooldownMs` is the window actually applied, which
 * grows on repeated opens. Callers log it; nothing here writes to the console, so a unit test
 * can assert state without capture.
 */
export function recordModelFailure(
  model: string | null | undefined,
  now: number = Date.now(),
  options: ModelBreakerOptions = {},
): { failures: number; opened: boolean; openUntil: number | null; cooldownMs: number } {
  const key = keyOf(model);
  if (!key) return { failures: 0, opened: false, openUntil: null, cooldownMs: 0 };

  const threshold =
    Number.isInteger(options.threshold) && (options.threshold as number) > 0
      ? (options.threshold as number)
      : MODEL_FAILURE_THRESHOLD;
  const baseCooldown =
    Number.isFinite(options.cooldownMs) && (options.cooldownMs as number) > 0
      ? (options.cooldownMs as number)
      : MODEL_COOLDOWN_MS;
  const maxCooldown = Math.max(
    baseCooldown,
    Number.isFinite(options.maxCooldownMs) && (options.maxCooldownMs as number) > 0
      ? (options.maxCooldownMs as number)
      : MODEL_COOLDOWN_MAX_MS,
  );

  const entry = entries.get(key) ?? { failures: 0, openUntil: null, lastFailureAt: now, opens: 0 };
  entry.failures += 1;
  entry.lastFailureAt = now;

  const opened = entry.failures >= threshold;
  let cooldownMs = 0;
  if (opened) {
    // FIRST open uses the configured base; each failed trial after a cooldown doubles it,
    // up to the ceiling. A success deletes the entry, so the backoff resets with recovery.
    entry.opens += 1;
    cooldownMs = Math.min(baseCooldown * 2 ** (entry.opens - 1), maxCooldown);
    entry.openUntil = now + cooldownMs;
  }

  entries.set(key, entry);
  return { failures: entry.failures, opened, openUntil: entry.openUntil, cooldownMs };
}

/**
 * Record a successful call: the model is healthy, so the streak and any cooldown
 * are forgotten. A half-open trial that succeeds closes the breaker here.
 */
export function recordModelSuccess(model: string | null | undefined): void {
  const key = keyOf(model);
  if (key) entries.delete(key);
}

/** Models from `models` that are cooling down right now, in the order given. */
export function coolingModels(models: readonly string[], now: number = Date.now()): string[] {
  return models.filter((model) => isModelCooling(model, now));
}

/** Test-only: forget every breaker. Production code never needs this. */
export function resetModelBreaker(): void {
  entries.clear();
}

/** A read-only view for tests and diagnostics; never sent to a client. */
export function modelBreakerSnapshot(now: number = Date.now()): Array<{
  model: string;
  failures: number;
  opens: number;
  cooling: boolean;
  cooldownRemainingMs: number;
}> {
  return [...entries.entries()].map(([model, entry]) => ({
    model,
    failures: entry.failures,
    opens: entry.opens,
    cooling: Boolean(entry.openUntil !== null && entry.openUntil > now),
    cooldownRemainingMs: entry.openUntil === null ? 0 : Math.max(0, entry.openUntil - now),
  }));
}

export default {
  MODEL_FAILURE_THRESHOLD,
  MODEL_COOLDOWN_MS,
  MODEL_COOLDOWN_MAX_MS,
  modelFailureCount,
  isModelCooling,
  modelCooldownRemainingMs,
  recordModelFailure,
  recordModelSuccess,
  coolingModels,
  resetModelBreaker,
  modelBreakerSnapshot,
};
