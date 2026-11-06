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
 * @returns The events, in order; `return()` cancels the body
 */
export async function* parseSse(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal | null,
): AsyncGenerator<SseEvent, void, undefined> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const abort = (): void => void reader.cancel(signal?.reason).catch(() => {});
  let buffer = '';
  let data: string[] = [];
  let event: string | undefined;
  let id: string | undefined;
  let retry: number | undefined;
  let pending = false;

  signal?.addEventListener('abort', abort, { once: true });

  try {
    while (true) {
      signal?.throwIfAborted();

      const { value, done } = await reader.read();

      signal?.throwIfAborted();

      if (done) {
        return;
      }

      const lines = (buffer + decoder.decode(value, { stream: true })).split(LINE);

      buffer = lines.pop()!;

      for (const line of lines) {
        if (line === '') {
          if (pending) {
            yield { data: data.length > 0 ? parseData(data.join('\n')) : undefined, event, id, retry };
          }

          data = [];
          event = id = retry = undefined;
          pending = false;
          continue;
        }

        if (line[0] === ':') {
          continue;
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
          continue;
        }

        pending = true;
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
