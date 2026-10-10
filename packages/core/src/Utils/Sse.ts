import { FastResponse } from '../Types/CommonTypes';

/**
 * A single Server-Sent Event.
 *
 * @see https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation
 */
export interface SseMessage {
  /** Event payload. Strings are sent as-is, everything else is JSON-serialized. */
  data?: unknown;
  /** Event name, dispatched on the client as `addEventListener(event, ...)`. */
  event?: string;
  /** Event id, sent back by the browser in `Last-Event-ID` on reconnect. */
  id?: string | number;
  /** Reconnection time in milliseconds. */
  retry?: number;
}

/**
 * Values an SSE handler may produce. Primitives are treated as the event data.
 */
export type SseSource = AsyncIterable<SseMessage | string | number | boolean> | Iterable<SseMessage | string | number | boolean>;

/**
 * Options for {@link createSseResponse}.
 */
export interface SseOptions {
  /**
   * Interval in milliseconds for sending keep-alive comments, which stop proxies
   * from closing an idle connection. Disabled when not set.
   */
  heartbeat?: number;
  /**
   * Called when the source throws after the response has been sent. The status
   * cannot change at that point, so the stream is closed and the error is
   * reported here instead.
   */
  onError?: (error: unknown) => void;
}

const SSE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache',
  // Disables response buffering in nginx, which would otherwise hold events back.
  'X-Accel-Buffering': 'no',
};

const LINE_BREAK = /\r\n|\r|\n/;

const SSE_FIELDS: ReadonlySet<string> = new Set(['data', 'event', 'id', 'retry']);

/**
 * Removes line breaks from a single-line field, which would otherwise let the
 * value inject extra fields into the stream.
 *
 * @param {string} value - The field value
 * @returns {string} The sanitized value
 */
function toSingleLine(value: string): string {
  return value.replaceAll(/[\r\n\0]/g, '');
}

/**
 * Serializes a message into the `text/event-stream` wire format.
 *
 * @param {SseMessage | string | number | boolean} message - The message to serialize
 * @returns {string} The serialized event, terminated by a blank line
 */
export function formatSseMessage(message: SseMessage | string | number | boolean): string {
  const event: SseMessage = typeof message === 'object' && message !== null ? message : { data: message };
  let out = '';

  // Yielding a payload instead of a message (`yield user`) would otherwise drop
  // its fields without a trace, or send a field like `id` as the event id.
  if (Array.isArray(event)) {
    throw new TypeError('SSE message must be an object, got an array. Wrap the payload in { data: ... }.');
  }

  for (const key of Object.keys(event)) {
    if (!SSE_FIELDS.has(key)) {
      throw new TypeError(`SSE message has unknown field "${key}". Wrap the payload in { data: ... }.`);
    }
  }

  if (event.event != null) {
    out += `event: ${toSingleLine(event.event)}\n`;
  }

  if (event.id != null) {
    out += `id: ${toSingleLine(String(event.id))}\n`;
  }

  if (event.retry != null) {
    if (!Number.isFinite(event.retry)) {
      throw new TypeError(`SSE message retry must be a finite number, got ${event.retry}.`);
    }

    out += `retry: ${Math.max(0, Math.trunc(event.retry))}\n`;
  }

  if (event.data !== undefined) {
    const data = typeof event.data === 'string' ? event.data : JSON.stringify(event.data);

    // Functions, symbols and objects whose toJSON() returns undefined have no JSON form.
    if (data === undefined) {
      throw new TypeError(`SSE message data of type ${typeof event.data} cannot be serialized to JSON.`);
    }
    for (const line of data.split(LINE_BREAK)) {
      out += `data: ${line}\n`;
    }
  }

  return out + '\n';
}

/**
 * Checks whether an error comes from an aborted `AbortSignal`.
 *
 * @param {unknown} error - The error to check
 * @returns {boolean} True for an `AbortError`
 */
function isAbortError(error: unknown): boolean {
  return (error as { name?: unknown } | null)?.name === 'AbortError';
}

/**
 * Returns an iterator over a sync or async iterable.
 *
 * @param {SseSource} source - The event source
 * @returns {AsyncIterator<unknown> | Iterator<unknown>} The iterator
 */
function getIterator(source: SseSource): AsyncIterator<unknown> | Iterator<unknown> {
  // A string is iterable too, but streaming it char by char is never intended.
  if (typeof source === 'string') {
    throw new TypeError('SSE handler must return an AsyncIterable or Iterable of messages');
  }

  if (source != null && typeof (source as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function') {
    return (source as AsyncIterable<unknown>)[Symbol.asyncIterator]();
  }

  if (source != null && typeof (source as Iterable<unknown>)[Symbol.iterator] === 'function') {
    return (source as Iterable<unknown>)[Symbol.iterator]();
  }

  throw new TypeError('SSE handler must return an AsyncIterable or Iterable of messages');
}

/**
 * Pulls and formats the first message before the response is created, so that
 * both a source failing at its start and an invalid first message become a
 * regular error response instead of a broken `200` stream.
 *
 * @param {AsyncIterator<unknown> | Iterator<unknown>} iterator - The source iterator
 * @returns {Promise<string | null>} The first chunk, or `null` for an empty source
 */
async function formatFirst(iterator: AsyncIterator<unknown> | Iterator<unknown>): Promise<string | null> {
  const { value, done } = await iterator.next();

  if (done) {
    return null;
  }

  try {
    return formatSseMessage(value as SseMessage);
  } catch (error) {
    // The source is paused at its first `yield`; close it so `finally` runs.
    closeIterator(iterator);
    throw error;
  }
}

/**
 * Closes the source so `finally` blocks in an async generator run.
 *
 * Not awaited: an async generator handles return() only once it reaches its
 * next `yield`, which may never happen (see `req.signal` in the docs), and
 * nothing should hang on it.
 *
 * @param {AsyncIterator<unknown> | Iterator<unknown>} iterator - The source iterator
 * @param {(error: unknown) => void} [onError] - Called when return() fails with anything but an AbortError
 */
function closeIterator(iterator: AsyncIterator<unknown> | Iterator<unknown>, onError?: (error: unknown) => void): void {
  Promise.resolve()
    .then(() => iterator.return?.())
    .catch((error: unknown) => {
      if (!isAbortError(error)) {
        onError?.(error);
      }
    });
}

/**
 * Creates a streaming `text/event-stream` response from an iterable of messages.
 *
 * The first event is pulled before the response is created. Generators run
 * lazily, so without this an error thrown at their start (e.g. a failed auth
 * check) would surface only after a `200` had been sent; this way it rejects
 * the returned promise and becomes a regular error response.
 *
 * Further events are pulled only when the client is ready for them, and the
 * source is closed (`iterator.return()`) when the client disconnects, so
 * `finally` blocks in an async generator run on disconnect.
 *
 * @param {SseSource} source - The messages to stream
 * @param {SseOptions} [options] - Stream options
 * @returns {Promise<Response>} The streaming response
 */
export async function createSseResponse(source: SseSource, options: SseOptions = {}): Promise<Response> {
  const iterator = getIterator(source);
  // The first chunk: `null` when the source is empty, `undefined` once sent.
  let pending: string | null | undefined = await formatFirst(iterator);
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const stop = (): void => {
    closed = true;
    clearInterval(heartbeat);
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (options.heartbeat && options.heartbeat > 0) {
        heartbeat = setInterval(() => {
          // A full queue means the client is not reading; skip the ping rather
          // than piling them up for as long as the connection stays open.
          if ((controller.desiredSize ?? 0) > 0) {
            controller.enqueue(encoder.encode(': ping\n\n'));
          }
        }, options.heartbeat);
      }
    },

    async pull(controller) {
      try {
        let chunk: string | null;

        if (pending === undefined) {
          const { value, done } = await iterator.next();
          chunk = done ? null : formatSseMessage(value as SseMessage);
        } else {
          chunk = pending;
          pending = undefined;
        }

        if (closed) {
          return;
        }

        if (chunk === null) {
          stop();
          controller.close();
          return;
        }

        controller.enqueue(encoder.encode(chunk));
      } catch (error) {
        if (closed) {
          return;
        }

        stop();
        // A message that failed to format leaves the source paused at its
        // `yield`, and an errored stream never calls cancel(); close it here.
        closeIterator(iterator);

        // A generator that bails out through an AbortSignal (e.g. `req.signal`
        // on disconnect) ends the stream on purpose - it is not a failure.
        if (isAbortError(error)) {
          controller.close();
          return;
        }

        controller.error(error);
        options.onError?.(error);
      }
    },

    cancel() {
      stop();
      closeIterator(iterator, options.onError);
    },
  });

  return new FastResponse(stream, { status: 200, headers: SSE_HEADERS });
}
