/**
 * Gemini provider (Google Generative Language API, v1beta generateContent).
 *
 * Same provider contract as the Claude provider (see claudeProvider.js) —
 * only the wire mapping differs. REST over global fetch; GEMINI_API_KEY and the
 * model are read from the environment lazily.
 *
 * Function calling is expressed with `functionDeclarations` (tools), `functionCall`
 * parts in model turns, and `functionResponse` parts in the following user turn.
 */

import { aiConfig } from '../aiConfig.ts';
import { AiNotConfigured, AiProviderError } from '../aiErrors.ts';
import { postJson, type UpstreamJsonBody } from './http.ts';
import type { AIProvider, ProviderMessage, ProviderResponse, ProviderUsage, ToolCall } from './index.ts';

function geminiEndpoint(model: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
}

/** One top-level turn, as mergeAdjacent and toGeminiContents build it. */
interface GeminiContent {
  role: string;
  parts: unknown[];
}

/** Merge consecutive same-role top-level contents (the API requires alternation). */
function mergeAdjacent(contents: GeminiContent[]) {
  const out: GeminiContent[] = [];
  for (const content of contents) {
    const last = out[out.length - 1];
    if (last && last.role === content.role) last.parts.push(...content.parts);
    else out.push({ role: content.role, parts: [...content.parts] });
  }
  return out;
}

/** Neutral messages -> Gemini contents. */
function toGeminiContents(messages: ProviderMessage[]) {
  const contents: GeminiContent[] = [];
  for (const m of messages) {
    if (m.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: m.content }] });
    } else if (m.role === 'assistant') {
      const parts: unknown[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const call of m.toolCalls || []) {
        const args = call.input && typeof call.input === 'object' && !Array.isArray(call.input) ? call.input : {};
        parts.push({ functionCall: { name: String(call.name), args } });
      }
      if (parts.length === 0) parts.push({ text: '' });
      contents.push({ role: 'model', parts });
    } else if (m.role === 'tool') {
      // `unknown`, not `any`: JSON.parse returns whatever the string held, and
      // the guard below is what narrows it to the response object Gemini expects.
      let response: unknown;
      try {
        response = JSON.parse(m.content);
      } catch {
        response = null;
      }
      if (response === null || typeof response !== 'object') {
        response = { raw: String(m.content) };
      }
      contents.push({
        role: 'user',
        parts: [{ functionResponse: { name: String(m.name), response } }],
      });
    }
  }
  return mergeAdjacent(contents);
}

/**
 * The paths this layer reads out of a generateContent response, declared so the
 * parser has something to narrow against at each level it descends. Every field
 * is optional and untrusted; the body below — not this declaration — is what
 * validates them, via `Array.isArray` for the part list, `typeof` for each
 * part's text, the truthiness test for `functionCall`, and `??` for the token
 * counts, which is also what tolerates a provider that reports no usage.
 */
interface GeminiPart extends UpstreamJsonBody {
  text?: unknown;
  functionCall?: { name?: unknown; args?: unknown };
}

interface GeminiCandidate extends UpstreamJsonBody {
  finishReason?: unknown;
  content?: { parts?: unknown };
}

interface GeminiResponse extends UpstreamJsonBody {
  candidates?: GeminiCandidate[];
  usageMetadata?: Record<string, unknown>;
  modelVersion?: unknown;
}

function parseResponse(data: GeminiResponse): ProviderResponse {
  const candidate = data?.candidates?.[0];
  const finishReason = candidate?.finishReason ?? null;
  const parts: unknown[] = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];

  if (!candidate) {
    // e.g. a prompt block from safety filters with no candidate.
    throw new AiProviderError('The AI service blocked this request. Please rephrase and try again.');
  }

  let text = '';
  const toolCalls: ToolCall[] = [];
  for (const part of parts as GeminiPart[]) {
    if (typeof part?.text === 'string') text += part.text;
    else if (part?.functionCall) {
      const args =
        part.functionCall.args && typeof part.functionCall.args === 'object' && !Array.isArray(part.functionCall.args)
          ? part.functionCall.args as UpstreamJsonBody
          : {} as UpstreamJsonBody;
      toolCalls.push({
        id: `gemini-call-${toolCalls.length + 1}`,
        name: String(part.functionCall.name),
        input: args,
      });
    }
  }

  const usage = data?.usageMetadata
    ? {
        inputTokens: data.usageMetadata.promptTokenCount ?? 0,
        outputTokens: data.usageMetadata.candidatesTokenCount ?? data.usageMetadata.totalTokenCount ?? 0,
      } as ProviderUsage
    : null;

  if (finishReason === 'MAX_TOKENS' && toolCalls.length === 0 && !text) {
    throw new AiProviderError('The AI service response was cut off. Please try a shorter question.');
  }
  // AI-8 — as in the Anthropic wire: `MAX_TOKENS` is the same cap under a different
  // name, and it is reported so a partial answer cannot arrive looking complete.
  // `?? 'gemini'` is the only guard on the model label, exactly as before; the
  // assertion is what says the neutral contract reports it as a string.
  return {
    model: data?.modelVersion as string ?? 'gemini',
    text,
    toolCalls,
    usage,
    truncated: finishReason === 'MAX_TOKENS',
  };
}

/** Create a Gemini provider instance. Throws AiNotConfigured when the key is missing. */
export function createGeminiProvider(): AIProvider {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    throw new AiNotConfigured('GEMINI_API_KEY is not set, so the Gemini AI provider is unavailable.');
  }

  return {
    name: 'gemini',

    async complete({ system, messages, tools, timeoutMs, signal }) {
      const cfg = aiConfig();
      const data = await postJson({
        url: geminiEndpoint(cfg.geminiModel),
        providerName: 'gemini',
        // The turn's remaining budget when the orchestrator supplied one, so a
        // call can never outlive the turn's single deadline (AI-1).
        timeoutMs: timeoutMs ?? cfg.requestTimeoutMs,
        signal,
        headers: { 'x-goog-api-key': apiKey },
        body: {
          system_instruction: { parts: [{ text: system }] },
          contents: toGeminiContents(messages),
          tools: [
            {
              functionDeclarations: tools.map((t) => ({
                name: t.name,
                description: t.description,
                parameters: t.parameters,
              })),
            },
          ],
          generationConfig: { temperature: 0.1, maxOutputTokens: cfg.maxOutputTokens },
        },
      });
      return parseResponse(data as GeminiResponse);
    },
  };
}

export default { createGeminiProvider };
