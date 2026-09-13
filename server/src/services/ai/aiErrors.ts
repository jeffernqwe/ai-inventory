/**
 * AI error types. These are deliberately distinct from the general ApiError
 * envelope so the AI controller can map them to clean client responses:
 *
 *   AiNotConfigured  -> 503 AI_NOT_CONFIGURED (operator must configure the server)
 *   AiProviderError  -> 502 AI_UNAVAILABLE    (transient upstream failure)
 *
 * Neither type carries secrets, stack traces, or internal URIs. Provider
 * internals (raw upstream bodies, keys) are logged server-side only.
 */

export const AI_NOT_CONFIGURED = 'AI_NOT_CONFIGURED';
export const AI_UNAVAILABLE = 'AI_UNAVAILABLE';

export class AiNotConfigured extends Error {
  declare code: string;

  constructor(message = 'The AI assistant is not configured on this server.') {
    super(message);
    this.name = 'AiNotConfigured';
    this.code = AI_NOT_CONFIGURED;
  }
}

export class AiProviderError extends Error {
  declare code: string;

  constructor(message = 'The AI service could not be reached.', code = AI_UNAVAILABLE) {
    super(message);
    this.name = 'AiProviderError';
    this.code = code;
  }
}

export function isAiError(err: unknown) {
  return err instanceof AiNotConfigured || err instanceof AiProviderError;
}

export default { AiNotConfigured, AiProviderError, AI_NOT_CONFIGURED, AI_UNAVAILABLE, isAiError };
