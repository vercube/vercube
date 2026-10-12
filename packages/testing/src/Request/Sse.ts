import type { TestingTypes } from '../Types/TestingTypes';

/**
 * Applies one `field: value` line of an event stream to the event being built.
 *
 * @param event - The event being built
 * @param data - The data lines collected so far
 * @param line - The line, without its line ending
 * @returns Nothing, `event` and `data` are updated in place
 */
function applyLine(event: Partial<TestingTypes.SseEvent>, data: string[], line: string): void {
  // a line starting with a colon is a comment, used as a keep-alive
  if (line.startsWith(':')) {
    return;
  }

  const colon = line.indexOf(':');
  const field = colon === -1 ? line : line.slice(0, colon);
  let value = colon === -1 ? '' : line.slice(colon + 1);

  if (value.startsWith(' ')) {
    value = value.slice(1);
  }

  switch (field) {
    case 'data': {
      data.push(value);
      break;
    }
    case 'event': {
      event.event = value;
      break;
    }
    case 'id': {
      event.id = value;
      break;
    }
    case 'retry': {
      if (/^\d+$/.test(value)) {
        event.retry = Number(value);
      }
      break;
    }
    default:
  }
}

/**
 * Reads a `text/event-stream` body as it arrives, yielding each event once the
 * blank line ending it has been received. Nothing is buffered beyond the event
 * being read.
 *
 * Follows the WHATWG parsing rules: `data:` lines are joined with `\n`,
 * comments are skipped, and an event without data is not dispatched.
 *
 * @param body - The response body
 * @returns The events, in order
 */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<TestingTypes.SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();

  let buffer = '';
  let event: Partial<TestingTypes.SseEvent> = {};
  let data: string[] = [];

  try {
    while (true) {
      const { value, done } = await reader.read();

      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });

      let match: RegExpExecArray | null;

      while ((match = /\r\n|\r|\n/.exec(buffer)) !== null) {
        // a lone \r at the end may be the first half of \r\n, wait for more
        if (match[0] === '\r' && match.index === buffer.length - 1 && !done) {
          break;
        }

        const line = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);

        if (line !== '') {
          applyLine(event, data, line);
          continue;
        }

        if (data.length > 0) {
          yield { ...event, data: data.join('\n') };
        }

        event = {};
        data = [];
      }

      if (done) {
        return;
      }
    }
  } finally {
    // stops the server side too when the consumer stops early
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
