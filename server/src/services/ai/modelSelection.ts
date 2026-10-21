/**
 * AI-31 — the model the deployment is CURRENTLY using, which is not necessarily the model
 * the environment configures.
 *
 * WHY THIS IS SEPARATE FROM CONFIGURATION. `AI_MODEL_OPENROUTER` is the operator's choice:
 * it is read from `.env` at boot, it is the model the deployment says it prefers, and it is
 * what `npm run ai:models` prints. A promotion is a RUNTIME fact — "the preferred model is
 * unhealthy and this other one has proved it can answer" — so it must never overwrite the
 * environment (the process cannot portably do that anyway, and an operator's file is not the
 * program's to edit). Keeping the two apart means a restart deliberately returns to the
 * configured default, which is the moment to re-test it.
 *
 * THRESHOLD-GATED, NOT EAGER. `ai.service` promotes only when the current active model has
 * been confirmed unhealthy — it is cooling down after MODEL_FAILURE_THRESHOLD consecutive
 * model-specific failures. A fallback that answers one transient failure keeps serving that
 * turn, but does not seize the deployment: a single 404 must not churn which model every
 * future request starts with. When the active is confirmed unhealthy, the model that answered
 * becomes the active one immediately, and the next request starts there.
 *
 * CONCURRENCY. Node runs this module's mutators synchronously, so two requests cannot
 * interleave *inside* `promoteModel`. The compare-and-set is for the interleaving that does
 * happen: request A and request B can both read the old active before either promotes. The
 * first promotion wins; the second carries a stale `expectedActive` and is refused, so two
 * requests cannot overwrite one another's decision. Failure counters live in `modelBreaker`
 * and are updated synchronously for the same reason.
 *
 * MULTI-INSTANCE. This is per process, like the breaker. A deployment with several instances
 * keeps its own active model in each; every instance still converges on a model that answers,
 * and no shared store is introduced for a 30-second observation about one model. A restart
 * forgets the promotion on purpose.
 */

let promoted: string | null = null;

/** The promoted model, or `null` while the deployment still uses its configured default. */
export function promotedModel(): string | null {
  return promoted;
}

/** The model a new turn should start with: the promoted one, else the configured default. */
export function activeModel(configuredPrimary: string | null): string | null {
  return promoted ?? configuredPrimary;
}

/**
 * Promote `candidate` if this caller still believes `expectedActive` is the active model.
 *
 * Returns true only when it changed something, which is what lets the caller log a promotion
 * once rather than once per request. A caller from before another promotion is refused —
 * that is the whole point of the check.
 */
export function promoteModel(candidate: string | null | undefined, expectedActive: string | null): boolean {
  const model = typeof candidate === 'string' ? candidate.trim() : '';
  if (!model) return false;
  if (promoted === model) return false;
  // A promotion has already happened: only a request that knows about it may replace it.
  if (promoted !== null && promoted !== expectedActive) return false;
  promoted = model;
  return true;
}

/** Test-only: forget the promotion. Production code never needs this. */
export function resetModelSelection(): void {
  promoted = null;
}

export default { promotedModel, activeModel, promoteModel, resetModelSelection };
