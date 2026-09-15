/**
 * Shared JSON-over-HTTPS caller for the AI providers (Node >=18 global fetch,
 * no SDK dependency). Enforces a timeout and normalises every failure into an
 * AiProviderError with a safe, client-presentable message — raw upstream
 * bodies and statuses are logged server-side, never returned to the client.
 */

import { AiProviderError } from '../aiErrors.ts';

/**
 * The upstream JSON body, as far as anything here is allowed to assume: an
 * object whose properties are probed and never trusted. `Response.json()` is
 * typed `unknown`, and this is the narrowest thing that lets the parsers below
 * reach into a response at all — the `=== null` / `typeof` / `Array.isArray`
 * guard in postJson is the check that actually establishes the object, and every
 * field stays `unknown` for the caller to narrow deliberately. Nothing is
 * coerced and no default is introduced, so an array, a string or a body missing
 * a property still behaves exactly as it did when the local was untyped.
 */
export type UpstreamJsonBody = Record<string, unknown>;

/**
 * One JSON-over-HTTPS call. `body` is the provider's own request payload, built
 * by the caller and serialised here; `headers` are merged over the two this
 * layer always sends.
 */
export interface PostJsonOptions {
  url: string;
  headers?: Record<string, string>;
  body: unknown;
  timeoutMs?: number;
  providerName?: string;
}

export async function postJson({ url, headers = {}, body, timeoutMs = 60000, providerName = 'ai' }: PostJsonOptions): Promise<UpstreamJsonBody> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // The definite-assignment assertion replaces the untyped `let res;` without
  // touching the flow: every path reaching the read below has either assigned a
  // response or thrown. Erased, so the declaration is still emitted as `let res;`.
  let res!: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    // `err` is `unknown`: a thrown value has no shape TypeScript may assume, and
    // the assertion is the erasable way to read the properties this check has
    // always read. Nothing is attached to the error that leaves.
    if ((err as { name?: unknown })?.name === 'AbortError') {
      console.error(`[ai:${providerName}] request timed out after ${timeoutMs}ms`);
      throw new AiProviderError('The AI service took too long to respond. Please try again.');
    }
    console.error(`[ai:${providerName}] network error: ${(err as { message?: unknown })?.message ?? 'unknown'}`);
    throw new AiProviderError('The AI service could not be reached. Please try again.');
  }
  clearTimeout(timer);

  if (!res.ok) {
    console.error(`[ai:${providerName}] upstream HTTP ${res.status}`);
    throw new AiProviderError('The AI service returned an error. Please try again.');
  }

  // `unknown` at the untrusted boundary: the guard below is what narrows it, so
  // `=== null` here is a live check rather than a comparison the compiler knows
  // to be impossible.
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    console.error(`[ai:${providerName}] upstream returned a non-JSON body`);
    throw new AiProviderError('The AI service returned an unexpected response.');
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    console.error(`[ai:${providerName}] upstream returned an unexpected payload shape`);
    throw new AiProviderError('The AI service returned an unexpected response.');
  }
  return data as UpstreamJsonBody;
}

export default { postJson };
