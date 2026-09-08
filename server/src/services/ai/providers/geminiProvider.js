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

import { aiConfig } from '../aiConfig.js';
import { AiNotConfigured, AiProviderError } from '../aiErrors.js';
import { postJson } from './http.js';

function geminiEndpoint(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
}

/** Merge consecutive same-role top-level contents (the API requires alternation). */
function mergeAdjacent(contents) {
  const out = [];
  for (const content of contents) {
    const last = out[out.length - 1];
    if (last && last.role === content.role) last.parts.push(...content.parts);
    else out.push({ role: content.role, parts: [...content.parts] });
  }
  return out;
}

/** Neutral messages -> Gemini contents. */
function toGeminiContents(messages) {
  const contents = [];
  for (const m of messages) {
    if (m.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: m.content }] });
    } else if (m.role === 'assistant') {
      const parts = [];
      if (m.content) parts.push({ text: m.content });
      for (const call of m.toolCalls || []) {
        const args = call.input && typeof call.input === 'object' && !Array.isArray(call.input) ? call.input : {};
        parts.push({ functionCall: { name: String(call.name), args } });
      }
      if (parts.length === 0) parts.push({ text: '' });
      contents.push({ role: 'model', parts });
    } else if (m.role === 'tool') {
      let response;
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

function parseResponse(data) {
  const candidate = data?.candidates?.[0];
  const finishReason = candidate?.finishReason ?? null;
  const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];

  if (!candidate) {
    // e.g. a prompt block from safety filters with no candidate.
    throw new AiProviderError('The AI service blocked this request. Please rephrase and try again.');
  }

  let text = '';
  const toolCalls = [];
  for (const part of parts) {
    if (typeof part?.text === 'string') text += part.text;
    else if (part?.functionCall) {
      const args =
        part.functionCall.args && typeof part.functionCall.args === 'object' && !Array.isArray(part.functionCall.args)
          ? part.functionCall.args
          : {};
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
      }
    : null;

  if (finishReason === 'MAX_TOKENS' && toolCalls.length === 0 && !text) {
    throw new AiProviderError('The AI service response was cut off. Please try a shorter question.');
  }
  return { model: data?.modelVersion ?? 'gemini', text, toolCalls, usage };
}

/** Create a Gemini provider instance. Throws AiNotConfigured when the key is missing. */
export function createGeminiProvider() {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    throw new AiNotConfigured('GEMINI_API_KEY is not set, so the Gemini AI provider is unavailable.');
  }

  return {
    name: 'gemini',

    async complete({ system, messages, tools }) {
      const cfg = aiConfig();
      const data = await postJson({
        url: geminiEndpoint(cfg.geminiModel),
        providerName: 'gemini',
        timeoutMs: cfg.requestTimeoutMs,
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
      return parseResponse(data);
    },
  };
}

export default { createGeminiProvider };
