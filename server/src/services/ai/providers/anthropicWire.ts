/**
 * Shared Anthropic Messages wire mapping for Anthropic-compatible providers.
 *
 * Both the Claude provider and the OpenRouter gateway provider speak this exact
 * protocol over HTTPS. OpenRouter is an Anthropic-compatible gateway (it exposes
 * /v1/messages and routes the request to the model it is asked for), so the
 * neutral provider contract (see the provider interfaces in index.ts) maps
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
      // AI-22 — the results of ONE assistant turn travel as ONE user message.
      //
      // The loop pushes a neutral message per tool call, and this mapping used to emit a
      // `user` message per result, relying on the gateway to merge consecutive user turns
      // (which the Anthropic Messages API documents). That reliance was invisible while the
      // deployed model never asked for two tools at once — and it stopped being invisible on
      // 2026-10-19, when a two-location question cost 5 round-trips and the prompt began
      // asking for the lookups together. N `tool_result` blocks in one user message is the
      // canonical shape and depends on no merging behaviour, so parallel results are batched
      // here. The single-result case is byte-identical to what this function produced before.
      const block = { type: 'tool_result', tool_use_id: String(m.toolCallId), content: m.content };
      const previous = out[out.length - 1];
      if (previous && previous.role === 'user' && Array.isArray(previous.content)) {
        previous.content.push(block);
      } else {
        out.push({ role: 'user', content: [block] });
      }
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

/**
 * How many top-level field names the empty-completion line prints. A body can carry any
 * number; the point is to identify the SHAPE, and twelve names is more than any Messages
 * response has. Past it the line says so rather than growing unbounded.
 */
const SHAPE_KEYS_MAX = 12;

/**
 * AI-12 — a bounded, content-free description of a response body that carried no answer.
 *
 * WHY IT EXISTS. This shape left NO trace at all. A 2xx carrying nothing usable is not a
 * non-2xx (the http layer logs those), not an unparseable body (that branch logs
 * diagnostics), not a timeout and not a quota refusal (both throw). So the one thing an
 * operator needs in order to identify it — what the body actually was — was never written
 * down, and the 2026-10-17 investigation of the stored degraded turns could report only
 * that it happened eleven times, never what arrived.
 *
 * ONLY SCHEMA LABELS ARE RETURNED: top-level FIELD NAMES, content block TYPES and counts.
 * No value, no prompt, no model output. That rule is what makes the `thinking` case safe
 * to report at all — its body DOES contain text (the model's reasoning, and the stored
 * usage says such a turn spent tokens on it), and that text must not be copied into a log.
 *
 * `out` is the provider's own count and `null` when it reported none, because "the model
 * spent its budget reasoning" and "the gateway sent nothing at all" are the two candidate
 * explanations this line exists to tell apart — and a zero would collapse them.
 */
function emptyResponseShape(data: AnthropicResponse) {
  const content = Array.isArray(data.content) ? (data.content as UpstreamJsonBody[]) : null;
  const blocks = (content ?? [])
    .map((block) => (block && typeof block === 'object' && typeof block.type === 'string' ? block.type : '?'))
    .join(',');
  const usage = data.usage && typeof data.usage === 'object' ? data.usage : null;
  const outputTokens = usage && typeof usage.output_tokens === 'number' ? usage.output_tokens : null;
  const names = Object.keys(data);
  const keys = names.slice(0, SHAPE_KEYS_MAX).join(',');
  return [
    `stop=${typeof data.stop_reason === 'string' ? data.stop_reason : 'none'}`,
    `blocks=${blocks || 'none'}`,
    `contentBlocks=${content ? content.length : 'none'}`,
    `hasModel=${typeof data.model === 'string' && data.model !== ''}`,
    `hasUsage=${usage !== null}`,
    `out=${outputTokens ?? 'none'}`,
    `bodyBytes=${JSON.stringify(data).length}`,
    `keys=${keys || 'none'}${names.length > SHAPE_KEYS_MAX ? ',…' : ''}`,
  ].join(', ');
}

/**
 * @param data            the untrusted response body
 * @param requestedModel  the model the REQUEST named, used only when the body omits one.
 *
 * AI-12 — why the fallback is the requested model and not a provider label. It used to be
 * the provider's name (`'openrouter'`, `'claude'`), and the effect was that a response
 * omitting `model` was recorded as if the provider were a model: **12 of 44 stored turns in
 * the development database carried `openrouter` in their model column, including every
 * empty completion**, so the one question a provider-tier decision has to answer — *is this
 * model the unreliable one?* — could not be answered from the record at all. The model the
 * request named is true by construction of the request and answers that question; a
 * provider name wearing a model's field answers a different one. The default keeps the
 * function's standalone behaviour for callers that have no model to offer (tests, a future
 * provider without a model env var).
 */
export function parseAnthropicResponse(data: AnthropicResponse, requestedModel = 'anthropic'): ProviderResponse {
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
      model: (typeof data.model === 'string' && data.model) || requestedModel,
      usage,
    });
  }
  // AI-8 — the stop reason is REPORTED, not merely tested. The throw above covers the
  // case where the cap left nothing usable; this covers every other one, where the cap
  // left a partial answer that used to arrive looking complete.
  // `?? requestedModel` is the only guard on `model`, exactly as before; the
  // assertion is what says the neutral contract reports it as a string.
  return {
    model: data.model as string ?? requestedModel,
    text,
    toolCalls,
    usage,
    truncated: data.stop_reason === 'max_tokens',
  };
}

/**
 * The aiConfig() keys whose value is a STRING — the only ones that can hold a model name.
 *
 * AI-12 — found by `tsc`, not by a test. With `modelKey: keyof ReturnType<typeof aiConfig>`,
 * `cfg[modelKey]` has the union of every config value's type, so a model reached its call
 * sites as `string | number` and compiled only because the one consumer took a loose shape.
 * Narrowing the KEY fixes it at the source: a numeric knob can no longer be named as a
 * model, and the compiler enforces that here instead of at each call site.
 */
type StringConfigKey = {
  [K in keyof ReturnType<typeof aiConfig>]: ReturnType<typeof aiConfig>[K] extends string ? K : never;
}[keyof ReturnType<typeof aiConfig>];

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
  /** aiConfig() key holding the model name — a string-valued key, never a numeric knob */
  modelKey: StringConfigKey;
  /** fallback when the model env var is empty */
  defaultModel: string;
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
    authHeaders,
    extraHeaders = {},
  } = opts;

  const apiKey = (process.env[apiKeyEnv] || '').trim();
  if (!apiKey) {
    throw new AiNotConfigured(apiKeyMissingMessage);
  }

  return {
    name,

    /**
     * AI-28 — the model a request from this provider would carry, reported on the CONTRACT rather
     * than only on a successful response.
     *
     * A getter, not a captured value: `aiConfig()` reads the environment at call time everywhere in
     * this service, and a module-load snapshot here would disagree with the model the very next
     * request sends — the exact drift a check must not have. `ai.service` seeds its turn line from
     * this, so a turn whose provider call FAILED still names the model instead of `unknown`.
     */
    get model() {
      return aiConfig()[modelKey] || defaultModel;
    },

    async complete({ system, messages, tools, timeoutMs, signal, model: requestedModel }) {
      const cfg = aiConfig();
      // AI-29 — a per-request override, used by the turn loop's failover. It stays a
      // parameter rather than a second environment variable so the request itself
      // records which model answered, and the parsed response reports that model.
      const model = requestedModel || cfg[modelKey] || defaultModel;
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
        // AI-12 — the model the request names is the fallback for a body that omits one
        // (see `parseAnthropicResponse`): a provider label in a model column answers the
        // wrong question, and it hid the model on every failing turn in the record.
        const parsed = parseAnthropicResponse(data as AnthropicResponse, model);
        // AI-12 — and an empty completion is named ONCE PER OCCURRENCE, before it is
        // returned, because the AI-2 retry means the turn-level warning appears only when
        // a turn GIVES UP: an empty response the retry rescues used to be invisible, and
        // the failure rate could not be counted, let alone explained. The shape is printed
        // and never the body, for the reason `emptyResponseShape` gives.
        if (!parsed.text && parsed.toolCalls.length === 0) {
          console.warn(
            // "the provider", not "the gateway": this factory is shared with a
            // first-party Anthropic deployment, and naming the wrong component is the
            // defect class AI-10 exists to avoid.
            `[ai:${name}] empty completion (model=${model}, ${emptyResponseShape(
              data as AnthropicResponse
            )}) — the provider answered 2xx with neither text nor a tool call; the turn retries once, then degrades (AI-2)`
          );
        }
        return parsed;
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
