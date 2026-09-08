/**
 * Shared JSON-over-HTTPS caller for the AI providers (Node >=18 global fetch,
 * no SDK dependency). Enforces a timeout and normalises every failure into an
 * AiProviderError with a safe, client-presentable message — raw upstream
 * bodies and statuses are logged server-side, never returned to the client.
 */

import { AiProviderError } from '../aiErrors.js';

export async function postJson({ url, headers = {}, body, timeoutMs = 60000, providerName = 'ai' }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
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
    if (err?.name === 'AbortError') {
      console.error(`[ai:${providerName}] request timed out after ${timeoutMs}ms`);
      throw new AiProviderError('The AI service took too long to respond. Please try again.');
    }
    console.error(`[ai:${providerName}] network error: ${err?.message ?? 'unknown'}`);
    throw new AiProviderError('The AI service could not be reached. Please try again.');
  }
  clearTimeout(timer);

  if (!res.ok) {
    console.error(`[ai:${providerName}] upstream HTTP ${res.status}`);
    throw new AiProviderError('The AI service returned an error. Please try again.');
  }

  let data;
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
  return data;
}

export default { postJson };
