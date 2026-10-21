// `npm run ai:models` — the assistant's model list, as this deployment reads it.
//
// WHY THIS EXISTS. The model list is configuration, not code: `AI_MODEL_OPENROUTER` picks the
// primary and `AI_FALLBACK_MODELS_OPENROUTER` is the ordered chain a turn falls back through.
// Changing either is editing one line in `server/.env` and restarting — no code change, no
// deploy of new source. What is NOT obvious is which ids exist, which of them can call tools,
// and whether a new one actually works, so this command answers those three questions without
// spending a completion.
//
//   npm run ai:models                  the configured chain, then free tool-capable ids
//   npm run ai:models -- --all         include paid and non-tool models
//   npm run ai:models -- --check=<id>  prove ONE id answers a tool-shaped request (1 request)
//
// Reading the catalogue is free: it is `GET /v1/models`, no completion, so it spends none of a
// free tier's request allowance. `--check` is the only mode that spends one, which is why it is
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
import { probeModel } from '../src/services/ai/modelCheck.ts';

function line(label, value) {
  console.log(`[ai:models] ${label.padEnd(9)}: ${value}`);
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
  const result = await probeModel({ model: checkId });
  line('model', checkId);
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
