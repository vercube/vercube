import { FastResponse } from '../../Types/CommonTypes';
import { mergeVary } from '../../Utils/Headers';
import { isStreamResponse } from '../../Utils/Stream';
import type { ConfigTypes } from '../../Types/ConfigTypes';
import type { RouterTypes } from '../../Types/RouterTypes';

type Encoding = ConfigTypes.CompressionEncoding;

/** What `node:zlib` has to offer for this module, typed loosely as not every runtime ships all of it. */
type Zlib = typeof import('node:zlib');

/** A `node:zlib` compressor, as far as this module drives it. */
interface Encoder {
  write(chunk: Uint8Array): boolean;
  flush(kind: number, callback: () => void): void;
  end(): void;
  destroy(): void;
  on(event: 'data', listener: (chunk: Uint8Array) => void): this;
  once(event: 'end' | 'close', listener: () => void): this;
  once(event: 'error', listener: (error: unknown) => void): this;
}

/** Body size, in bytes, under which compressing is not worth the CPU. */
const DEFAULT_THRESHOLD = 1024;

/** Encodings offered when none are configured, most preferred first. */
const DEFAULT_ENCODINGS: readonly Encoding[] = ['br', 'gzip', 'deflate'];

/**
 * Levels used when none are configured. Brotli at 4 compresses about as fast
 * as gzip at 6 and comes out smaller; its own default of 11 is meant for files
 * compressed once, not for responses.
 */
const DEFAULT_LEVELS: Readonly<Record<Encoding, number>> = { br: 4, gzip: 6, deflate: 6, zstd: 3 };

/** The range of levels each encoding accepts. */
const LEVEL_RANGE: Readonly<Record<Encoding, readonly [number, number]>> = {
  br: [0, 11],
  gzip: [0, 9],
  deflate: [0, 9],
  zstd: [1, 22],
};

/** How many distinct `Accept-Encoding` values are remembered. Browsers send a handful. */
const NEGOTIATION_CACHE_SIZE = 128;

/**
 * Content types worth compressing: text, and the structured formats that are
 * text underneath. Images, video, audio, archives and fonts in `woff` are
 * compressed already.
 */
const COMPRESSIBLE =
  /^(?:text\/|application\/(?:json|javascript|xml|x-ndjson|ndjson|graphql|wasm|x-www-form-urlencoded|x-javascript|ecmascript|rtf|x-font-ttf|vnd\.ms-fontobject|x-yaml|yaml|toml)\b|image\/(?:svg\+xml|bmp|x-icon|vnd\.microsoft\.icon)|font\/(?:ttf|otf)|[a-z]+\/[\w.-]+\+(?:json|xml|text|yaml)\b)/i;

/** What a client that sent no usable `Accept-Encoding` accepts. */
const NONE: readonly Encoding[] = Object.freeze([]);

/** Statuses whose response has no body to compress, or only a part of one. */
const SKIPPED_STATUSES: ReadonlySet<number> = new Set([204, 205, 206, 304]);

/**
 * Compresses responses on their way out: negotiates an encoding with
 * `Accept-Encoding`, leaves alone what must not or need not be compressed, and
 * replaces the body of everything else.
 *
 * Built only when `compression` is on. `HttpServer` holds `null` otherwise, so
 * an application without compression pays one comparison per request.
 */
export class ResponseCompressor {
  /** Encodings to offer, most preferred first, already limited to what the runtime can do. */
  private readonly fEncodings: readonly Encoding[];

  /** Bodies under this many bytes are sent as they are. */
  private readonly fThreshold: number;

  /** Whether streams are compressed when a route does not say. */
  private readonly fStreams: boolean;

  /** Whether static files are served from their precompressed siblings. */
  private readonly fPrecompressed: boolean;

  /** The level per encoding. */
  private readonly fLevels: Readonly<Record<Encoding, number>>;

  /** `node:zlib`, loaded when the compressor was created. */
  private readonly fZlib: Zlib;

  /** The encodings accepted by an `Accept-Encoding` value seen before. */
  private readonly fNegotiated: Map<string, readonly Encoding[]> = new Map();

  private constructor(zlib: Zlib, options: ConfigTypes.CompressionOptions) {
    const available = (options.encodings ?? DEFAULT_ENCODINGS).filter((encoding) => isSupported(zlib, encoding));

    this.fZlib = zlib;
    this.fEncodings = [...new Set(available)];
    this.fThreshold = Math.max(0, options.threshold ?? DEFAULT_THRESHOLD);
    this.fStreams = options.streams === true;
    this.fPrecompressed = options.precompressed !== false;
    this.fLevels = resolveLevels(options.level);
  }

  /**
   * Builds a compressor for the `compression` setting of an application.
   *
   * `node:zlib` is imported here and not at the top of the module, so an
   * application that does not compress never loads it.
   *
   * @param {boolean | ConfigTypes.CompressionOptions | undefined} setting - The `compression` setting
   * @returns {Promise<ResponseCompressor | null>} The compressor, or null when compression is off or the runtime has no encoder for any configured encoding
   */
  public static async create(setting: boolean | ConfigTypes.CompressionOptions | undefined): Promise<ResponseCompressor | null> {
    if (!setting) {
      return null;
    }

    let zlib: Zlib;

    try {
      zlib = await import('node:zlib');
    } catch {
      return null;
    }

    const compressor = new ResponseCompressor(zlib, setting === true ? {} : setting);

    return compressor.fEncodings.length > 0 ? compressor : null;
  }

  /** Whether static files are served from their precompressed siblings. */
  public get precompressed(): boolean {
    return this.fPrecompressed;
  }

  /** The encodings this compressor offers, most preferred first. */
  public get encodings(): readonly Encoding[] {
    return this.fEncodings;
  }

  /**
   * Compresses the response of a request once it is known.
   *
   * @param {Request} request - The request being answered
   * @param {Response | Promise<Response>} response - The response, or the promise of one
   * @param {RouterTypes.RouteCompression} [route] - What the route asked for with `@Compression()`
   * @returns {Response | Promise<Response>} The response to send
   */
  public apply(
    request: Request,
    response: Response | Promise<Response>,
    route?: RouterTypes.RouteCompression,
  ): Response | Promise<Response> {
    if (response instanceof Response) {
      return this.compress(request, response, route);
    }

    return response.then((resolved) => this.compress(request, resolved, route));
  }

  /**
   * Compresses one response, or returns it untouched when it must not be
   * compressed.
   *
   * @param {Request} request - The request being answered
   * @param {Response} response - The response the application produced
   * @param {RouterTypes.RouteCompression} [route] - What the route asked for with `@Compression()`
   * @returns {Response | Promise<Response>} The response to send
   */
  public compress(request: Request, response: Response, route?: RouterTypes.RouteCompression): Response | Promise<Response> {
    const status = response.status;

    if (status < 200 || SKIPPED_STATUSES.has(status) || request.method === 'HEAD') {
      return response;
    }

    const headers = response.headers;

    // Already encoded, a part of a body, or marked as not to be transformed
    if (
      headers.has('content-encoding') ||
      headers.has('content-range') ||
      !COMPRESSIBLE.test(headers.get('content-type') ?? '') ||
      /\bno-transform\b/i.test(headers.get('cache-control') ?? '')
    ) {
      return response;
    }

    const body = response.body;

    if (body === null) {
      return response;
    }

    // From here on the answer depends on `Accept-Encoding`, compressed or not,
    // and a cache has to know.
    const encoding = this.negotiate(request.headers.get('accept-encoding'));

    if (encoding === null) {
      return withVary(response);
    }

    // A stream is sent as it is produced. Compressing it is a choice, because
    // an encoder that waits for more input would hold events back, so every
    // chunk is flushed and the stream compresses a little worse for it.
    if (isStreamResponse(response)) {
      if (!(route?.streams ?? this.fStreams)) {
        return withVary(response);
      }

      return this.respond(response, encoding, this.encode(encoding, body.getReader()));
    }

    const length = headers.get('content-length');

    if (length !== null) {
      if (Number(length) < this.fThreshold) {
        return withVary(response);
      }

      return this.respond(response, encoding, this.encode(encoding, body.getReader()));
    }

    return this.measure(response, body, encoding);
  }

  /**
   * Chooses the encoding for an `Accept-Encoding` header: the one the client
   * weighs highest among those configured, and the configured order between
   * equals.
   *
   * @param {string | null} header - The `Accept-Encoding` header
   * @returns {Encoding | null} The encoding, or null when the client accepts none of them
   */
  public negotiate(header: string | null): Encoding | null {
    return this.accepted(header)[0] ?? null;
  }

  /**
   * Lists the configured encodings a client accepts, the one it weighs highest
   * first and the configured order between equals.
   *
   * @param {string | null} header - The `Accept-Encoding` header
   * @returns {readonly Encoding[]} The encodings, empty when the client accepts none of them
   */
  public accepted(header: string | null): readonly Encoding[] {
    if (!header) {
      return NONE;
    }

    const known = this.fNegotiated.get(header);

    if (known !== undefined) {
      return known;
    }

    const weights = new Map<string, number>();

    for (const part of header.split(',')) {
      const [name, ...params] = part.split(';');
      const token = name.trim().toLowerCase();

      if (!token) {
        continue;
      }

      let weight = 1;

      for (const param of params) {
        const [key, value] = param.split('=');

        if (key.trim().toLowerCase() === 'q') {
          const parsed = Number.parseFloat(value);

          weight = Number.isNaN(parsed) ? 0 : Math.min(1, Math.max(0, parsed));
        }
      }

      weights.set(token === 'x-gzip' ? 'gzip' : token, weight);
    }

    const fallback = weights.get('*') ?? 0;
    const weighed = this.fEncodings
      .map((encoding) => ({ encoding, weight: weights.get(encoding) ?? fallback }))
      .filter((entry) => entry.weight > 0);

    // stable, so the configured order survives between equal weights
    weighed.sort((a, b) => b.weight - a.weight);

    const accepted = weighed.map((entry) => entry.encoding);

    if (this.fNegotiated.size >= NEGOTIATION_CACHE_SIZE) {
      this.fNegotiated.clear();
    }

    this.fNegotiated.set(header, accepted);

    return accepted;
  }

  /**
   * Decides for a body of unknown size. A response built from a string or a
   * buffer carries no `Content-Length` header, so the body is read until it
   * ends or reaches the threshold: one that ends first is sent as it is, one
   * that gets there is compressed from then on as it arrives.
   *
   * @param {Response} response - The response the application produced
   * @param {ReadableStream<Uint8Array>} body - Its body
   * @param {Encoding} encoding - The negotiated encoding
   * @returns {Promise<Response>} The response to send
   */
  private async measure(response: Response, body: ReadableStream<Uint8Array>, encoding: Encoding): Promise<Response> {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;

    while (size < this.fThreshold) {
      const result = await reader.read();

      if (result.done) {
        return new FastResponse(concat(chunks, size) as BodyInit, {
          status: response.status,
          statusText: response.statusText,
          headers: varyHeaders(new Headers(response.headers)),
        });
      }

      chunks.push(result.value);
      size += result.value.byteLength;
    }

    return this.respond(response, encoding, this.encode(encoding, reader, size > 0 ? concat(chunks, size) : undefined));
  }

  /**
   * Builds the compressed response: the headers of the original with the
   * encoding declared, the length dropped, and a strong `ETag` weakened, as the
   * bytes it named are not the bytes being sent.
   *
   * @param {Response} response - The response the application produced
   * @param {Encoding} encoding - The encoding of `body`
   * @param {ReadableStream<Uint8Array>} body - The compressed body
   * @returns {Response} The response to send
   */
  private respond(response: Response, encoding: Encoding, body: ReadableStream<Uint8Array>): Response {
    const headers = varyHeaders(new Headers(response.headers));

    headers.set('content-encoding', encoding);
    // the compressed size is not known until the last byte is written
    headers.delete('content-length');

    const etag = headers.get('etag');

    if (etag && !etag.startsWith('W/')) {
      headers.set('etag', `W/${etag}`);
    }

    return new FastResponse(body, { status: response.status, statusText: response.statusText, headers });
  }

  /**
   * Compresses a body as it is read. Each chunk read from the source is
   * written to the encoder and flushed, so what the source produced reaches
   * the client without waiting for more, and the source is only read when the
   * client is ready for more.
   *
   * A client that goes away cancels the source, so a generator behind it runs
   * its `finally` blocks, and a source that fails fails the response.
   *
   * @param {Encoding} encoding - The encoding
   * @param {ReadableStreamDefaultReader<Uint8Array>} reader - The source
   * @param {Uint8Array} [head] - Bytes already read from the source
   * @returns {ReadableStream<Uint8Array>} The compressed body
   */
  private encode(
    encoding: Encoding,
    reader: ReadableStreamDefaultReader<Uint8Array>,
    head?: Uint8Array,
  ): ReadableStream<Uint8Array> {
    const [encoder, flushKind] = this.createEncoder(encoding);
    let pending = head;
    let produced = false;
    let closed = false;

    return new ReadableStream<Uint8Array>({
      start(controller): void {
        encoder.on('data', (chunk) => {
          if (!closed) {
            produced = true;
            controller.enqueue(chunk);
          }
        });

        encoder.once('end', () => {
          if (!closed) {
            closed = true;
            controller.close();
          }
        });

        encoder.once('error', (error) => {
          if (!closed) {
            closed = true;
            controller.error(error);
            reader.cancel(error).catch(() => {});
          }
        });
      },

      async pull(controller): Promise<void> {
        produced = false;

        // a pull that enqueued nothing is not repeated by the stream itself
        while (!produced && !closed) {
          let chunk: Uint8Array;

          if (pending === undefined) {
            let result: Awaited<ReturnType<typeof reader.read>>;

            try {
              result = await reader.read();
            } catch (error) {
              if (!closed) {
                closed = true;
                encoder.destroy();
                controller.error(error);
              }

              return;
            }

            if (closed) {
              return;
            }

            if (result.done) {
              await new Promise<void>((resolve) => {
                encoder.once('close', resolve);
                encoder.end();
              });

              return;
            }

            chunk = result.value;
          } else {
            chunk = pending;
            pending = undefined;
          }

          await new Promise<void>((resolve) => {
            // a destroyed encoder never calls back
            encoder.once('close', resolve);
            encoder.write(chunk);
            encoder.flush(flushKind, resolve);
          });
        }
      },

      cancel(reason): Promise<void> {
        closed = true;
        encoder.destroy();

        return reader.cancel(reason);
      },
    });
  }

  /**
   * Creates the streaming encoder of an encoding, with the flush that emits
   * everything written so far without ending the stream.
   *
   * @param {Encoding} encoding - The encoding
   * @returns {[Encoder, number]} The encoder and its flush kind
   */
  private createEncoder(encoding: Encoding): [Encoder, number] {
    const zlib = this.fZlib;
    const constants = zlib.constants;
    const level = this.fLevels[encoding];

    switch (encoding) {
      case 'br': {
        return [
          zlib.createBrotliCompress({ params: { [constants.BROTLI_PARAM_QUALITY]: level } }) as unknown as Encoder,
          constants.BROTLI_OPERATION_FLUSH,
        ];
      }
      case 'gzip': {
        return [zlib.createGzip({ level }) as unknown as Encoder, constants.Z_SYNC_FLUSH];
      }
      case 'deflate': {
        return [zlib.createDeflate({ level }) as unknown as Encoder, constants.Z_SYNC_FLUSH];
      }
      case 'zstd': {
        return [
          zlib.createZstdCompress({ params: { [constants.ZSTD_c_compressionLevel]: level } }) as unknown as Encoder,
          constants.ZSTD_e_flush,
        ];
      }
    }
  }
}

/**
 * Whether the runtime's `node:zlib` can produce an encoding. Brotli and
 * Zstandard arrived later than gzip, and not in every runtime at once.
 *
 * @param {Zlib} zlib - The runtime's `node:zlib`
 * @param {string} encoding - The encoding, as configured
 * @returns {boolean} True when it can be offered
 */
function isSupported(zlib: Zlib, encoding: string): encoding is Encoding {
  switch (encoding) {
    case 'br': {
      return typeof zlib.createBrotliCompress === 'function';
    }
    case 'gzip': {
      return typeof zlib.createGzip === 'function';
    }
    case 'deflate': {
      return typeof zlib.createDeflate === 'function';
    }
    case 'zstd': {
      return typeof zlib.createZstdCompress === 'function';
    }
    default: {
      return false;
    }
  }
}

/**
 * Works out the level of every encoding: the configured one, kept inside the
 * range the encoding accepts, or the default.
 *
 * @param {ConfigTypes.CompressionOptions['level']} level - One level for all encodings, or one per encoding
 * @returns {Record<Encoding, number>} The level per encoding
 */
function resolveLevels(level: ConfigTypes.CompressionOptions['level']): Record<Encoding, number> {
  const levels = { ...DEFAULT_LEVELS };

  for (const encoding of Object.keys(levels) as Encoding[]) {
    const wanted = typeof level === 'number' ? level : level?.[encoding];

    if (typeof wanted === 'number' && Number.isFinite(wanted)) {
      const [min, max] = LEVEL_RANGE[encoding];

      levels[encoding] = Math.min(max, Math.max(min, Math.round(wanted)));
    }
  }

  return levels;
}

/**
 * Adds `Accept-Encoding` to the `Vary` of a set of headers.
 *
 * @param {Headers} headers - The headers to change
 * @returns {Headers} The same headers
 */
function varyHeaders(headers: Headers): Headers {
  headers.set('vary', mergeVary(headers.get('vary') ?? '', 'Accept-Encoding'));

  return headers;
}

/**
 * Adds `Vary: Accept-Encoding` to a response that is sent uncompressed but
 * could have been compressed for another client.
 *
 * @param {Response} response - The response
 * @returns {Response} The response, rebuilt when its headers cannot be changed
 */
function withVary(response: Response): Response {
  try {
    varyHeaders(response.headers);

    return response;
  } catch {
    // the headers of a response that came from `fetch()` are immutable
    return new FastResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: varyHeaders(new Headers(response.headers)),
    });
  }
}

/**
 * Joins chunks into one array.
 *
 * @param {Uint8Array[]} chunks - The chunks
 * @param {number} size - Their total size
 * @returns {Uint8Array} One array holding all of them
 */
function concat(chunks: Uint8Array[], size: number): Uint8Array {
  if (chunks.length === 1) {
    return chunks[0];
  }

  const joined = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return joined;
}
