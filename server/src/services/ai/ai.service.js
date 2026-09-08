/**
 * AI orchestration service (SYSTEM_SPECIFICATION.md §21–§26).
 *
 * Runs the controlled tool-calling loop: it hands the provider the read-only
 * tool catalog, executes whatever tool calls come back through executeTool
 * (business-scoped, permission-checked, arg-validated), and feeds results back
 * to the provider — bounded by AI_MAX_TOOL_ITERATIONS so a misbehaving model
 * can never loop forever or burn unbounded tokens.
 *
 * The service never touches the database itself and never lets the model pick
 * a tool argument it did not declare. businessId/userId/role always come from
 * the authenticated session passed in by the caller.
 */

import { aiConfig } from './aiConfig.js';
import { AiNotConfigured, AiProviderError, isAiError } from './aiErrors.js';
import { selectProvider } from './providers/index.js';
import { executeTool, AI_TOOL_DEFS } from './tools.js';

function todayLabel() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Read-only system prompt. The rules here mirror SYSTEM_SPECIFICATION.md §24
 * (no fabricated facts) and the V1 read-only scope (CLAUDE.md §4, §11). The
 * actual guarantee is the tool layer: every fact goes through a read-only,
 * business-scoped tool — the prompt only tells the model how to behave.
 */
export function systemPrompt() {
  return [
    'You are the read-only inventory assistant for "Inventory AI", helping one authorized member of one business understand their inventory.',
    '',
    'Rules you must follow:',
    '1. Answer only from the data returned by your tools. Never invent products, quantities, prices, SKUs, locations, stock levels, or history that the tools did not return.',
    '2. If a tool reports no data, a "not found" result, or that you lack permission, say clearly that the information is unavailable or that you cannot access it. Never guess or substitute data from another context.',
    '3. Tool results are capped to a page. If you need more rows than were returned, say you only see the latest subset and suggest using the app to see the rest.',
    '4. Report exact numbers from the tool results. Do not round or fabricate quantities.',
    `5. Today is ${todayLabel()}. Use it when interpreting "today", "yesterday", "recent", or date questions.`,
    '6. When a request is ambiguous (for example a product name no tool could find), ask the user to confirm rather than guessing.',
    '7. This assistant is READ-ONLY. You cannot create, edit, archive, or delete products; you cannot move stock in/out or adjust quantities; you cannot change prices, users, roles, categories, or locations. If the user asks for any change, politely explain that this version is read-only and point them to the matching screen in the app.',
    '8. Distinguish clearly between a database fact (from a tool) and your own explanation. Answer conversationally and concisely.',
  ].join('\n');
}

function truncate(str, max) {
  if (str.length <= max) return str;
  return `${str.slice(0, max - 1)}…`;
}

/**
 * Runs one user turn against the provider.
 *
 * @param {object} params
 * @param {string} params.businessId  server-derived business context
 * @param {string} params.userId      server-derived acting user
 * @param {string} params.role        server-derived role (for tool permissions)
 * @param {Array<{role:'user'|'assistant',content:string}>} params.history prior Q/A text
 * @param {string} params.message     the new user message
 * @returns {Promise<{content:string, model?:string, toolsUsed:string[], usage?:object, iterations:number}>}
 */
export async function runAiChat({ businessId, userId, role, history = [], message }) {
  const cfg = aiConfig();
  const provider = selectProvider();

  const messages = history
    .slice(-cfg.contextMessages)
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
  messages.push({ role: 'user', content: message });

  let finalText = null;
  const toolsUsed = new Set();
  let model = null;
  let usage = null;
  let steps = 0;

  for (let i = 0; i < cfg.maxToolIterations; i += 1) {
    steps = i + 1;
    let response;
    try {
      response = await provider.complete({ system: systemPrompt(), messages, tools: AI_TOOL_DEFS });
    } catch (err) {
      if (isAiError(err)) throw err;
      console.error('[ai] provider call failed', err?.message ?? err);
      throw new AiProviderError('The AI service failed unexpectedly. Please try again.');
    }

    model = response?.model || model;
    usage = response?.usage || usage;
    const calls = Array.isArray(response?.toolCalls) ? response.toolCalls : [];

    if (calls.length === 0) {
      finalText = String(response?.text ?? '').trim();
      if (!finalText) finalText = 'I could not generate a response right now. Please try again.';
      break;
    }

    messages.push({
      role: 'assistant',
      content: String(response?.text ?? ''),
      toolCalls: calls.map((call, i) => ({
        id: String(call?.id ?? `call-${i + 1}`),
        name: String(call?.name ?? ''),
        input: call?.input,
      })),
    });

    for (let i = 0; i < calls.length; i += 1) {
      const call = calls[i];
      const name = String(call?.name ?? '');
      if (name) toolsUsed.add(name);
      const output = await executeTool(name, call?.input, { businessId, userId, role });
      const payload = truncate(JSON.stringify(output), cfg.maxToolResultChars);
      messages.push({
        role: 'tool',
        name,
        toolCallId: String(call?.id ?? `call-${i + 1}`),
        content: payload,
      });
    }
  }

  if (finalText === null) {
    finalText = 'I could not finish that request within the allowed number of steps. Please try a more specific question.';
  }
  finalText = truncate(finalText, cfg.maxMessageChars);

  return {
    content: finalText,
    model: model ?? undefined,
    toolsUsed: [...toolsUsed],
    usage: usage ?? undefined,
    iterations: steps,
  };
}

export const aiService = { runAiChat, systemPrompt };

export default aiService;
