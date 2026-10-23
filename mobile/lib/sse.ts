/**
 * AI-40 — Server-Sent Events, the small part of the protocol this app needs.
 *
 * WHY A PARSER RATHER THAN `res.json()`. The answer is deliberately delivered in pieces so the
 * screen can show it while it is being written. Everything about that is a framing problem:
 * a chunk from the network can end anywhere — mid-JSON, mid-separator, mid-emoji — so the reader
 * must hold the tail until the rest of the event arrives and must never hand a half-event to the
 * caller. That is the whole file.
 *
 * WHAT IT DOES NOT DO. No reconnect, no id/retry bookkeeping, no interpretation of `event` names.
 * The server sends three names and closes; a dropped connection is reported to the caller, which
 * retries the turn through the ordinary route rather than pretending it can resume mid-answer.
 */

/** One framed event. `data` is the joined `data:` payload, exactly as the server sent it. */
export interface SseEvent {
  event: string;
  data: string;
}

export interface SseParser {
  /** Feed decoded text. Complete events are delivered synchronously, in order. */
  push(chunk: string): void;
  /** Flush a trailing event that arrived without its blank-line separator. */
  end(): void;
}

/**
 * Build an incremental parser.
 *
 * Comment lines (`: ping`, the heartbeat the server sends on an idle connection) are skipped
 * rather than delivered: they exist for proxies, not for the app, and a parser that surfaced them
 * would make the caller filter them out at every call site.
 */
export function createSseParser(onEvent: (event: SseEvent) => void): SseParser {
  let buffer = '';

  const emit = (block: string): void => {
    let event = 'message';
    const data: string[] = [];
    for (const rawLine of block.split('\n')) {
      if (rawLine === '' || rawLine.startsWith(':')) continue;
      const colon = rawLine.indexOf(':');
      const field = colon === -1 ? rawLine : rawLine.slice(0, colon);
      let value = colon === -1 ? '' : rawLine.slice(colon + 1);
      // The spec strips ONE leading space after the colon; a value that starts with a space on
      // purpose (a delta beginning with a space, which is common) must keep the rest.
      if (value.startsWith(' ')) value = value.slice(1);
      if (field === 'event') event = value;
      else if (field === 'data') data.push(value);
    }
    if (data.length === 0) return;
    onEvent({ event, data: data.join('\n') });
  };

  return {
    push(chunk: string): void {
      // CRLF is normalised so the framing logic has exactly one separator to look for. It is
      // done on the BUFFER, not the chunk: a network chunk can end between the `\r` and the
      // `\n`, and normalising them separately would leave that pair untouched — the separator
      // would never match and the events would be delivered as one giant payload. Found by the
      // split-CRLF case in `__tests__/ai40-sse-parser.test.ts`, which fails if this moves back.
      buffer = (buffer + chunk).replace(/\r\n/g, '\n');
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        emit(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');
      }
    },
    end(): void {
      if (buffer.trim() !== '') emit(buffer);
      buffer = '';
    },
  };
}

/** Anything with a byte-stream reader — an `expo/fetch` body, or a test double. */
export interface ByteStreamReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  /** Asks the source to stop producing. Optional: not every reader implements it. */
  cancel?(): Promise<void> | void;
  releaseLock?(): void;
}

export interface ByteStream {
  getReader(): ByteStreamReader;
}

/**
 * How long the stream may be SILENT before it is treated as broken.
 *
 * The server sends a comment line every 15 s precisely so a live connection can be told from a
 * dead one, so 20 s is one heartbeat plus a grace period. Without this the only bound was the
 * turn's 75 s budget, and a socket that died after its headers kept the screen on its spinner
 * for the whole of it (measured on the phone, 2026-10-23).
 */
export const STREAM_IDLE_MS = 20_000;

/** The error an idle stream raises. Named so the caller can tell it from an abort. */
export class StreamIdleError extends Error {
  constructor(message = 'The assistant stopped sending.') {
    super(message);
    this.name = 'StreamIdleError';
  }
}

export interface ReadSseOptions {
  /** Silence tolerated between chunks. 0 disables the check. */
  idleMs?: number;
}

/**
 * Read a byte stream to its end, delivering each event as it is framed.
 *
 * The decoder is STATEFUL (`{ stream: true }`), because a multi-byte character can be split
 * across two chunks — a product name with an accent or an em dash is exactly where a decoder
 * per chunk would corrupt the text.
 *
 * It always settles: an abort cancels the body, and silence past `idleMs` raises
 * `StreamIdleError`. Both matter because `reader.read()` is not obliged to resolve again once
 * the socket under it is gone — that absence of an answer is the failure this function has to
 * produce on the caller's behalf.
 */
export async function readSseStream(
  stream: ByteStream,
  onEvent: (event: SseEvent) => void,
  signal?: AbortSignal,
  { idleMs = STREAM_IDLE_MS }: ReadSseOptions = {},
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser(onEvent);

  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let interrupt: ((err: Error) => void) | null = null;
  const interrupted = new Promise<never>((_resolve, reject) => {
    interrupt = reject;
  });
  // The race below may settle first; this keeps an interrupt from becoming an unhandled rejection.
  interrupted.catch(() => {});
  const armIdle = (): void => {
    if (!(idleMs > 0)) return;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleTimer = null;
      onAbort();
      interrupt?.(new StreamIdleError());
    }, idleMs);
  };

  /**
   * AI-40 (found on the device, 2026-10-23) — a reader parked on a socket that never delivers
   * another byte is not obliged to notice. The caller's budget therefore has to reach the body:
   * cancelling the stream is what asks it to stop, and it is best-effort because a broken
   * implementation may ignore it — which is why the caller ALSO races its own deadline.
   */
  function onAbort(): void {
    try {
      void reader.cancel?.();
    } catch {
      // Already gone; nothing to cancel.
    }
    // Cancel is a REQUEST, not a guarantee: a body may ignore it and leave `read()` parked. The
    // abort therefore also settles this function, so a caller that aborted is never left waiting
    // on a reader that will not answer (measured on the phone, 2026-10-23).
    const err = new Error('the stream was aborted');
    err.name = 'AbortError';
    interrupt?.(err);
  }

  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  const pump = async (): Promise<void> => {
    armIdle();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      armIdle();
      if (value) parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.end();
  };

  const reading = pump();
  reading.catch(() => {});
  try {
    await Promise.race([reading, interrupted]);
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
    signal?.removeEventListener('abort', onAbort);
    try {
      reader.releaseLock?.();
    } catch {
      // Already closed by the failure that is propagating; nothing to release.
    }
  }
}
