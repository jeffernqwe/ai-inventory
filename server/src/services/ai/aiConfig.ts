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
    // AgentRouter is an Anthropic-compatible gateway (see agentrouterProvider.ts).
    agentrouterModel: (process.env.AI_MODEL_AGENTROUTER || 'deepseek-v4-flash').trim(),
    agentrouterBaseUrl: (process.env.AGENTROUTER_BASE_URL || '').trim(),
    // OpenRouter is an Anthropic-compatible gateway too (see openrouterProvider.ts).
    // No default model on purpose: OpenRouter fronts hundreds of models with very
    // different tool-calling ability, so the model is REQUIRED — the provider
    // factory refuses to build without it rather than silently guessing one here.
    openrouterModel: (process.env.AI_MODEL_OPENROUTER || '').trim(),
    openrouterBaseUrl: (process.env.OPENROUTER_BASE_URL || '').trim(),

    // Cost / rate protection (V1). See SYSTEM_SPECIFICATION.md §25.
    maxMessageChars: positiveInt(process.env.AI_MAX_MESSAGE_CHARS, 4000),
    maxOutputTokens: positiveInt(process.env.AI_MAX_OUTPUT_TOKENS, 800),
    maxToolIterations: positiveInt(process.env.AI_MAX_TOOL_ITERATIONS, 6),
    maxToolResultChars: positiveInt(process.env.AI_MAX_TOOL_RESULT_CHARS, 12000),
    contextMessages: positiveInt(process.env.AI_CONTEXT_MESSAGES, 20),
    requestTimeoutMs: positiveInt(process.env.AI_REQUEST_TIMEOUT_MS, 60000),
    rateLimitWindowMs: positiveInt(process.env.AI_RATE_LIMIT_WINDOW_MS, 60000),
    rateLimitMax: positiveInt(process.env.AI_RATE_LIMIT_MAX, 20),
  };
}

export default { aiConfig };
