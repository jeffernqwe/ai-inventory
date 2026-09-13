/**
 * Shared Anthropic Messages wire mapping for Anthropic-compatible providers.
 *
 * Both the Claude provider and the AgentRouter gateway provider speak this exact
 * protocol over HTTPS. AgentRouter is an Anthropic-compatible gateway (it exposes
 * /v1/messages to Anthropic clients and routes the request to another model,
 * e.g. DeepSeek-V4-Flash), so the neutral provider contract — see the contract
 * note in claudeProvider.js — maps to/from the Anthropic shape in exactly one
 * place. A future Anthropic-compatible gateway is then a short factory call, not
 * another ~100 lines of mapping.
 *
 * The factory reads its API key from the environment at creation time (never at
 * module load, and never from the client). Keys are sent only in the request
 * header; they are never logged or returned.
 */

import { aiConfig } from '../aiConfig.ts';
import { AiNotConfigured, AiProviderError } from '../aiErrors.ts';
import { postJson } from './http.js';

/** Neutral tools -> Anthropic tools (they expect `input_schema`). */
export function toAnthropicTools(tools) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

/**
 * Neutral messages -> Anthropic messages.
 *
 * A neutral 'tool' message maps to a Claude 'user' message containing a
 * tool_result block; it must follow the assistant message whose tool_use it
 * answers, which our orchestration loop always guarantees.
 */
export function toAnthropicMessages(messages) {
  const out = [];
  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant') {
      const content = [];
      if (m.content) content.push({ type: 'text', text: m.content });
      for (const call of m.toolCalls || []) {
        content.push({ type: 'tool_use', id: String(call.id), name: String(call.name), input: call.input ?? {} });
      }
      out.push({ role: 'assistant', content });
    } else if (m.role === 'tool') {
      out.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: String(m.toolCallId), content: m.content }],
      });
    }
  }
  // Anthropic forbids a bare assistant message right before a user message that
  // is not a tool_result and expects turns to alternate; empty assistant turns
  // are dropped defensively.
  return out.filter((m) => m.content !== null && !(Array.isArray(m.content) && m.content.length === 0));
}

export function parseAnthropicResponse(data, fallbackModel = 'anthropic') {
  const content = Array.isArray(data.content) ? data.content : [];
  let text = '';
  const toolCalls = [];
  for (const block of content) {
    if (block?.type === 'text' && typeof block.text === 'string') text += block.text;
    else if (block?.type === 'tool_use') {
      const input = block.input && typeof block.input === 'object' && !Array.isArray(block.input) ? block.input : {};
      toolCalls.push({ id: String(block.id), name: String(block.name), input });
    }
  }
  const usage = data.usage
    ? { inputTokens: data.usage.input_tokens ?? 0, outputTokens: data.usage.output_tokens ?? 0 }
    : null;
  if (data.stop_reason === 'max_tokens' && toolCalls.length === 0 && !text) {
    throw new AiProviderError('The AI service response was cut off. Please try a shorter question.');
  }
  return { model: data.model ?? fallbackModel, text, toolCalls, usage };
}

/**
 * Build an Anthropic-Messages provider instance.
 *
 * @param {object} opts
 * @param {string} opts.name            provider id used in logs and the instance name
 * @param {string} opts.apiKeyEnv       env var holding the API key (server-side only)
 * @param {string} opts.apiKeyMissingMessage  AiNotConfigured message when the key is absent
 * @param {string} opts.messagesUrl     full /v1/messages URL to POST to
 * @param {string} opts.modelKey        aiConfig() key holding the model name
 * @param {string} opts.defaultModel    fallback when the model env var is empty
 * @param {string} [opts.fallbackModel] label used when the response omits a model
 * @param {(apiKey:string) => object} opts.authHeaders  header map for the key
 * @param {object} [opts.extraHeaders] static headers merged over authHeaders
 *   (e.g. a gateway-mandated User-Agent / beta header)
 */
export function createAnthropicCompatibleProvider(opts = {}) {
  const {
    name = 'anthropic',
    apiKeyEnv,
    apiKeyMissingMessage = `${apiKeyEnv} is not set, so this AI provider is unavailable.`,
    messagesUrl,
    modelKey,
    defaultModel,
    fallbackModel = name,
    authHeaders,
    extraHeaders = {},
  } = opts;

  const apiKey = (process.env[apiKeyEnv] || '').trim();
  if (!apiKey) {
    throw new AiNotConfigured(apiKeyMissingMessage);
  }

  return {
    name,

    async complete({ system, messages, tools }) {
      const cfg = aiConfig();
      const model = cfg[modelKey] || defaultModel;
      const data = await postJson({
        url: messagesUrl,
        providerName: name,
        timeoutMs: cfg.requestTimeoutMs,
        headers: { ...(authHeaders ? authHeaders(apiKey) : {}), ...extraHeaders },
        body: {
          model,
          max_tokens: cfg.maxOutputTokens,
          system,
          messages: toAnthropicMessages(messages),
          tools: toAnthropicTools(tools),
        },
      });
      return parseAnthropicResponse(data, fallbackModel);
    },
  };
}

export default { toAnthropicTools, toAnthropicMessages, parseAnthropicResponse, createAnthropicCompatibleProvider };
