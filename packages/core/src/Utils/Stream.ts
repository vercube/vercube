import { mime } from './Mine';

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
   * Sends `chunk` every `interval` milliseconds while the client keeps reading,
   * so a proxy does not close a connection that is merely quiet.
   */
  heartbeat?: { interval: number; chunk: Uint8Array };
}

/** Content type a stream was given by `@Stream()` or {@link createStream}, by stream. */
const STREAM_TYPES: WeakMap<ReadableStream, string> = new WeakMap();

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
 * @param {string} message - The error for a source that cannot be iterated
 * @returns {AsyncIterator<unknown> | Iterator<unknown>} The iterator
 * @throws {TypeError} When the source cannot be iterated
 */
export function getStreamIterator(source: unknown, message: string): AsyncIterator<unknown> | Iterator<unknown> {
  // A string is iterable too, but streaming it char by char is never intended.
  if (typeof source !== 'string' && source != null) {
    if (typeof (source as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function') {
      return (source as AsyncIterable<unknown>)[Symbol.asyncIterator]();
    }

    if (typeof (source as Iterable<unknown>)[Symbol.iterator] === 'function') {
      return (source as Iterable<unknown>)[Symbol.iterator]();
    }
  }

  throw new TypeError(message);
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

        // A generator that bails out through an AbortSignal (`req.signal` on
        // disconnect) ends the stream on purpose - it is not a failure.
        if (isAbortError(error)) {
          controller.close();
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
    throw new TypeError(`A stream chunk of type ${typeof chunk} cannot be serialized to JSON.`);
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

/**
 * The content type a stream was given, if any.
 *
 * @param {ReadableStream} stream - A stream a handler returned
 * @returns {string | undefined} The content type, undefined for a stream of unknown content
 */
export function getStreamType(stream: ReadableStream): string | undefined {
  return STREAM_TYPES.get(stream);
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
  if (source instanceof ReadableStream) {
    if (options.type) {
      STREAM_TYPES.set(source, options.type);
    }

    return source;
  }

  const iterator = getStreamIterator(source, 'A streaming handler must return a ReadableStream, an AsyncIterable or an Iterable');
  const serialize = options.serialize as ((chunk: unknown) => string | Uint8Array) | undefined;
  let type = options.type;

  const encode = (chunk: unknown): Uint8Array => {
    // decided by the first chunk, which is encoded before the response exists
    type ??= serialize ? 'application/octet-stream' : typeOfChunk(chunk);

    if (!serialize) {
      return encodeChunk(chunk);
    }

    const out = serialize(chunk);

    return typeof out === 'string' ? encoder.encode(out) : out;
  };

  const stream = await iterableToStream(iterator, { encode, onError: options.onError });

  // an empty source never saw a chunk
  STREAM_TYPES.set(stream, type ?? 'application/octet-stream');

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

  /** Size in bytes, sent as `Content-Length`. Known already for a `Blob`. */
  size?: number;

  /**
   * `attachment` makes the browser download the file, `inline` lets it show
   * the file in the page.
   * @default 'attachment'
   */
  disposition?: 'attachment' | 'inline';

  /** Extra response headers. */
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
  if (!filename) {
    return disposition;
  }

  // no path, and nothing that could end the quoted string or the header
  const name = filename.replaceAll(/^.*[/\\]/g, '').replaceAll(/[\r\n\0]/g, '');
  // eslint-disable-next-line no-control-regex
  const fallback = name.replaceAll(/[^\u0020-\u007E]/g, '_').replaceAll(/["\\]/g, '_');
  const encoded = encodeURIComponent(name).replaceAll(/['()*]/g, (char) => `%${char.codePointAt(0)!.toString(16).toUpperCase()}`);

  return fallback === name
    ? `${disposition}; filename="${fallback}"`
    : `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
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
  const isBlob = typeof Blob !== 'undefined' && source instanceof Blob;
  const extension = options.filename?.includes('.') ? options.filename.slice(options.filename.lastIndexOf('.')) : '';
  const type = options.type || (isBlob && (source as Blob).type) || mime.getType(extension) || 'application/octet-stream';
  const size = options.size ?? (isBlob ? (source as Blob).size : undefined);

  const headers = new Headers(options.headers);

  headers.set('content-type', type);
  headers.set('content-disposition', contentDisposition(options.disposition ?? 'attachment', options.filename));

  if (size !== undefined && Number.isSafeInteger(size) && size >= 0) {
    headers.set('content-length', String(size));
  }

  const body = isBlob ? (source as Blob) : await createStream(source as StreamSource<Uint8Array>);

  // the global Response: it knows how to send a Blob and a stream on every runtime
  return new Response(body, { status: 200, headers });
}
