/**
 * AgentRouter provider — an Anthropic-compatible gateway.
 *
 * AgentRouter exposes the Anthropic Messages API (/v1/messages) to clients and
 * routes each request to a configured model, e.g. DeepSeek-V4-Flash. Because it
 * speaks the Anthropic shape, this provider is a thin configuration over the
 * shared wire layer in anthropicWire.js — same tool_use / tool_result mapping,
 * same parse, only the endpoint, key, and model differ from the Claude provider.
 *
 * IMPORTANT — client fingerprint: AgentRouter's gateway only accepts traffic
 * that presents itself as the Claude Code client (it returns
 * "unauthorized client detected" otherwise). Requests therefore carry the
 * claude-cli User-Agent plus the claude-code beta header. AgentRouter
 * periodically rotates which claude-cli versions it accepts — when that error
 * returns, set AGENTROUTER_CLIENT_UA in server/.env to a currently accepted
 * Claude Code version string (e.g. "claude-cli/2.1.263 (external, sdk-cli)").
 *
 * Server-side configuration (server/.env, never committed, never sent to the
 * mobile app or to MongoDB):
 *   AI_PROVIDER=agentrouter
 *   AGENTROUTER_API_KEY=...
 *   AGENTROUTER_BASE_URL=https://your-router.example   (origin; /v1/messages is appended)
 *   AI_MODEL_AGENTROUTER=deepseek-v4-flash             (optional)
 *   AGENTROUTER_CLIENT_UA=claude-cli/<ver> (external, sdk-cli)   (optional override)
 *
 * The key travels in the Authorization: Bearer header only. It is never logged,
 * never returned to the client, and never shown in error bodies.
 */

import { aiConfig } from '../aiConfig.ts';
import { AiNotConfigured } from '../aiErrors.ts';
import { createAnthropicCompatibleProvider } from './anthropicWire.js';

/** Default claude-cli identity the gateway recognises. Bump on rotation. */
const DEFAULT_CLAUDE_CLI_UA = 'claude-cli/2.1.263 (external, sdk-cli)';
/** Beta header value the Claude Code client sends. */
const CLAUDE_CODE_BETA = 'claude-code-20250219';

/** Turn an origin/base URL into the Anthropic messages endpoint. */
function messagesUrlFromBase(base) {
  const trimmed = base.trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/v1/messages')) return trimmed;
  return `${trimmed}/v1/messages`;
}

export function createAgentrouterProvider() {
  const cfg = aiConfig();

  const apiKey = (process.env.AGENTROUTER_API_KEY || '').trim();
  if (!apiKey) {
    throw new AiNotConfigured('AGENTROUTER_API_KEY is not set, so the AgentRouter AI provider is unavailable.');
  }

  const baseUrl = cfg.agentrouterBaseUrl;
  if (!baseUrl) {
    throw new AiNotConfigured('AGENTROUTER_BASE_URL is not set, so the AgentRouter AI provider is unavailable.');
  }

  const clientUa = (process.env.AGENTROUTER_CLIENT_UA || '').trim() || DEFAULT_CLAUDE_CLI_UA;

  return createAnthropicCompatibleProvider({
    name: 'agentrouter',
    apiKeyEnv: 'AGENTROUTER_API_KEY',
    apiKeyMissingMessage: 'AGENTROUTER_API_KEY is not set, so the AgentRouter AI provider is unavailable.',
    messagesUrl: messagesUrlFromBase(baseUrl),
    modelKey: 'agentrouterModel',
    defaultModel: 'deepseek-v4-flash',
    fallbackModel: 'agentrouter',
    authHeaders: (key) => ({ authorization: `Bearer ${key}`, 'anthropic-version': '2023-06-01' }),
    extraHeaders: { 'user-agent': clientUa, 'anthropic-beta': CLAUDE_CODE_BETA },
  });
}

export default { createAgentrouterProvider };
