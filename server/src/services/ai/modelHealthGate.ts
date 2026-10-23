/**
 * AI-35 — the models the provider says are NOT serving, held out of selection for a bounded window.
 *
 * WHY THIS IS SEPARATE FROM THE BREAKER (AI-30). The breaker learns from OUR OWN failed requests:
 * five consecutive refusals open a 30-second cooldown. That is the right instrument for a model
 * that fails while being used, and the wrong one for a model the provider already publishes as
 * broken — learning that costs up to five refused requests from a 50-a-day allowance, inside a
 * member's turn. The provider's endpoint-health API answers the same question for free
 * (`GET /v1/models/{author}/{slug}/endpoints`, no completion), so this module holds that answer.
 *
 * WHAT MAY MARK A MODEL. Exactly one verdict: `unavailable` — the provider publishes no endpoint,
 * or none is currently healthy and no recent uptime is measurable. `degraded` is deliberately NOT
 * a mark: a model answering most requests is still the better choice than one answering none, and
 * the fallback order already expresses the operator's preference. `unknown` is not evidence at
 * all — a check that could not run must not remove a model, or a broken diagnostic becomes an
 * outage of its own.
 *
 * WHY A MARK EXPIRES. It is a claim about right now, made by a check that runs every 30 minutes.
 * `DEFAULT_HEALTH_MARK_TTL_MS` is 31 minutes — one watchdog interval plus a minute of grace — so
 * the mark survives until the next reading can replace it, and a model that recovers while the
 * process is idle is not held out forever. Every new reading overwrites the window.
 *
 * THE ONE SAFETY VALVE. A reading that marks EVERY configured model unavailable would take the
 * assistant offline with zero attempts, and the reading is the only thing standing between a
 * member and an answer. In that case the configured primary is released
 * (`applyHealthVerdicts` reports it): the deployment keeps one attempt per turn, the breaker
 * still bounds the cost, and a wrong health reading can only waste requests, never refuse
 * service outright.
 *
 * SCOPE. One process, one map, like the breaker and the promotion. A restart re-reads health at
 * boot, which is the moment to trust a fresh reading anyway.
 */

/**
 * How long a health mark holds a model out of selection.
 *
 * The watchdog's shipped interval is 30 minutes (`AI_HEALTH_WATCH_INTERVAL_MS`), and this is that
 * plus a minute: long enough that the next reading — not the clock — is what releases the model,
 * short enough that a stale reading cannot outlive an outage by more than one cycle.
 */
export const DEFAULT_HEALTH_MARK_TTL_MS = 31 * 60 * 1000;

/** The verdict levels this gate understands, matching `healthWatch`'s classify output. */
export type HealthVerdictLevel = 'ok' | 'degraded' | 'unavailable' | 'unknown';

/** The minimum a verdict needs to carry: the model it is about and its level. */
export interface HealthVerdict {
  model: string;
  level: HealthVerdictLevel;
  reason?: string;
}

export interface HealthMark {
  model: string;
  /** Epoch ms after which the mark is no longer applied. */
  until: number;
  /** The provider's own sentence, for a log line. Never contains a credential. */
  reason: string;
}

export interface HealthMarkOptions {
  reason?: string;
  ttlMs?: number;
  now?: number;
}

export interface ApplyVerdictsOptions {
  /** The configured primary, which is released if every model would otherwise be held out. */
  primary?: string | null;
  ttlMs?: number;
  now?: number;
}

export interface ApplyVerdictsOutcome {
  /** Every model held out of selection AFTER this reading, in verdict order. */
  blocked: string[];
  /** Models that had a mark and are healthy again. */
  cleared: string[];
  /** The configured primary released by the safety valve, when it fired. */
  released: string[];
}

const marks = new Map<string, HealthMark>();

function keyOf(model: string | null | undefined): string {
  return typeof model === 'string' ? model.trim() : '';
}

function positiveTtl(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Hold a model out of selection until `now + ttlMs`. Re-marking refreshes the window. */
export function markModelUnavailable(model: string | null | undefined, options: HealthMarkOptions = {}): void {
  const key = keyOf(model);
  if (!key) return;
  const now = options.now ?? Date.now();
  marks.set(key, {
    model: key,
    until: now + positiveTtl(options.ttlMs, DEFAULT_HEALTH_MARK_TTL_MS),
    reason: typeof options.reason === 'string' ? options.reason : '',
  });
}

/** Return a model to selection immediately (a healthy reading, or an answer that proves it works). */
export function clearModelHealth(model: string | null | undefined): void {
  const key = keyOf(model);
  if (key) marks.delete(key);
}

/** True while a model is held out by a health reading that has not expired. */
export function isModelHealthBlocked(model: string | null | undefined, now: number = Date.now()): boolean {
  const key = keyOf(model);
  if (!key) return false;
  const mark = marks.get(key);
  if (!mark) return false;
  if (mark.until <= now) {
    // Expiry is applied on read, so a process that never checks again cannot keep a stale mark.
    marks.delete(key);
    return false;
  }
  return true;
}

/** How long a model stays held out (0 when it is not). */
export function modelHealthBlockRemainingMs(model: string | null | undefined, now: number = Date.now()): number {
  const key = keyOf(model);
  if (!key) return 0;
  const mark = marks.get(key);
  if (!mark) return 0;
  return Math.max(0, mark.until - now);
}

/** The models from `models` that are held out right now, in the order given. */
export function healthBlockedModels(models: readonly string[], now: number = Date.now()): string[] {
  return models.filter((model) => isModelHealthBlocked(model, now));
}

/**
 * Apply one health reading.
 *
 * Marks are set for `unavailable` and cleared for `ok`; `degraded` and `unknown` leave the current
 * state untouched, because neither is evidence that a model should be removed. The safety valve
 * then releases the configured primary if the reading would otherwise leave nothing to try.
 */
export function applyHealthVerdicts(
  verdicts: readonly HealthVerdict[],
  options: ApplyVerdictsOptions = {},
): ApplyVerdictsOutcome {
  const now = options.now ?? Date.now();
  const ttlMs = positiveTtl(options.ttlMs, DEFAULT_HEALTH_MARK_TTL_MS);
  const cleared: string[] = [];

  for (const verdict of verdicts) {
    const key = keyOf(verdict.model);
    if (!key) continue;
    if (verdict.level === 'unavailable') {
      markModelUnavailable(key, {
        now,
        ttlMs,
        reason: typeof verdict.reason === 'string' ? verdict.reason : '',
      });
    } else if (verdict.level === 'ok') {
      const had = marks.has(key);
      clearModelHealth(key);
      if (had) cleared.push(key);
    }
  }

  const released: string[] = [];
  const models = verdicts.map((verdict) => keyOf(verdict.model)).filter((key) => key !== '');
  const primary = keyOf(options.primary);
  if (
    models.length > 0 &&
    primary &&
    models.every((model) => isModelHealthBlocked(model, now)) &&
    isModelHealthBlocked(primary, now)
  ) {
    // See the module comment: one attempt is worth keeping when a single reading would otherwise
    // remove every model this deployment knows.
    clearModelHealth(primary);
    released.push(primary);
  }

  return {
    blocked: models.filter((model) => isModelHealthBlocked(model, now)),
    cleared,
    released,
  };
}

/** Test-only: forget every health mark. Production code has no reason to. */
export function resetModelHealthGate(): void {
  marks.clear();
}

/** A read-only view for diagnostics; never sent to a client. */
export function modelHealthGateSnapshot(now: number = Date.now()): Array<{
  model: string;
  reason: string;
  remainingMs: number;
}> {
  return [...marks.values()]
    .filter((mark) => mark.until > now)
    .map((mark) => ({ model: mark.model, reason: mark.reason, remainingMs: mark.until - now }));
}

export default {
  DEFAULT_HEALTH_MARK_TTL_MS,
  markModelUnavailable,
  clearModelHealth,
  isModelHealthBlocked,
  modelHealthBlockRemainingMs,
  healthBlockedModels,
  applyHealthVerdicts,
  resetModelHealthGate,
  modelHealthGateSnapshot,
};
