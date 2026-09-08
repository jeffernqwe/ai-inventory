/**
 * Claude provider (Anthropic Messages API).
 *
 * A thin configuration over the shared Anthropic-compatible wire layer
 * (see anthropicWire.js): it points that mapping at Anthropic's API with
 * ANTHROPIC_API_KEY and the Claude model from the environment. Talks to the
 * provider over plain HTTPS (global fetch), never through the mobile app and
 * never with MongoDB credentials.
 *
 * Provider contract: complete({ system, messages, tools }) where `messages`
 * use the neutral shape:
 *   { role: 'user',            content }
 *   { role: 'assistant',       content, toolCalls: [{ id, name, input }] }
 *   { role: 'tool',            name, toolCallId, content }  // content: JSON string
 * and `tools` carry { name, description, parameters } (JSON Schema).
 *
 * Returns { model, text, toolCalls: [{ id, name, input }], usage }.
 */

import { createAnthropicCompatibleProvider } from './anthropicWire.js';

export function createClaudeProvider() {
  return createAnthropicCompatibleProvider({
    name: 'claude',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    apiKeyMissingMessage: 'ANTHROPIC_API_KEY is not set, so the Claude AI provider is unavailable.',
    messagesUrl: 'https://api.anthropic.com/v1/messages',
    modelKey: 'claudeModel',
    defaultModel: 'claude-sonnet-5',
    fallbackModel: 'claude',
    authHeaders: (apiKey) => ({ 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }),
  });
}

export default { createClaudeProvider };
