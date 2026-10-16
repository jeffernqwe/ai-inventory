/**
 * Shared Anthropic Messages wire mapping for Anthropic-compatible providers.
 *
 * Both the Claude provider and the OpenRouter gateway provider speak this exact
 * protocol over HTTPS. OpenRouter is an Anthropic-compatible gateway (it exposes
 * /v1/messages and routes the request to the model it is asked for), so the
 * neutral provider contract — see the contract note in claudeProvider.js — maps
 * to/from the Anthropic shape in exactly one place. A future Anthropic-compatible
 * gateway is then a short factory call, not another ~100 lines of mapping.
 *
 * The factory reads its API key from the environment at creation time (never at
 * module load, and never from the client). Keys are sent only in the request
 * header; they are never logged or returned.
 */

import { aiConfig } from '../aiConfig.ts';
import { AiNotConfigured, AiOutputLimit } from '../aiErrors.ts';
import { postJson, type UpstreamJsonBody } from './http.ts';
import type {
  AIProvider,
  ProviderMessage,
  ProviderResponse,
  ProviderUsage,
  ToolCall,
  ToolDefinition,
} from './index.ts';

/** Neutral tools -> Anthropic tools (they expect `input_schema`). */
export function toAnthropicTools(tools: ToolDefinition[]) {
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
export function toAnthropicMessages(messages: ProviderMessage[]) {
  // `content` is annotated rather than inferred because the filter below has
  // always tested it against null: the neutral contract never produces one, but
  // the check is the drop-empty-turns guard and must stay live.
  const out: { role: string; content: string | unknown[] | null }[] = [];
  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant') {
      const content: unknown[] = [];
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

/**
 * The slice of an Anthropic Messages response this layer reads. It is declared
 * so the parser has something to narrow against at each level it descends;
 * every field is optional and untrusted, and the body below — not this
 * declaration — is what validates them: `Array.isArray` for `content`, `typeof`
 * for each block's `text`, and `??` for the token counts, which is also what
 * tolerates a provider that reports no usage. `usage` is an object of untrusted
 * counts rather than a pair of numbers, so the counts are asserted into the
 * neutral shape rather than assumed to be well-typed.
 */
interface AnthropicResponse extends UpstreamJsonBody {
  content?: unknown;
  usage?: Record<string, unknown>;
  stop_reason?: unknown;
  model?: unknown;
}

export function parseAnthropicResponse(data: AnthropicResponse, fallbackModel = 'anthropic'): ProviderResponse {
  const content: unknown[] = Array.isArray(data.content) ? data.content : [];
  let text = '';
  const toolCalls: ToolCall[] = [];
  for (const block of content as UpstreamJsonBody[]) {
    if (block?.type === 'text' && typeof block.text === 'string') text += block.text;
    else if (block?.type === 'tool_use') {
      const input = block.input && typeof block.input === 'object' && !Array.isArray(block.input) ? block.input as UpstreamJsonBody : {} as UpstreamJsonBody;
      toolCalls.push({ id: String(block.id), name: String(block.name), input });
    }
  }
  const usage = data.usage
    ? { inputTokens: data.usage.input_tokens ?? 0, outputTokens: data.usage.output_tokens ?? 0 } as ProviderUsage
    : null;
  if (data.stop_reason === 'max_tokens' && toolCalls.length === 0 && !text) {
    // AI-10 — this used to throw an AiProviderError, which the controller maps to
    // 502 AI_UNAVAILABLE: *"temporarily unavailable, please try again in a moment"* for a
    // 2xx in which nothing was unavailable and a moment's wait cannot help, because the
    // same question spends the same output budget again. The classification is the fix;
    // the sentence and the log line live where the cap is known (see `complete` below).
    //
    // The model and the spend travel WITH the failure. Both are parsed right here and
    // were previously dropped, so the turn line reported `in=0 out=0 model=unknown` for
    // the one turn whose entire story is that the model spent everything it had
    // (measured on the device 2026-10-17). A caller who reads only the message sees
    // exactly the sentence it saw before.
    throw new AiOutputLimit(undefined, {
      model: (typeof data.model === 'string' && data.model) || fallbackModel,
      usage,
    });
  }
  // AI-8 — the stop reason is REPORTED, not merely tested. The throw above covers the
  // case where the cap left nothing usable; this covers every other one, where the cap
  // left a partial answer that used to arrive looking complete.
  // `?? fallbackModel` is the only guard on `model`, exactly as before; the
  // assertion is what says the neutral contract reports it as a string.
  return {
    model: data.model as string ?? fallbackModel,
    text,
    toolCalls,
    usage,
    truncated: data.stop_reason === 'max_tokens',
  };
}

/**
 * What a factory built on this wire layer must be told. `modelKey` names the
 * aiConfig() field holding the model, so each provider keeps its own environment
 * variable without this module knowing the variable's name.
 */
export interface AnthropicCompatibleOptions {
  /** provider id used in logs and the instance name */
  name?: string;
  /** env var holding the API key (server-side only) */
  apiKeyEnv: string;
  /** AiNotConfigured message when the key is absent */
  apiKeyMissingMessage?: string;
  /** full /v1/messages URL to POST to */
  messagesUrl: string;
  /** aiConfig() key holding the model name */
  modelKey: keyof ReturnType<typeof aiConfig>;
  /** fallback when the model env var is empty */
  defaultModel: string;
  /** label used when the response omits a model */
  fallbackModel?: string;
  /** header map for the key */
  authHeaders?: (apiKey: string) => Record<string, string>;
  /** static headers merged over authHeaders (e.g. a gateway-mandated User-Agent / beta header) */
  extraHeaders?: Record<string, string>;
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
export function createAnthropicCompatibleProvider(opts: AnthropicCompatibleOptions = {} as AnthropicCompatibleOptions): AIProvider {
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

    async complete({ system, messages, tools, timeoutMs, signal }) {
      const cfg = aiConfig();
      const model = cfg[modelKey] || defaultModel;
      const data = await postJson({
        url: messagesUrl,
        providerName: name,
        // The turn's remaining budget when the orchestrator supplied one, so a
        // call can never outlive the turn's single deadline (AI-1).
        timeoutMs: timeoutMs ?? cfg.requestTimeoutMs,
        signal,
        headers: { ...(authHeaders ? authHeaders(apiKey) : {}), ...extraHeaders },
        body: {
          model,
          max_tokens: cfg.maxOutputTokens,
          system,
          messages: toAnthropicMessages(messages),
          tools: toAnthropicTools(tools),
        },
      });
      // AI-10 — the one failure on this path that used to leave NO trace. Every sibling
      // in providers/http.ts logs before it throws; this shape is a 2xx, so it had no
      // status line either, and the only evidence of the Q4 failure was a missing answer
      // — which is why identifying it took elimination (§27BG). Logged HERE rather than
      // in the parser because this is where the cap is known, and the cap is the number
      // an operator acts on: a model that consistently spends `maxTokens` without
      // answering is a cap that is too small (or a question that needs narrowing).
      try {
        return parseAnthropicResponse(data as AnthropicResponse, fallbackModel);
      } catch (err) {
        if (err instanceof AiOutputLimit) {
          console.warn(
            `[ai:${name}] output limit reached with nothing usable (model=${model},` +
              ` maxTokens=${cfg.maxOutputTokens}, stop=max_tokens) — the model spent its` +
              ' whole output budget before answering'
          );
        }
        throw err;
      }
    },
  };
}

export default { toAnthropicTools, toAnthropicMessages, parseAnthropicResponse, createAnthropicCompatibleProvider };
