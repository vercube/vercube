import { CoreErrors } from '../Errors/Catalog';
import { getFileContentType } from './Mine';

/**
 * What a streaming handler may hand over: a Web stream, or anything that can be
 * iterated, such as an async generator, an array or a Node `Readable`.
 */
export type StreamSource<T = unknown> = ReadableStream<Uint8Array> | AsyncIterable<T> | Iterable<T>;

/**
 * Options of {@link createStream} and of the `@Stream()` decorator.
 */
export interface StreamOptions<T = unknown> {
  /**
   * Content type of the response. Without it the first chunk decides: bytes
   * are `application/octet-stream`, a string is `text/plain; charset=utf-8`
   * and anything else is `application/x-ndjson`.
   */
  type?: string;

  /**
   * Turns one chunk into what goes on the wire. Without it bytes are sent as
   * they are, a string is sent as UTF-8, and anything else as one line of
   * JSON (NDJSON).
   */
  serialize?: (chunk: T) => string | Uint8Array;

  /**
   * Called when the source throws after the response has been sent. The status
   * cannot change at that point, so the stream is cut off and the error is
   * reported here instead.
   */
  onError?: (error: unknown) => void;
}

/**
 * What the lower-level {@link iterableToStream} needs on top of a source.
 */
export interface IterableStreamOptions {
  /** Turns one item of the source into the bytes to send. May throw to reject the item. */
  encode: (chunk: unknown) => Uint8Array;

  /** See {@link StreamOptions.onError}. */
  onError?: (error: unknown) => void;

  /**
   * What an `AbortError` thrown by the source does to the stream. `close` ends
   * it as if the source had finished, which suits a feed without an end, such
   * as server-sent events. `error` cuts it off, so a client can tell an
   * export that was interrupted from one that is complete. Neither reports to
   * `onError`: an abort is a decision, not a failure.
   * @default 'error'
   */
  onAbort?: 'close' | 'error';

  /**
   * Sends `chunk` every `interval` milliseconds while the client keeps reading,
   * so a proxy does not close a connection that is merely quiet.
   */
  heartbeat?: { interval: number; chunk: Uint8Array };
}

/** Content type a stream was given explicitly, by `@Stream({ type })` or {@link createStream}. */
const STREAM_TYPES: WeakMap<ReadableStream, string> = new WeakMap();

/** Content type the first chunk of a stream implied, used when nothing else names one. */
const GUESSED_TYPES: WeakMap<ReadableStream, string> = new WeakMap();

const encoder = new TextEncoder();

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
 * @param {unknown} source - The source
 * @param {() => TypeError} refuse - Creates the error for a source that cannot be iterated
 * @returns {AsyncIterator<unknown> | Iterator<unknown>} The iterator
 * @throws {TypeError} When the source cannot be iterated
 */
export function getStreamIterator(source: unknown, refuse: () => TypeError): AsyncIterator<unknown> | Iterator<unknown> {
  // A string is iterable too, but streaming it char by char is never intended.
  if (typeof source !== 'string' && source != null) {
    if (typeof (source as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function') {
      return (source as AsyncIterable<unknown>)[Symbol.asyncIterator]();
    }

    if (typeof (source as Iterable<unknown>)[Symbol.iterator] === 'function') {
      return (source as Iterable<unknown>)[Symbol.iterator]();
    }
  }

  throw refuse();
}

/**
 * Closes the source so `finally` blocks in an async generator run.
 *
 * Not awaited: an async generator handles return() only once it reaches its
 * next `yield`, which may never happen, and nothing should hang on it.
 *
 * @param {AsyncIterator<unknown> | Iterator<unknown>} iterator - The source iterator
 * @param {(error: unknown) => void} [onError] - Called when return() fails with anything but an AbortError
 */
export function closeStreamIterator(
  iterator: AsyncIterator<unknown> | Iterator<unknown>,
  onError?: (error: unknown) => void,
): void {
  Promise.resolve()
    .then(() => iterator.return?.())
    .catch((error: unknown) => {
      if (!isAbortError(error)) {
        onError?.(error);
      }
    });
}

/**
 * Turns an iterator into a byte stream that pulls from it only as fast as the
 * client reads.
 *
 * The first item is pulled and encoded before the stream exists. Generators
 * run lazily, so without this an error thrown at their start (a failed
 * permission check, a missing record) would surface only after a `200` had
 * been sent; this way it rejects the returned promise and becomes a regular
 * error response.
 *
 * After that: an item is pulled when the client is ready for one, the source
 * is closed (`iterator.return()`) when the client disconnects, so `finally`
 * blocks run, a source that bails out with an `AbortError` ends the stream
 * quietly, and any other error cuts the stream off and goes to `onError`.
 *
 * @param {AsyncIterator<unknown> | Iterator<unknown>} iterator - The source iterator
 * @param {IterableStreamOptions} options - How to encode items and where to report errors
 * @returns {Promise<ReadableStream<Uint8Array>>} The stream
 */
export async function iterableToStream(
  iterator: AsyncIterator<unknown> | Iterator<unknown>,
  options: IterableStreamOptions,
): Promise<ReadableStream<Uint8Array>> {
  const { encode, onError } = options;

  const first = await iterator.next();
  // The first chunk: `null` when the source is empty, `undefined` once sent.
  let pending: Uint8Array | null | undefined = null;

  if (!first.done) {
    try {
      pending = encode(first.value);
    } catch (error) {
      // The source is paused at its first `yield`; close it so `finally` runs.
      closeStreamIterator(iterator);
      throw error;
    }
  }

  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const stop = (): void => {
    closed = true;
    clearInterval(heartbeat);
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const beat = options.heartbeat;

      if (beat && beat.interval > 0) {
        heartbeat = setInterval(() => {
          // A full queue means the client is not reading; skip the beat rather
          // than piling them up for as long as the connection stays open.
          if ((controller.desiredSize ?? 0) > 0) {
            controller.enqueue(beat.chunk);
          }
        }, beat.interval);

        // a beat must not be what keeps the process alive
        (heartbeat as { unref?: () => void }).unref?.();
      }
    },

    async pull(controller) {
      try {
        let chunk: Uint8Array | null;

        if (pending === undefined) {
          const { value, done } = await iterator.next();
          chunk = done ? null : encode(value);
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

        controller.enqueue(chunk);
      } catch (error) {
        if (closed) {
          return;
        }

        stop();
        // An item that failed to encode leaves the source paused at its
        // `yield`, and an errored stream never calls cancel(); close it here.
        closeStreamIterator(iterator);

        if (isAbortError(error)) {
          // A source that bails out through an AbortSignal (`req.signal` on
          // disconnect, its own timeout) stopped on purpose.
          if (options.onAbort === 'close') {
            controller.close();
          } else {
            controller.error(error);
          }

          return;
        }

        controller.error(error);
        onError?.(error);
      }
    },

    cancel() {
      stop();
      closeStreamIterator(iterator, onError);
    },
  });
}

/**
 * Serializes a chunk the default way: bytes as they are, a string as UTF-8,
 * anything else as one line of JSON.
 *
 * @param {unknown} chunk - The chunk
 * @returns {Uint8Array} The bytes to send
 * @throws {TypeError} When the chunk has no JSON form
 */
function encodeChunk(chunk: unknown): Uint8Array {
  if (chunk instanceof Uint8Array) {
    return chunk;
  }

  if (typeof chunk === 'string') {
    return encoder.encode(chunk);
  }

  if (chunk instanceof ArrayBuffer) {
    return new Uint8Array(chunk);
  }

  if (ArrayBuffer.isView(chunk)) {
    return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  }

  const json = JSON.stringify(chunk);

  // `undefined`, functions and symbols have no JSON form
  if (json === undefined) {
    throw CoreErrors.STREAM_CHUNK_NOT_SERIALIZABLE({ type: typeof chunk });
  }

  return encoder.encode(`${json}\n`);
}

/**
 * The content type a first chunk implies, see {@link StreamOptions.type}.
 *
 * @param {unknown} chunk - The first chunk of a source
 * @returns {string} The content type
 */
function typeOfChunk(chunk: unknown): string {
  if (typeof chunk === 'string') {
    return 'text/plain; charset=utf-8';
  }

  return chunk instanceof ArrayBuffer || ArrayBuffer.isView(chunk) ? 'application/octet-stream' : 'application/x-ndjson';
}

/** Bodies that are sent as they are produced, see {@link markLiveStream}. */
const LIVE_STREAMS: WeakSet<ReadableStream> = new WeakSet();

/**
 * Remembers that a stream is sent as it is produced: one a handler returned,
 * or an event feed. Whoever transforms the response later (compression) must
 * not hold its chunks back.
 *
 * The stream is remembered and not the response, as a response is rebuilt on
 * its way out while its body stays the same object.
 *
 * @param {ReadableStream} stream - The body of a streaming response
 * @returns {void}
 */
export function markLiveStream(stream: ReadableStream): void {
  LIVE_STREAMS.add(stream);
}

/**
 * Whether a response is sent as it is produced: its body was marked with
 * {@link markLiveStream}, or it is an event stream built by hand.
 *
 * @param {Response} response - The response
 * @returns {boolean} True for a streaming response
 */
export function isStreamResponse(response: Response): boolean {
  const body = response.body;

  return (
    (body !== null && LIVE_STREAMS.has(body)) || (response.headers.get('content-type') ?? '').startsWith('text/event-stream')
  );
}

/**
 * The content type a stream was given explicitly, if any.
 *
 * @param {ReadableStream} stream - A stream a handler returned
 * @returns {string | undefined} The content type
 */
export function getStreamType(stream: ReadableStream): string | undefined {
  return STREAM_TYPES.get(stream);
}

/**
 * The content type the first chunk of a stream implied, if the stream was
 * built from an iterable.
 *
 * @param {ReadableStream} stream - A stream a handler returned
 * @returns {string | undefined} The content type
 */
export function getStreamGuessedType(stream: ReadableStream): string | undefined {
  return GUESSED_TYPES.get(stream);
}

/**
 * Turns what a handler returned into a byte stream the framework answers with:
 * the body is sent as it is produced, and the handler's `@Status()` and
 * `@SetHeader()` still apply.
 *
 * A `ReadableStream` is passed through, with the content type attached when
 * one is given. Anything iterable is pulled from as the client reads, each
 * chunk serialized on its way out. The first chunk is pulled before this
 * resolves, so a source that fails at its start becomes a regular error
 * response rather than a broken `200`.
 *
 * `@Stream()` calls this for you. Call it yourself to stream from a handler
 * that decides at runtime whether it streams.
 *
 * @param {StreamSource<T>} source - A stream or an iterable of chunks
 * @param {StreamOptions<T>} [options] - Content type, serializer and error callback
 * @returns {Promise<ReadableStream<Uint8Array>>} The stream to return from the handler
 * @throws {TypeError} When the source is neither a stream nor iterable
 */
export async function createStream<T = unknown>(
  source: StreamSource<T>,
  options: StreamOptions<T> = {},
): Promise<ReadableStream<Uint8Array>> {
  const serialize = options.serialize as ((chunk: unknown) => string | Uint8Array) | undefined;

  // A stream is passed through as it is, unless its chunks are to be
  // serialized or its failure reported: then it is read like any iterable.
  if (source instanceof ReadableStream && !serialize && !options.onError) {
    if (options.type) {
      STREAM_TYPES.set(source, options.type);
    }

    return source;
  }

  const iterator = getStreamIterator(source, CoreErrors.STREAM_SOURCE_INVALID);
  let guessed: string | undefined;

  const encode = (chunk: unknown): Uint8Array => {
    // decided by the first chunk, which is encoded before the response exists
    guessed ??= serialize ? 'application/octet-stream' : typeOfChunk(chunk);

    if (!serialize) {
      return encodeChunk(chunk);
    }

    const out = serialize(chunk);

    return typeof out === 'string' ? encoder.encode(out) : out;
  };

  const stream = await iterableToStream(iterator, { encode, onError: options.onError });

  if (options.type) {
    STREAM_TYPES.set(stream, options.type);
  } else if (guessed) {
    // an empty source never saw a chunk and implies nothing
    GUESSED_TYPES.set(stream, guessed);
  }

  return stream;
}

/**
 * Options of {@link streamFile}.
 */
export interface StreamFileOptions {
  /**
   * Name the browser saves the file under. Also decides the content type when
   * `type` is not given, from its extension.
   */
  filename?: string;

  /** Content type. Defaults to the type of a `Blob`, then to the extension of `filename`. */
  type?: string;

  /**
   * Size in bytes, sent as `Content-Length`. A source that turns out shorter
   * or longer fails the response instead of sending a body that contradicts
   * the header. Ignored for a `Blob`, which knows its own size.
   */
  size?: number;

  /**
   * `attachment` makes the browser download the file, `inline` lets it show
   * the file in the page.
   * @default 'attachment'
   */
  disposition?: 'attachment' | 'inline';

  /**
   * Extra response headers. `Content-Type`, `Content-Disposition` and
   * `Content-Length` are set from the options above and win over these.
   */
  headers?: HeadersInit;
}

/**
 * Builds a `Content-Disposition` value. The plain `filename` carries an ASCII
 * fallback and `filename*` the real name (RFC 6266), so a name with accents or
 * quotes neither breaks the header nor arrives mangled.
 *
 * @param {'attachment' | 'inline'} disposition - How the browser treats the file
 * @param {string} [filename] - The file name
 * @returns {string} The header value
 */
function contentDisposition(disposition: 'attachment' | 'inline', filename?: string): string {
  // no path, and nothing that could end the quoted string or the header
  const name = filename?.replaceAll(/^.*[/\\]/g, '').replaceAll(/[\r\n\0]/g, '');

  if (!name) {
    return disposition;
  }

  // `%` is left out as well: some browsers decode it in the plain parameter
  // eslint-disable-next-line no-control-regex
  const fallback = name.replaceAll(/[^\u0020-\u007E]/g, '_').replaceAll(/["\\%]/g, '_');

  if (fallback === name) {
    return `${disposition}; filename="${fallback}"`;
  }

  try {
    const encoded = encodeURIComponent(name).replaceAll(
      /['()*]/g,
      (char) => `%${char.codePointAt(0)!.toString(16).toUpperCase()}`,
    );

    return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
  } catch {
    // a lone surrogate cannot be encoded: the fallback is all there is
    return `${disposition}; filename="${fallback}"`;
  }
}

/**
 * Passes a byte stream on while holding it to a declared length: a chunk past
 * it, or an end before it, fails the stream. A body that disagrees with its
 * `Content-Length` leaves a keep-alive connection out of step, which is worse
 * than a response that visibly failed.
 *
 * @param {ReadableStream<Uint8Array>} source - The stream to pass on
 * @param {number} size - The number of bytes it has to carry
 * @returns {ReadableStream<Uint8Array>} The checked stream
 */
function enforceLength(source: ReadableStream<Uint8Array>, size: number): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let sent = 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await reader.read();

        if (done) {
          if (sent === size) {
            controller.close();
          } else {
            controller.error(CoreErrors.STREAM_FILE_TOO_SHORT({ sent, size }));
          }

          return;
        }

        sent += value.byteLength;

        if (sent > size) {
          reader.cancel().catch(() => {});
          controller.error(CoreErrors.STREAM_FILE_TOO_LONG({ size }));

          return;
        }

        controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },

    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

/**
 * Answers with a file: a `Response` whose body is streamed from the source,
 * with `Content-Type`, `Content-Disposition` and, when the size is known,
 * `Content-Length` set.
 *
 * The source is a Web `ReadableStream`, a Node `Readable` such as
 * `createReadStream(path)`, any iterable of byte chunks, or a `Blob` such as
 * `Bun.file(path)`, which the runtime may send without bringing it through
 * JavaScript at all.
 *
 * @example
 * ```ts
 * @Get('/report')
 * report() {
 *   return streamFile(createReadStream('/data/report.csv'), { filename: 'report.csv' });
 * }
 * ```
 *
 * @param {ReadableStream<Uint8Array> | AsyncIterable<Uint8Array> | Iterable<Uint8Array> | Blob} source - The file contents
 * @param {StreamFileOptions} [options] - Name, type, size and disposition
 * @returns {Promise<Response>} The response to return from the handler
 */
export async function streamFile(
  source: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array> | Iterable<Uint8Array> | Blob,
  options: StreamFileOptions = {},
): Promise<Response> {
  const blob = typeof Blob !== 'undefined' && source instanceof Blob ? source : undefined;
  const type = options.type || blob?.type || getFileContentType(options.filename) || 'application/octet-stream';
  const declared =
    options.size !== undefined && Number.isSafeInteger(options.size) && options.size >= 0 ? options.size : undefined;
  // a Blob knows its size, and a wrong one given for it would only break the response
  const size = blob ? blob.size : declared;

  const headers = new Headers(options.headers);

  headers.set('content-type', type);
  headers.set('content-disposition', contentDisposition(options.disposition ?? 'attachment', options.filename));

  if (size === undefined) {
    headers.delete('content-length');
  } else {
    headers.set('content-length', String(size));
  }

  let body: Blob | ReadableStream<Uint8Array>;

  if (blob) {
    body = blob;
  } else {
    const stream = await createStream(source as StreamSource<Uint8Array>);

    body = size === undefined ? stream : enforceLength(stream, size);
  }

  // the global Response: it knows how to send a Blob and a stream on every runtime
  return new Response(body, { status: 200, headers });
}
