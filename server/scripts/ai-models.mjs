// `npm run ai:models` — the assistant's model list, as this deployment reads it.
//
// WHY THIS EXISTS. The model list is configuration, not code: `AI_MODEL_OPENROUTER` picks the
// primary and `AI_FALLBACK_MODELS_OPENROUTER` is the ordered chain a turn falls back through.
// Changing either is editing one line in `server/.env` and restarting — no code change, no
// deploy of new source. What is NOT obvious is which ids exist, which of them can call tools,
// and whether a new one actually works, so this command answers those three questions without
// spending a completion.
//
//   npm run ai:models                  the configured chain with live endpoint health, then
//                                      free tool-capable ids
//   npm run ai:models -- --all         include paid and non-tool models
//   npm run ai:models -- --check=<id>  read ONE id's health, then prove it answers (1 request)
//
// Reading the catalogue and the endpoint health is free: `GET /v1/models` and
// `GET /v1/models/{author}/{slug}/endpoints` send no completion, so they spend none of a free
// tier's request allowance. `--check` is the only mode that spends one, which is why it is
// opt-in and named.
//
// Exit codes: 0 fine, 1 the checked model did not answer, 2 could not check (no AI here, the
// catalogue was unreachable, or the allowance refused the probe). A 2 is never a pass.

import 'dotenv/config';

import { aiConfig, MAX_FALLBACK_MODELS } from '../src/services/ai/aiConfig.ts';
import {
  declaresToolSupport,
  listCatalogue,
  refreshModelCapabilities,
} from '../src/services/ai/modelCapabilities.ts';
import { probeModel, readModelHealth } from '../src/services/ai/modelCheck.ts';

function line(label, value) {
  console.log(`[ai:models] ${label.padEnd(9)}: ${value}`);
}

/** A percentage as the provider reported it, or `n/a` when it published none. */
function percent(value) {
  if (value === null) return 'n/a';
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

/** One endpoint on one line: raw status first, then the three uptime windows. */
function endpointLine(endpoint) {
  return `${endpoint.provider} | status ${endpoint.status === null ? 'n/a' : endpoint.status} | ` +
    `5m ${percent(endpoint.uptime5m)} | 30m ${percent(endpoint.uptime30m)} | 1d ${percent(endpoint.uptime1d)}`;
}

/**
 * Print one model's live health, then its endpoints.
 *
 * The label is aligned with the configured list above, so an operator reads a model and its
 * evidence together. The status is the provider's own code (0 is healthy); this command does
 * not translate a negative code into a stronger claim than the provider made.
 */
function printHealth(label, id, result) {
  console.log(`[ai:models]   ${label.padEnd(7)} ${id}`);
  if (result.status === 'ok') {
    for (const endpoint of result.endpoints) {
      console.log(`[ai:models]           ${endpointLine(endpoint)}`);
    }
    return;
  }
  const status = result.httpStatus ? ` (HTTP ${result.httpStatus})` : '';
  console.log(`[ai:models]           ${result.status}${status} — ${result.message}`);
}

function argValue(flag) {
  const prefix = `${flag}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

const cfg = aiConfig();
const showAll = process.argv.includes('--all');
const checkId = argValue('--check');

// ---------------------------------------------------------------------------
// --check=<id>: the one question this command can answer with real evidence.
// ---------------------------------------------------------------------------
if (checkId) {
  line('model', checkId);

  // The endpoint record is free and is read first: a model the provider does not publish
  // cannot answer, so there is no reason to spend a metered request proving it.
  const health = await readModelHealth({ model: checkId });
  printHealth('health', checkId, health);
  if (health.status === 'not_found' || health.status === 'no_endpoints') {
    console.error('[ai:models] FAILED — the provider does not publish an endpoint for that id.');
    process.exit(1);
  }

  const result = await probeModel({ model: checkId });
  line('probe', `${result.status}${result.httpStatus ? ` (HTTP ${result.httpStatus})` : ''}`);

  if (result.status === 'usable') {
    console.log('[ai:models] VERIFIED — it answered a tool-shaped request. Add the id to AI_FALLBACK_MODELS_OPENROUTER to use it.');
    process.exit(0);
  }
  if (result.status === 'quota') {
    console.error('[ai:models] NOT VERIFIED — the daily allowance refused the probe. Retry after the reset; this says nothing about the model.');
    process.exit(2);
  }
  if (result.status === 'unreachable' || result.status === 'not_applicable') {
    console.error(`[ai:models] NOT VERIFIED — the probe could not run (${result.message}).`);
    process.exit(2);
  }
  console.error('[ai:models] FAILED — it did not answer a tool-shaped request. Do not add it.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// The configured list, exactly as the turn loop will read it.
// ---------------------------------------------------------------------------
line('primary', cfg.openrouterModel || '(unset — the assistant is not configured here)');

const capabilityStatus = await refreshModelCapabilities();
const chain = cfg.fallbackModels.slice(0, MAX_FALLBACK_MODELS);

if (chain.length === 0) {
  line('fallbacks', 'none configured — AI_FALLBACK_MODELS_OPENROUTER is empty, so a turn never fails over');
} else {
  line('fallbacks', `${chain.length} candidate(s), tried in this order:`);
  chain.forEach((id, index) => {
    const declared = declaresToolSupport(id);
    const note =
      id === cfg.openrouterModel
        ? 'the primary — skipped'
        : declared === undefined
          ? 'tool support unknown (catalogue not read)'
          : declared
            ? 'tool support: yes'
            : 'tool support: NO — skipped at runtime';
    console.log(`[ai:models]   ${index + 1}. ${id} — ${note}`);
  });
}

// ---------------------------------------------------------------------------
// Live health — the evidence the ORDER should be chosen from.
//
// This is `GET /v1/models/{author}/{slug}/endpoints`, so it sends no completion and spends
// none of a free tier's allowance. It is read for the configured models only (not all 17
// suggestions), and every call is independent: one unreachable record does not hide the
// others. A status is the provider's own code, 0 being healthy; uptime is its own 5-minute,
// 30-minute and 1-day window. Nothing here changes what the server will use.
// ---------------------------------------------------------------------------
const configuredModels = [...new Set([cfg.openrouterModel, ...chain].filter(Boolean))];
if (configuredModels.length > 0) {
  console.log('');
  line('health', 'live endpoint status and uptime (GET only — no completion, no quota)');
  const results = await Promise.all(
    configuredModels.map(async (id) => [id, await readModelHealth({ model: id })]),
  );
  const byModel = new Map(results);
  const primary = cfg.openrouterModel;
  if (primary) {
    printHealth('primary', primary, byModel.get(primary));
  }
  chain.forEach((id, index) => {
    if (id === primary) return;
    printHealth(`${index + 1}.`, id, byModel.get(id));
  });
}

// ---------------------------------------------------------------------------
// What else is available. Free + tool-capable by default, because that is the only
// combination this deployment can use: a paid model would cost money, and a model
// without tools cannot read inventory.
// ---------------------------------------------------------------------------
const catalogue = await listCatalogue();

if (!catalogue) {
  console.error(
    capabilityStatus === 'not_applicable'
      ? '[ai:models] the provider catalogue was skipped: AI_PROVIDER/OPENROUTER_API_KEY/OPENROUTER_BASE_URL are not all set.'
      : '[ai:models] the provider catalogue could not be read, so available models cannot be listed (the configured list above is still what the server will use).',
  );
  process.exit(0);
}

const wanted = catalogue.filter((entry) => showAll || (entry.free && entry.tools));
const sorted = wanted.sort((a, b) => a.id.localeCompare(b.id));

console.log('');
console.log(
  `[ai:models] ${sorted.length} ${showAll ? 'model(s)' : 'free model(s) that declare tool support'} — copy an id into AI_FALLBACK_MODELS_OPENROUTER:`,
);
for (const entry of sorted) {
  const context = entry.contextLength === null ? '' : `  ctx ${Math.round(entry.contextLength / 1000)}k`;
  const paid = showAll && !entry.free ? '  (paid)' : '';
  const noTools = showAll && !entry.tools ? '  (no tools)' : '';
  console.log(`[ai:models]   ${entry.id}${context}${paid}${noTools}`);
}

console.log('');
console.log('[ai:models] try one before adding it:  npm run ai:models -- --check=<id>   (costs 1 request)');
console.log('[ai:models] then restart the server:   the list is read from server/.env at boot.');
