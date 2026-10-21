/**
 * AI-29 — which models the provider DECLARES can call tools.
 *
 * WHY THIS EXISTS. A fallback model is only useful if it can do what the assistant needs,
 * and the part that cannot be assumed is tool calling: a model that answers prose
 * beautifully but never calls a tool cannot ground a single inventory number, and it would
 * answer the member's question from nothing. The provider's own catalogue states this per
 * model (`supported_parameters` contains `tools`), and reading it is **free** — it sends no
 * completion and therefore spends none of a free tier's request allowance (AI-6).
 *
 * So the chain is filtered from the catalogue rather than guessed at, and a model the
 * catalogue says cannot call tools is skipped BEFORE a request is spent on it.
 *
 * WHAT IT DELIBERATELY IS NOT.
 *
 *   * It is not a promise. A model can declare tools and still use them badly, so
 *     `npm run ai:check -- --probe` remains the live proof; this only removes the models
 *     that declare they cannot.
 *   * It is not a per-turn network call. The map is fetched at boot, cached, and read
 *     synchronously by the turn loop — a member's turn must never wait on a catalogue read,
 *     and an outage of that endpoint must not stop the assistant working.
 *   * It is not authoritative when UNKNOWN. No cache (a cold process, a failed boot fetch)
 *     means `undefined`, and the caller treats that as "allow the attempt": refusing to
 *     fall back because a capability check did not run would turn a free check into an
 *     outage of its own.
 */

interface CapabilityCache {
  at: number;
  /** model id -> whether the catalogue declares tool support for it. */
  tools: Map<string, boolean>;
}

let cache: CapabilityCache | null = null;

export type CapabilitiesStatus = 'ok' | 'unreachable' | 'not_applicable';

/** One catalogue row, as far as this module and the operator tooling need it. */
export interface CatalogueEntry {
  id: string;
  /** Declared tool support (`supported_parameters` contains `tools`). */
  tools: boolean;
  contextLength: number | null;
  /** Free at the provider (both prices zero) — the only kind this deployment may use. */
  free: boolean;
}

interface RefreshOptions {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
}

type CatalogueRow = Record<string, unknown>;

/**
 * The raw catalogue, and why it could not be read when it could not.
 *
 * Shared by the capability cache and by `npm run ai:models`, so the two can never disagree
 * about what the provider lists — the operator tooling describes exactly the data the turn
 * loop filters on.
 */
async function readCatalogue({ env = process.env, fetchImpl = fetch, timeoutMs = 5000 }: RefreshOptions): Promise<{
  status: CapabilitiesStatus;
  rows: CatalogueRow[];
}> {
  const settings = usable(env);
  if (!settings) return { status: 'not_applicable', rows: [] };

  try {
    const res = await fetchImpl(modelsUrl(settings.base), {
      method: 'GET',
      headers: { accept: 'application/json', authorization: `Bearer ${settings.key}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { status: 'unreachable', rows: [] };
    const body = (await res.json()) as { data?: unknown };
    const rows = Array.isArray(body?.data) ? (body.data as CatalogueRow[]) : [];
    return rows.length > 0 ? { status: 'ok', rows } : { status: 'unreachable', rows: [] };
  } catch {
    return { status: 'unreachable', rows: [] };
  }
}

/**
 * The catalogue as plain entries, for the operator tooling (`npm run ai:models`).
 *
 * `null` means it could not be read; an empty array means it was read and is empty, which a
 * caller should treat as "nothing to suggest" rather than as a failure of its own.
 */
export async function listCatalogue(options: RefreshOptions = {}): Promise<CatalogueEntry[] | null> {
  const { status, rows } = await readCatalogue(options);
  if (status !== 'ok') return null;
  const out: CatalogueEntry[] = [];
  for (const row of rows) {
    const id = row?.id;
    if (typeof id !== 'string' || id === '') continue;
    const params = (row as { supported_parameters?: unknown }).supported_parameters;
    const context = (row as { context_length?: unknown }).context_length;
    const pricing = (row as { pricing?: { prompt?: unknown; completion?: unknown } }).pricing;
    out.push({
      id,
      tools: Array.isArray(params) && params.includes('tools'),
      contextLength: typeof context === 'number' ? context : null,
      free: pricing?.prompt === '0' && pricing?.completion === '0',
    });
  }
  return out;
}

/** `{base}/v1/models`, tolerating a trailing slash and a base that already names /v1. */
function modelsUrl(base: string): string {
  const trimmed = base.trim().replace(/\/+$/, '');
  return /\/v\d+$/.test(trimmed) ? `${trimmed}/models` : `${trimmed}/v1/models`;
}

/**
 * The provider settings this needs, or null when the environment cannot answer.
 *
 * Same rule as `modelCheck`: a deployment with no AI must not contact a provider.
 */
function usable(env: Record<string, string | undefined>): { base: string; key: string } | null {
  if ((env.AI_PROVIDER || '').trim().toLowerCase() !== 'openrouter') return null;
  const base = (env.OPENROUTER_BASE_URL || '').trim();
  const key = (env.OPENROUTER_API_KEY || '').trim();
  if (!base || !key) return null;
  return { base, key };
}

/**
 * Fetch the catalogue and replace the cache. Never throws.
 *
 * A failed read leaves the previous cache in place rather than emptying it: an established
 * map is better evidence than a momentary network fault, and emptying it would silently
 * re-enable every tool-less model until the next successful read.
 */
export async function refreshModelCapabilities(options: RefreshOptions = {}): Promise<CapabilitiesStatus> {
  const { status, rows } = await readCatalogue(options);
  if (status !== 'ok') return status;

  const tools = new Map<string, boolean>();
  for (const row of rows) {
    const id = row?.id;
    if (typeof id !== 'string' || id === '') continue;
    const params = (row as { supported_parameters?: unknown }).supported_parameters;
    tools.set(id, Array.isArray(params) && params.includes('tools'));
  }
  // An empty catalogue is not a fact about any model. Keeping the old cache (or none)
  // is the only reading that does not silently disable every candidate.
  if (tools.size === 0) return 'unreachable';
  cache = { at: (options.now ?? Date.now)(), tools };
  return 'ok';
}

/**
 * Whether a model can call tools, as the catalogue last said.
 *
 * `true`  — declared to support tools.
 * `false` — declared NOT to, **or absent from a catalogue we did read** (it would 404, so
 *           skipping it saves a request rather than costing an answer).
 * `undefined` — nothing is known; the caller should allow the attempt.
 */
export function declaresToolSupport(model: string): boolean | undefined {
  if (!cache) return undefined;
  return cache.tools.get(model) ?? false;
}

/** Drop the cache. Used by tests, and by an operator forcing a re-read. */
export function resetModelCapabilities(): void {
  cache = null;
}

export default {
  refreshModelCapabilities,
  declaresToolSupport,
  resetModelCapabilities,
  listCatalogue,
};
