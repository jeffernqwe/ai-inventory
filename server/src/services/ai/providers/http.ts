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

/**
 * TEMPORARY — Phase 31D.3 diagnostics for the non-JSON branch.
 *
 * A production AgentRouter call answered 2xx with a body `res.json()` could not
 * parse, and the branch below recorded only that fact: the status, the
 * Content-Type and the body itself were all discarded, which left the failure
 * un-diagnosable. These helpers record what that branch was throwing away.
 *
 * They are logging only. Nothing here alters control flow, the thrown error or
 * the response: the same AiProviderError is raised, and the response is read
 * exactly once (the single `res.text()` below) — never re-read, never retried.
 */

/** Longest body prefix ever logged; everything past this is never inspected. */
const BODY_PREFIX_MAX = 300;

/**
 * Anything that could be credential material. Several of these are value
 * *prefixes* (`sk-`, `Bearer `, `eyJ`), so masking the marker alone would leave
 * the secret itself in the log — a match therefore withholds the WHOLE prefix
 * rather than partially masking it. That costs only the prefix: `status`,
 * `contentType`, `contentLength` and `classification` are what this diagnostic
 * is read for, and none of them depends on it. Over-redacting is the safe side.
 */
const SECRET_LIKE = /sk-|bearer|eyJ|mongodb|api[_-]?key|token|authorization/i;

/** The body prefix for the log, or a withholding notice when it looks sensitive. */
function sanitizeBodyPrefix(body: string) {
  const prefix = body.slice(0, BODY_PREFIX_MAX);
  if (SECRET_LIKE.test(prefix)) return '[WITHHELD - prefix matched a secret-like marker]';
  return prefix;
}

/**
 * Coarse shape of the upstream body, checked in the order that keeps each rule
 * unambiguous: an empty body first (nothing else can be said about one), then
 * HTML, then an SSE stream, then JSON-looking text. `UNKNOWN` is reached only
 * when the response carried no Content-Type at all and the body matched nothing.
 */
function classifyUpstreamBody(contentType: string, body: string) {
  if (body.length === 0) return 'EMPTY';
  const ct = contentType.toLowerCase();
  const head = body.slice(0, 40).trimStart().toLowerCase();
  if (ct.includes('text/html') || head.startsWith('<!doctype') || head.startsWith('<html')) return 'HTML';
  if (ct.includes('text/event-stream') || head.startsWith('data:')) return 'SSE';
  if (head.startsWith('{') || head.startsWith('[')) return 'JSON_LIKE';
  return ct ? 'TEXT' : 'UNKNOWN';
}

/**
 * Log what the non-JSON branch would otherwise discard. Reports response
 * metadata and a bounded, sanitized body prefix only — never the request, its
 * headers, the caller's prompt or the upstream body in full.
 */
function logNonJsonDiagnostics({ providerName, res, body }: { providerName: string; res: Response; body: string }) {
  const contentType = res.headers.get('content-type') ?? '';
  console.error(
    [
      `[ai:${providerName}] upstream non-JSON diagnostics`,
      `status=${res.status}`,
      `contentType=${contentType || 'none'}`,
      `contentLength=${res.headers.get('content-length') ?? 'none'}`,
      `location=${res.headers.get('location') ?? 'none'}`,
      `bodyLength=${body.length}`,
      `classification=${classifyUpstreamBody(contentType, body)}`,
      `bodyPrefix=${JSON.stringify(sanitizeBodyPrefix(body))}`,
    ].join('\n')
  );
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
  //
  // The body is read as text rather than through `res.json()` only so the
  // failure branch below has something to report (Phase 31D.3). Stripping a
  // leading BOM is what `Body.json()` itself does before parsing, so a
  // BOM-prefixed JSON body parses exactly as it did before.
  let bodyText = '';
  let data: unknown;
  try {
    bodyText = await res.text();
    data = JSON.parse(bodyText.charCodeAt(0) === 0xfeff ? bodyText.slice(1) : bodyText);
  } catch {
    console.error(`[ai:${providerName}] upstream returned a non-JSON body`);
    logNonJsonDiagnostics({ providerName, res, body: bodyText });
    throw new AiProviderError('The AI service returned an unexpected response.');
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    console.error(`[ai:${providerName}] upstream returned an unexpected payload shape`);
    throw new AiProviderError('The AI service returned an unexpected response.');
  }
  return data as UpstreamJsonBody;
}

export default { postJson };
