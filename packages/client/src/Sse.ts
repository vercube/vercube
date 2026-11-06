import type { SseEvent } from './Types/RouteTypes';

/** Line breaks of the event stream format; a trailing `\r` waits for a possible `\n`. */
const LINE = /\r\n|\r(?!$)|\n/;

/**
 * Reads a `text/event-stream` body as events.
 *
 * `data` is parsed as JSON when it is JSON, which is how Vercube sends anything
 * that is not a string. Comments (heartbeats) are skipped. Unlike
 * `EventSource`, an event without data is still delivered, because a Vercube
 * handler may yield `{ event: 'done' }`.
 *
 * @param body - The response body
 * @param signal - Aborting it stops the stream and rejects the pending read
 * @returns The events, in order; `return()` cancels the body right away, even
 *   before the first event or while a read is pending
 */
export function parseSse(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal | null,
): AsyncGenerator<SseEvent, void, undefined> {
  const reader = body.getReader();
  const cancel = (reason?: unknown): Promise<void> => reader.cancel(reason).catch(() => {});
  const events = readEvents(reader, signal);
  const finish = events.return.bind(events);

  // A generator only runs `finally` once it has started and reached a `yield`,
  // so cancelling from in there would miss `return()` before the first event
  // and wait for the next event while a read is pending.
  events.return = async (value) => {
    await cancel();
    return finish(value);
  };

  return events;
}

/**
 * @param reader - The body's reader
 * @param signal - Aborting it rejects the next read
 * @returns The events
 */
async function* readEvents(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal?: AbortSignal | null,
): AsyncGenerator<SseEvent, void, undefined> {
  const decoder = new TextDecoder();
  const abort = (): void => void reader.cancel(signal?.reason).catch(() => {});
  let buffer = '';
  let data: string[] = [];
  let event: string | undefined;
  let id: string | undefined;
  let retry: number | undefined;
  let pending = false;

  /** Applies one line; returns the event a blank line completes. */
  const take = (line: string): SseEvent | undefined => {
    if (line === '') {
      const complete = pending ? { data: data.length > 0 ? parseData(data.join('\n')) : undefined, event, id, retry } : undefined;

      data = [];
      event = id = retry = undefined;
      pending = false;

      return complete;
    }

    if (line[0] === ':') {
      return undefined;
    }

    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const content = colon === -1 ? '' : line.slice(line[colon + 1] === ' ' ? colon + 2 : colon + 1);

    if (field === 'data') {
      data.push(content);
    } else if (field === 'event') {
      event = content;
    } else if (field === 'id') {
      id = content;
    } else if (field === 'retry' && /^\d+$/.test(content)) {
      retry = Number(content);
    } else {
      return undefined;
    }

    pending = true;

    return undefined;
  };

  signal?.addEventListener('abort', abort, { once: true });

  try {
    while (true) {
      signal?.throwIfAborted();

      const { value, done } = await reader.read();

      signal?.throwIfAborted();

      // at the end, a held-back `\r` can only be a line ending
      const text = done ? buffer + decoder.decode() : buffer + decoder.decode(value, { stream: true });
      const lines = (done && text.endsWith('\r') ? `${text.slice(0, -1)}\n` : text).split(LINE);

      // an event without its closing blank line is dropped, as the spec says
      buffer = lines.pop()!;

      for (const line of lines) {
        const complete = take(line);

        if (complete) {
          // several events can arrive in one chunk; none after an abort
          signal?.throwIfAborted();
          yield complete;
        }
      }

      if (done) {
        return;
      }
    }
  } finally {
    signal?.removeEventListener('abort', abort);
    reader.cancel().catch(() => {});
  }
}

/**
 * @param data - The joined `data` lines
 * @returns The JSON value, or the text when it is not JSON
 */
function parseData(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}
