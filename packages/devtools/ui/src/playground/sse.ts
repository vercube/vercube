/**
 * A parser for `text/event-stream`, fed with the chunks `fetch` delivers.
 *
 * `EventSource` cannot be used for the playground: it sends no custom headers,
 * so a request made with it could carry neither the marker nor credentials.
 */

/** One event of a stream. */
export interface SseEvent {
  /** Event name; `message` when the stream names none. */
  event: string;
  data: string;
  id?: string;
  retry?: number;
}

/**
 * Creates a parser.
 *
 * @returns A function that takes the next chunk of text and returns the events it completed
 */
export function createSseParser(): (chunk: string) => SseEvent[] {
  let buffer = '';
  let event = '';
  let data: string[] = [];
  let id: string | undefined;
  let retry: number | undefined;

  return (chunk: string): SseEvent[] => {
    const events: SseEvent[] = [];

    buffer += chunk;

    // A line ends with LF, CR or CRLF. A trailing CR may be half of a CRLF
    // whose LF is in the next chunk, so it is left in the buffer.
    for (;;) {
      const match = /\r\n|\n|\r(?!$)/.exec(buffer);

      if (!match) {
        break;
      }

      const line = buffer.slice(0, match.index);

      buffer = buffer.slice(match.index + match[0].length);

      if (line === '') {
        // A blank line dispatches. A block with only `retry` or a comment
        // still reaches the reader when it changed something worth showing.
        if (data.length > 0 || event !== '' || retry !== undefined) {
          events.push({ event: event || 'message', data: data.join('\n'), id, retry });
        }

        event = '';
        data = [];
        retry = undefined;
        continue;
      }

      if (line.startsWith(':')) {
        continue;
      }

      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');

      if (field === 'event') {
        event = value;
      } else if (field === 'data') {
        data.push(value);
      } else if (field === 'id') {
        id = value;
      } else if (field === 'retry' && /^\d+$/.test(value)) {
        retry = Number(value);
      }
    }

    return events;
  };
}
