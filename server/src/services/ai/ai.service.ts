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

import { aiConfig } from './aiConfig.ts';
import { AiAbandoned, AiProviderError, AiTimeout, isAiError } from './aiErrors.ts';
import { selectProvider, type ProviderMessage, type ProviderResponse, type ProviderUsage, type ToolDefinition } from './providers/index.ts';
import { executeTool, AI_TOOL_DEFS } from './tools.ts';

/**
 * One prior turn as this service replays it to the provider. The controller
 * builds these from served USER/ASSISTANT messages, so tool turns never appear
 * in history — the neutral message list is this service's to own. Exported
 * because the controller's history loader returns exactly this shape.
 */
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** One user turn's input. Every field is server-derived, never client-supplied. */
interface ChatParams {
  businessId: string;
  userId: string;
  role: string;
  message: string;
  history?: ChatTurn[];
  /**
   * Aborted when the caller has gone away (AI-1). The turn then ends promptly
   * rather than running to its deadline, so a client that gave up stops costing
   * money instead of quietly paying for an answer nobody will read.
   */
  signal?: AbortSignal;
}

/**
 * The normalised result of one turn. `model` and `usage` are optional because a
 * provider is allowed to report neither; `iterations` counts provider calls
 * made, so a single-call answer is 1.
 */
/**
 * Why a turn ended without a real answer (AI-2). Exported because the controller
 * passes it through to the client unchanged and the tests assert the exact value:
 * it is a contract, not an internal detail.
 */
export type DegradedReason = 'EMPTY_COMPLETION' | 'ITERATION_LIMIT';

/**
 * The two degraded outcomes, each with the sentence the member reads.
 *
 * Kept in ONE table because the reason and its copy must not drift apart: the
 * reason is what the log and the API report, the sentence is what the user sees,
 * and a turn that reported one while showing the other would be worse than no
 * signal at all. Before AI-2 the sentence was inlined at two separate exits with
 * nothing recorded beside it.
 */
const DEGRADED: Record<DegradedReason, string> = {
  EMPTY_COMPLETION: 'I could not generate a response right now. Please try again.',
  ITERATION_LIMIT:
    'I could not finish that request within the allowed number of steps. Please try a more specific question.',
};

interface ChatResult {
  content: string;
  model?: string;
  toolsUsed: string[];
  usage?: ProviderUsage;
  iterations: number;
  /**
   * Present ONLY on a degraded turn (AI-2), absent — not null — on a healthy one,
   * so a caller can tell a real answer from a canned sentence without matching on
   * the sentence itself.
   */
  degraded?: DegradedReason;
}

function todayLabel(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Read-only system prompt. The rules here mirror SYSTEM_SPECIFICATION.md §24
 * (no fabricated facts) and the V1 read-only scope (CLAUDE.md §4, §11). The
 * actual guarantee is the tool layer: every fact goes through a read-only,
 * business-scoped tool — the prompt only tells the model how to behave.
 */
export function systemPrompt(): string {
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

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return `${str.slice(0, max - 1)}…`;
}

/**
 * Bound a promise by wall-clock time AND by the caller's continued interest (AI-1).
 *
 * This race is the GUARANTEE that a turn respects its limits: `timeoutMs` handed
 * to the provider below is only the courtesy that lets a well-behaved provider
 * abort its own socket, and a provider that honours neither would otherwise be
 * free to hang the turn forever (the defect this replaces allowed up to
 * 6 x 60000 ms).
 *
 * The two rejections are deliberately different types — "we gave up waiting" is
 * an AiTimeout (504) and "the caller left" is an AiAbandoned (499) — because
 * they mean different things to the client and to the log. Both listeners are
 * always torn down, so an answer that arrives in time leaves nothing behind to
 * keep the process alive.
 */
function withBudget<T>(promise: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const expiry = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new AiTimeout()), ms);
    if (signal) {
      onAbort = () => reject(new AiAbandoned());
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort);
    }
  });
  return Promise.race([promise, expiry]).finally(() => {
    if (timer) clearTimeout(timer);
    if (signal && onAbort) signal.removeEventListener('abort', onAbort);
  });
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
export async function runAiChat({ businessId, userId, role, history = [], message, signal }: ChatParams): Promise<ChatResult> {
  const cfg = aiConfig();
  const provider = selectProvider();

  const messages: ProviderMessage[] = history
    .slice(-cfg.contextMessages)
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
  messages.push({ role: 'user', content: message });

  let finalText: string | null = null;
  const toolsUsed = new Set<string>();
  let model: string | null = null;
  let usage: ProviderUsage | null = null;
  let steps = 0;
  // AI-2 — the degraded path's own state: why the turn gave up (null while it is
  // still healthy), how much of the retry budget has been spent, and whether the
  // LAST provider response was empty. That last flag is what lets the exit below
  // name the cause rather than the trigger: a turn that ran out of steps while the
  // model kept answering nothing has an empty-completion problem, not a step-count
  // problem, and reporting the wrong one sends an operator to the wrong knob.
  let degraded: DegradedReason | null = null;
  let emptyResponses = 0;
  let lastWasEmpty = false;

  // ONE deadline for the whole turn (AI-1). It is derived once, here, and every
  // provider call below is clamped to the time REMAINING against it — so the
  // ceiling is stated in one place and cannot be the product of two unrelated
  // knobs. Runs out at any point -> AiTimeout, which the controller maps to 504.
  const deadlineAt = Date.now() + cfg.turnDeadlineMs;

  for (let i = 0; i < cfg.maxToolIterations; i += 1) {
    steps = i + 1;
    // Checked before the budget: a caller who has already gone needs no work done
    // at all, and every tool round below costs a model call.
    if (signal?.aborted) throw new AiAbandoned();
    const remaining = deadlineAt - Date.now();
    if (remaining <= 0) throw new AiTimeout();
    let response: ProviderResponse;
    try {
      // AI_TOOL_DEFS is the frozen tool catalog; the provider contract wants the
      // neutral `ToolDefinition` shape, which the frozen entries already satisfy
      // (their `parameters` are JSON Schema objects). The assertion is
      // compiler-only — no runtime conversion, no copy of the array.
      response = await withBudget(
        provider.complete({
          system: systemPrompt(),
          messages,
          tools: AI_TOOL_DEFS as ToolDefinition[],
          timeoutMs: remaining,
          signal,
        }),
        remaining,
        signal,
      );
    } catch (err) {
      if (isAiError(err)) throw err;
      console.error('[ai] provider call failed', (err as { message?: unknown })?.message ?? err);
      throw new AiProviderError('The AI service failed unexpectedly. Please try again.');
    }

    model = response?.model || model;
    usage = response?.usage || usage;
    const calls = Array.isArray(response?.toolCalls) ? response.toolCalls : [];

    if (calls.length === 0) {
      // AI-2 — an upstream 200 carrying NO usable content is not an answer. Two
      // measured shapes reach here (both 2026-10-12, §27BE): a body with only a
      // `thinking` block and no text (F-52), and — one layer up — a zero-length
      // body that fails to parse (F-54). The request below is re-sent UNCHANGED,
      // which is the right minimal response precisely because the observed failures
      // are intermittent rather than deterministic: nothing was wrong with the
      // question. An ordinary loop iteration, so the signal and the turn deadline
      // are both re-checked at the top and the retry shares the iteration budget.
      const text = String(response?.text ?? '').trim();
      lastWasEmpty = !text;
      if (text) {
        finalText = text;
        break;
      }
      // Counted as SEEN, never as "authorised": the log line then reports how many
      // empty responses actually arrived, which is the number an operator can act
      // on. The two differ whenever a budget larger than the iteration cap is
      // configured, and the log must not overstate what happened.
      emptyResponses += 1;
      if (emptyResponses <= cfg.emptyRetryMax) continue;
      // Budget spent and still nothing: give up, and let the exit below supply the
      // matching sentence and mark the turn.
      degraded = 'EMPTY_COMPLETION';
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
    // No answer after the loop's own exits: either the model kept returning nothing
    // or it spent every step on tool rounds. The two are different faults, so they
    // keep different reasons and different sentences.
    degraded = lastWasEmpty ? 'EMPTY_COMPLETION' : 'ITERATION_LIMIT';
    finalText = DEGRADED[degraded];
  }
  if (degraded) {
    // AI-2 — the first time a degraded turn is visible anywhere. Before this, a turn
    // that produced no usable answer returned HTTP 201 and left NO trace, so the
    // failure rate could not be measured, let alone fixed. One line, so it is
    // greppable and countable: `grep -c 'degraded turn'`.
    console.warn(
      `[ai] degraded turn reason=${degraded} attempts=${steps} empty=${emptyResponses}` +
        ` model=${model ?? 'unknown'} tools=${[...toolsUsed].join(',') || 'none'}`,
    );
  }
  finalText = truncate(finalText, cfg.maxMessageChars);

  return {
    content: finalText,
    model: model ?? undefined,
    toolsUsed: [...toolsUsed],
    usage: usage ?? undefined,
    iterations: steps,
    degraded: degraded ?? undefined,
  };
}

export const aiService = { runAiChat, systemPrompt };

export default aiService;
