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

import { AiNotConfigured } from '../aiErrors.ts';
import { createAgentrouterProvider } from './agentrouterProvider.ts';
import { createClaudeProvider } from './claudeProvider.ts';
import { createGeminiProvider } from './geminiProvider.ts';

/**
 * A tool call the model asked for: the id it must be answered by, the tool's
 * name, and the arguments the model produced. `input` is an object of untrusted
 * model output — each parser below admits a value only after checking it is a
 * non-array object, and substitutes {} otherwise.
 */
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * A tool as the model sees it, in the neutral shape the tool registry uses:
 * `parameters` is a JSON Schema object.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * One entry of the neutral message list handed to a provider (the contract is
 * spelled out in claudeProvider.js). `toolCalls` belongs to assistant turns and
 * `name`/`toolCallId` to tool turns; `content` is a JSON string on a tool turn.
 */
export interface ProviderMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  name?: string;
  toolCallId?: string;
}

/** What one completion is asked for. */
export interface ProviderRequest {
  system: string;
  messages: ProviderMessage[];
  tools: ToolDefinition[];
}

/** Token accounting as the provider reported it, or null when it reported none. */
export interface ProviderUsage {
  inputTokens: number;
  outputTokens: number;
}

/** What one completion returns, normalised across providers. */
export interface ProviderResponse {
  model: string;
  text: string;
  toolCalls: ToolCall[];
  usage: ProviderUsage | null;
}

/**
 * The provider contract. Both registries — here and services/mail/providers —
 * resolve to one of these, and it is declared here because this is the module
 * that hands providers out: `registerProvider`'s second argument and
 * `selectProvider`'s return are the two ends of the same seam.
 */
export interface AIProvider {
  name: string;
  complete(request: ProviderRequest): Promise<ProviderResponse>;
}

export type AIProviderFactory = () => AIProvider;

/** One built-in: how to build it, and what the environment must supply first. */
interface AIProviderEntry {
  factory: AIProviderFactory;
  requiredEnv: readonly string[];
}

const registry = new Map<string, AIProviderFactory>();

/**
 * Built-in providers: which factory resolves each name, and which server-side
 * environment variables that factory requires at creation time (its key, and for
 * the gateway also its base URL). Kept next to selectProvider() so production
 * config validation (Phase 07D / H7) checks the SAME requirements the chat route
 * would hit — one source of truth for provider names and their keys. A registry
 * override (tests) is not covered here; those run outside production.
 */
const BUILTINS: Record<string, AIProviderEntry> = {
  claude: {
    factory: createClaudeProvider,
    requiredEnv: ['ANTHROPIC_API_KEY'],
  },
  gemini: {
    factory: createGeminiProvider,
    requiredEnv: ['GEMINI_API_KEY'],
  },
  agentrouter: {
    factory: createAgentrouterProvider,
    requiredEnv: ['AGENTROUTER_API_KEY', 'AGENTROUTER_BASE_URL'],
  },
};

/** Register (or override) a provider factory, primarily for tests. */
export function registerProvider(name: unknown, factory: AIProviderFactory) {
  registry.set(String(name).toLowerCase(), factory);
}

export function deregisterProvider(name: unknown) {
  registry.delete(String(name).toLowerCase());
}

export function registeredProviders() {
  return [...registry.keys()];
}

/** Environment variables a built-in provider needs at creation, or null when unknown. */
export function providerRequiredEnv(name: unknown) {
  const entry = BUILTINS[String(name || '').trim().toLowerCase()];
  return entry ? [...entry.requiredEnv] : null;
}

/**
 * Resolve the configured provider. Throws AiNotConfigured when AI_PROVIDER is
 * unset/unknown or the provider's API key is missing, so the chat route can
 * return a clean 503 instead of crashing.
 */
export function selectProvider(): AIProvider {
  const raw = (process.env.AI_PROVIDER || '').trim();
  const name = raw.toLowerCase();
  if (!name) {
    throw new AiNotConfigured('AI_PROVIDER is not set, so the AI assistant is disabled on this server.');
  }
  if (registry.has(name)) return registry.get(name)!();
  const builtin = BUILTINS[name];
  if (builtin) return builtin.factory();
  throw new AiNotConfigured(
    `The configured AI provider "${raw}" is not supported. Set AI_PROVIDER to "claude", "gemini", or "agentrouter".`
  );
}

export default { registerProvider, deregisterProvider, registeredProviders, selectProvider, providerRequiredEnv };
