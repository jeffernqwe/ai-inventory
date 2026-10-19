// AI-25 — ONE built-in provider, on purpose.
//
// The owner's decision (2026-10-19): OpenRouter is the deployed provider and the only one this
// system needs. Claude and Gemini were reachable through it as MODEL choices, so the two direct
// provider implementations added configuration (two API keys, two model variables), a whole second
// wire mapping and parser (Gemini's `generateContent`), and an unexercised production path — an
// outage fallback that would need its own account and billing to be real.
//
// The abstraction is NOT removed: `AIProvider`, the registry and the Anthropic-compatible wire
// layer all stay (OpenRouter is built on that wire), so restoring a direct provider later is one
// small factory plus one registry entry — and git keeps the Gemini mapping if it is ever wanted.
//
// WHAT THIS SUITE PINS, so the removal cannot be half-done or quietly undone:
//   * openrouter is the only name the environment registry knows about;
//   * `claude` and `gemini` are now UNKNOWN providers, refused with a message that names the one
//     that works — not a confusing "missing key" for a provider that no longer exists;
//   * the config carries no per-provider model settings for them;
//   * `.env.example` no longer asks an operator for their keys, because a documented variable is
//     a requirement in practice even when nothing reads it.
//
// DB-free: no database, no network, no credentials.

import { readFileSync } from 'node:fs';
import { it } from 'node:test';
import assert from 'node:assert/strict';

import { unitSuite } from './testEnv.mjs';
import { aiConfig } from '../src/services/ai/aiConfig.ts';
import { providerRequiredEnv, selectProvider } from '../src/services/ai/providers/index.ts';

const ENV_EXAMPLE = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');

/** Set one environment variable for the duration of a callback. */
function withEnv(name, value, fn) {
  const before = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    return fn();
  } finally {
    if (before === undefined) delete process.env[name];
    else process.env[name] = before;
  }
}

unitSuite('AI-25 OpenRouter is the only built-in provider', () => {
  it('★ the registry knows openrouter and nothing else', () => {
    assert.deepEqual(providerRequiredEnv('openrouter'), [
      'OPENROUTER_API_KEY',
      'OPENROUTER_BASE_URL',
      'AI_MODEL_OPENROUTER',
    ]);
    // Removed providers must not be half-present: `null` means "not a built-in", which is what
    // makes the selection error below say the right thing.
    assert.equal(providerRequiredEnv('claude'), null);
    assert.equal(providerRequiredEnv('gemini'), null);
  });

  it('★ a removed provider is refused as unknown, and the message names the one that works', () => {
    for (const gone of ['claude', 'gemini']) {
      withEnv('AI_PROVIDER', gone, () => {
        assert.throws(
          () => selectProvider(),
          (err) => {
            assert.equal(err.code, 'AI_NOT_CONFIGURED');
            assert.match(err.message, /openrouter/);
            assert.doesNotMatch(err.message, /"claude", "gemini", or "openrouter"/);
            return true;
          },
          `${gone} must be refused`,
        );
      });
    }
  });

  it('★ configuration no longer carries per-provider models that nothing can use', () => {
    const cfg = aiConfig();
    assert.equal('claudeModel' in cfg, false);
    assert.equal('geminiModel' in cfg, false);
    // The one provider keeps its model, its base URL and no default model.
    assert.equal('openrouterModel' in cfg, true);
    assert.equal('openrouterBaseUrl' in cfg, true);
  });

  it('★ the documented environment does not ask for the removed keys', () => {
    // A variable in `.env.example` is a requirement to whoever sets up a server, whether or not
    // anything reads it. Leaving them would keep the configuration complexity this removed.
    for (const name of ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'AI_MODEL_CLAUDE', 'AI_MODEL_GEMINI']) {
      assert.equal(
        new RegExp(`^${name}=`, 'm').test(ENV_EXAMPLE),
        false,
        `${name} is still documented in .env.example`,
      );
    }
  });
});
