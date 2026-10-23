/**
 * AI-40 — the SSE framing the streaming assistant depends on.
 *
 * WHY THIS IS ITS OWN SUITE. Every failure in this file has the same symptom on screen — a
 * half-rendered sentence or a missing answer — and none of them can be reproduced by the screen
 * test, which necessarily feeds whole events. A mobile network delivers arbitrary chunks: the
 * cases below are the boundaries it actually produces (mid-payload, mid-separator, mid-UTF-8,
 * CRLF, a trailing event with no final blank line).
 */

import { createSseParser, readSseStream } from '../lib/sse';

/** Feed a body to a fresh parser and collect what it delivered. */
function parse(body: string, chunks?: string[]) {
  const events: { event: string; data: string }[] = [];
  const parser = createSseParser((event) => events.push(event));
  for (const chunk of chunks ?? [body]) parser.push(chunk);
  parser.end();
  return events;
}

const BODY = [
  'event: delta',
  'data: {"text":"You hold "}',
  '',
  'event: delta',
  'data: {"text":"112 units."}',
  '',
  'event: done',
  'data: {"ok":true}',
  '',
  '',
].join('\n');

describe('AI-40 — the SSE parser frames events', () => {
  it('delivers one event per block, in order, with its own name', () => {
    expect(parse(BODY)).toEqual([
      { event: 'delta', data: '{"text":"You hold "}' },
      { event: 'delta', data: '{"text":"112 units."}' },
      { event: 'done', data: '{"ok":true}' },
    ]);
  });

  it('holds a partial event until the rest of it arrives', () => {
    // One character at a time is the worst case; it must produce the same three events.
    expect(parse('', BODY.split(''))).toEqual(parse(BODY));
  });

  it('normalises CRLF, including when the carriage return ends a chunk', () => {
    const crlf = BODY.replace(/\n/g, '\r\n');
    const chunks = crlf.split(/(?<=\r)/); // every chunk ends just after a CR
    expect(parse('', chunks)).toEqual(parse(BODY));
  });

  it('ignores comment lines — the server heartbeats on an idle connection', () => {
    const heartbeats = `: ping\n\n${BODY}`;
    expect(parse(heartbeats)).toEqual(parse(BODY));
  });

  it('joins multiple data lines into one payload, as the spec says', () => {
    const events = parse('event: delta\ndata: one\ndata: two\n\n');
    expect(events).toEqual([{ event: 'delta', data: 'one\ntwo' }]);
  });

  it('keeps a leading space that is part of the value, stripping only the protocol space', () => {
    // `data: {"text":" x"}` is a delta beginning with a space. Stripping ONE space is correct;
    // stripping more would silently alter the answer's text.
    const events = parse('event: delta\ndata: {"text":" x"}\n\n');
    expect(events[0].data).toBe('{"text":" x"}');
  });

  it('flushes a final event that arrived without its blank-line separator', () => {
    expect(parse('event: delta\ndata: {"text":"end"}')).toEqual([
      { event: 'delta', data: '{"text":"end"}' },
    ]);
  });

  it('delivers nothing for a body that carries no data line', () => {
    expect(parse('event: ping\n\n')).toEqual([]);
  });
});

describe('AI-40 — reading a byte stream', () => {
  const encoder = new TextEncoder();

  /** A stream body that yields the given byte chunks. */
  const streamOf = (chunks: Uint8Array[]) => {
    let index = 0;
    return {
      getReader: () => ({
        read: async () =>
          index < chunks.length ? { done: false, value: chunks[index++] } : { done: true },
        releaseLock: () => {},
      }),
    };
  };

  it('decodes a multi-byte character split across two chunks', async () => {
    // "Café" — the é is two bytes. A decoder per chunk would produce two replacement characters
    // and the member would read "Caf��".
    const whole = encoder.encode('event: delta\ndata: {"text":"Café"}\n\n');
    const cut = whole.indexOf(0xc3) + 1;
    const chunks = [whole.slice(0, cut), whole.slice(cut)];
    const events: { event: string; data: string }[] = [];
    await readSseStream(streamOf(chunks), (event) => events.push(event));
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0].data).text).toBe('Café');
  });

  it('ends cleanly after the last chunk and releases the reader', async () => {
    const released = jest.fn();
    await readSseStream(
      {
        getReader: () => {
          let done = false;
          return {
            read: async () => {
              if (done) return { done: true };
              done = true;
              return { done: false, value: encoder.encode('event: delta\ndata: {"text":"x"}\n\n') };
            },
            releaseLock: released,
          };
        },
      },
      () => {},
    );
    expect(released).toHaveBeenCalled();
  });
});
