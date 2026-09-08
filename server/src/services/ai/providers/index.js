/**
 * AI provider registry.
 *
 * selectProvider() resolves the provider named by AI_PROVIDER at call time by
 * reading process.env lazily (see aiConfig.js for why). Built-in providers are
 * Claude, Gemini, and agentrouter (an Anthropic-compatible gateway that routes
 * to models such as DeepSeek-V4-Flash); test suites register a 'fake' provider
 * via registerProvider so the full orchestration loop and routes can be
 * exercised without an API key.
 *
 * Never expose provider keys to the mobile app — selection happens server-side
 * and only the resulting text reaches the client.
 */

import { AiNotConfigured } from '../aiErrors.js';
import { createAgentrouterProvider } from './agentrouterProvider.js';
import { createClaudeProvider } from './claudeProvider.js';
import { createGeminiProvider } from './geminiProvider.js';

const registry = new Map();

/** Register (or override) a provider factory, primarily for tests. */
export function registerProvider(name, factory) {
  registry.set(String(name).toLowerCase(), factory);
}

export function deregisterProvider(name) {
  registry.delete(String(name).toLowerCase());
}

export function registeredProviders() {
  return [...registry.keys()];
}

/**
 * Resolve the configured provider. Throws AiNotConfigured when AI_PROVIDER is
 * unset/unknown or the provider's API key is missing, so the chat route can
 * return a clean 503 instead of crashing.
 */
export function selectProvider() {
  const raw = (process.env.AI_PROVIDER || '').trim();
  const name = raw.toLowerCase();
  if (!name) {
    throw new AiNotConfigured('AI_PROVIDER is not set, so the AI assistant is disabled on this server.');
  }
  if (registry.has(name)) return registry.get(name)();
  if (name === 'claude') return createClaudeProvider();
  if (name === 'gemini') return createGeminiProvider();
  if (name === 'agentrouter') return createAgentrouterProvider();
  throw new AiNotConfigured(
    `The configured AI provider "${raw}" is not supported. Set AI_PROVIDER to "claude", "gemini", or "agentrouter".`
  );
}

export default { registerProvider, deregisterProvider, registeredProviders, selectProvider };
