/**
 * AI configuration, read lazily from environment variables at call time.
 *
 * Reading process.env on every access (rather than caching at module load)
 * lets node:test switch AI_PROVIDER between test files, and means a missing
 * AI key or a bad provider name can never prevent the server from booting —
 * chat simply fails with a clean 503 until an operator fixes the config.
 *
 * Every value here lives server-side only. Nothing in this module is ever
 * sent to the mobile application or to the AI provider's training process.
 */

function positiveInt(raw: string | undefined, fallback: number) {
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function aiConfig() {
  return {
    // Provider + keys (keys are read here but never returned/logged).
    provider: (process.env.AI_PROVIDER || '').trim().toLowerCase(),
    claudeModel: (process.env.AI_MODEL_CLAUDE || 'claude-sonnet-5').trim(),
    geminiModel: (process.env.AI_MODEL_GEMINI || 'gemini-2.5-flash').trim(),
    // OpenRouter is an Anthropic-compatible gateway (see openrouterProvider.ts).
    // No default model on purpose: OpenRouter fronts hundreds of models with very
    // different tool-calling ability, so the model is REQUIRED — the provider
    // factory refuses to build without it rather than silently guessing one here.
    openrouterModel: (process.env.AI_MODEL_OPENROUTER || '').trim(),
    openrouterBaseUrl: (process.env.OPENROUTER_BASE_URL || '').trim(),

    // Cost / rate protection (V1). See SYSTEM_SPECIFICATION.md §25.
    maxMessageChars: positiveInt(process.env.AI_MAX_MESSAGE_CHARS, 4000),
    maxOutputTokens: positiveInt(process.env.AI_MAX_OUTPUT_TOKENS, 800),
    maxToolIterations: positiveInt(process.env.AI_MAX_TOOL_ITERATIONS, 6),
    // AI-2 — how many times a turn retries a provider response that carries NO
    // usable content (neither text nor a tool call). The deployed free-tier gateway
    // returned one in roughly three turns out of five on 2026-10-12 (§27BE), and the
    // turn used to be handed to the user as a canned 201 sentence with nothing
    // recorded anywhere. Minimum 1. The retry consumes iterations from
    // maxToolIterations and is clamped by turnDeadlineMs like any other call, so it
    // can neither extend a turn nor run unbounded.
    emptyRetryMax: positiveInt(process.env.AI_EMPTY_RETRY_MAX, 1),
    maxToolResultChars: positiveInt(process.env.AI_MAX_TOOL_RESULT_CHARS, 12000),
    contextMessages: positiveInt(process.env.AI_CONTEXT_MESSAGES, 20),
    requestTimeoutMs: positiveInt(process.env.AI_REQUEST_TIMEOUT_MS, 60000),
    // One wall-clock budget for a WHOLE chat turn, across every provider call and
    // tool round (AI-1). Without it a turn's ceiling was the PRODUCT of
    // requestTimeoutMs and maxToolIterations and was stated nowhere, while the
    // mobile client aborted at a fixed 15000ms — so a slow-but-successful answer
    // was killed by the phone and reported as "cannot reach the server".
    // ai.service.ts derives ONE absolute deadline from this and clamps each call
    // to the time remaining, so the loop can never exceed it.
    turnDeadlineMs: positiveInt(process.env.AI_TURN_DEADLINE_MS, 60000),
    rateLimitWindowMs: positiveInt(process.env.AI_RATE_LIMIT_WINDOW_MS, 60000),
    rateLimitMax: positiveInt(process.env.AI_RATE_LIMIT_MAX, 20),
  };
}

export default { aiConfig };
