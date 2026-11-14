import { PayloadTooLargeError } from '../Errors/Http/PayloadTooLargeError';

/**
 * A request body that is read from the socket once and handed to everyone who
 * asks for it afterwards.
 *
 * Whoever reads first decides the form it is kept in: text for a JSON, form or
 * text body, bytes for a multipart one. The other form is derived on demand.
 */
interface SharedBody {
  text?: Promise<string>;
  bytes?: Promise<Uint8Array>;
}

/** Where a request keeps its shared body. */
const SHARED_BODY = Symbol('vercube.sharedBody');

type SharingRequest = Request & { [SHARED_BODY]?: SharedBody };

const encoder = new TextEncoder();

/**
 * Reads a request body as text, once, in a way that leaves it readable.
 *
 * A body is a stream and can be consumed a single time. The handler's
 * `@Body()` used to read a `clone()` of the request so a middleware, a second
 * body argument or a handler holding the raw request could still read it -
 * which makes the runtime materialize a full native request and tee its stream
 * for every request, most of the time for nobody. Reading the original once
 * and serving every later reader from the result costs nothing extra.
 *
 * @param {Request} request - The request to read
 * @param {number | undefined} limit - The maximum body size in bytes
 * @returns {Promise<string>} The body text
 * @throws {PayloadTooLargeError} If the body is larger than the limit
 */
export function readSharedText(request: Request, limit: number | undefined): Promise<string> {
  const shared = (request as SharingRequest)[SHARED_BODY];

  if (shared !== undefined) {
    return (shared.text ??= shared.bytes!.then(decode));
  }

  const text = readText(request, limit);

  share(request, { text });

  return text;
}

/**
 * Reads a request body as bytes, once, in a way that leaves it readable.
 * The binary counterpart of {@link readSharedText}.
 *
 * @param {Request} request - The request to read
 * @param {number | undefined} limit - The maximum body size in bytes
 * @returns {Promise<Uint8Array>} The body bytes
 * @throws {PayloadTooLargeError} If the body is larger than the limit
 */
export function readSharedBytes(request: Request, limit: number | undefined): Promise<Uint8Array> {
  const shared = (request as SharingRequest)[SHARED_BODY];

  if (shared !== undefined) {
    return (shared.bytes ??= shared.text!.then(encode));
  }

  const bytes = readBytes(request, limit);

  share(request, { bytes });

  return bytes;
}

/**
 * Reads a request body to text, enforcing the size limit.
 *
 * A declared `Content-Length` is checked up front, so an oversized body is
 * rejected before a single byte is read. Without one (a chunked body) the
 * stream is read chunk by chunk and abandoned as soon as it crosses the limit.
 *
 * @param {Request} request - The request to read
 * @param {number | undefined} limit - The maximum body size in bytes
 * @returns {Promise<string>} The body text
 * @throws {PayloadTooLargeError} If the body is larger than the limit
 */
export function readText(request: Request, limit: number | undefined): Promise<string> {
  if (limit === undefined) {
    return request.text();
  }

  const length = request.headers.get('content-length');

  if (length !== null) {
    if (Number(length) > limit) {
      return Promise.reject(new PayloadTooLargeError('Request body is too large'));
    }

    return request.text();
  }

  return readLimited(request, limit).then(decodeChunks);
}

/**
 * Reads a request body to bytes, enforcing the size limit like {@link readText}.
 *
 * @param {Request} request - The request to read
 * @param {number | undefined} limit - The maximum body size in bytes
 * @returns {Promise<Uint8Array>} The body bytes
 * @throws {PayloadTooLargeError} If the body is larger than the limit
 */
export function readBytes(request: Request, limit: number | undefined): Promise<Uint8Array> {
  if (limit === undefined) {
    return request.arrayBuffer().then(toBytes);
  }

  const length = request.headers.get('content-length');

  if (length !== null) {
    if (Number(length) > limit) {
      return Promise.reject(new PayloadTooLargeError('Request body is too large'));
    }

    return request.arrayBuffer().then(toBytes);
  }

  return readLimited(request, limit).then(concat);
}

/**
 * Reads a body without a declared length, stopping once it exceeds the limit.
 *
 * @param {Request} request - The request to read
 * @param {number} limit - The maximum body size in bytes
 * @returns {Promise<Uint8Array[]>} The chunks of the body
 * @throws {PayloadTooLargeError} If the body is larger than the limit
 */
async function readLimited(request: Request, limit: number): Promise<Uint8Array[]> {
  const chunks: Uint8Array[] = [];

  if (!request.body) {
    return chunks;
  }

  const reader = request.body.getReader();
  let size = 0;

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    size += value.byteLength;

    if (size > limit) {
      // not awaited: nothing here depends on the stream having let go
      reader.cancel().catch(() => undefined);
      throw new PayloadTooLargeError('Request body is too large');
    }

    chunks.push(value);
  }

  return chunks;
}

/**
 * The text of a shared body.
 *
 * @param {SharingRequest} request - A request whose body is shared
 * @returns {Promise<string>} The body text
 */
function sharedText(request: SharingRequest): Promise<string> {
  const shared = request[SHARED_BODY]!;

  return (shared.text ??= shared.bytes!.then(decode));
}

/**
 * The bytes of a shared body. Every reader gets its own copy, as it would
 * from a clone.
 *
 * @param {SharingRequest} request - A request whose body is shared
 * @returns {Promise<Uint8Array>} The body bytes
 */
function sharedBytes(request: SharingRequest): Promise<Uint8Array> {
  const shared = request[SHARED_BODY]!;

  return (shared.bytes ??= shared.text!.then(encode)).then(copy);
}

/**
 * A stream of a shared body.
 *
 * @param {SharingRequest} request - A request whose body is shared
 * @returns {ReadableStream<Uint8Array>} The body stream
 */
function sharedStream(request: SharingRequest): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(await sharedBytes(request));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

/**
 * The readers a request with a shared body answers with. They are replaced on
 * the request itself, so code that never heard of this module - a middleware
 * calling `request.json()`, a handler reading the raw request - keeps working,
 * any number of times.
 *
 * One static set of descriptors for every request: installing it is a single
 * call that allocates nothing, which matters on a path taken per request.
 */
const SHARED_READERS: PropertyDescriptorMap = {
  text: {
    configurable: true,
    writable: true,
    value(this: SharingRequest): Promise<string> {
      return sharedText(this);
    },
  },
  json: {
    configurable: true,
    writable: true,
    value(this: SharingRequest): Promise<unknown> {
      return sharedText(this).then(JSON.parse);
    },
  },
  bytes: {
    configurable: true,
    writable: true,
    value(this: SharingRequest): Promise<Uint8Array> {
      return sharedBytes(this);
    },
  },
  arrayBuffer: {
    configurable: true,
    writable: true,
    value(this: SharingRequest): Promise<ArrayBufferLike> {
      return sharedBytes(this).then((bytes) => bytes.buffer);
    },
  },
  blob: {
    configurable: true,
    writable: true,
    value(this: SharingRequest): Promise<Blob> {
      const type = this.headers.get('content-type') ?? '';

      return sharedBytes(this).then((bytes) => new Blob([bytes as BlobPart], { type }));
    },
  },
  formData: {
    configurable: true,
    writable: true,
    value(this: SharingRequest): Promise<FormData> {
      const headers = { 'content-type': this.headers.get('content-type') ?? '' };

      return new Response(sharedStream(this), { headers }).formData();
    },
  },
  clone: {
    configurable: true,
    writable: true,
    value(this: SharingRequest): Request {
      return new Request(this.url, {
        method: this.method,
        headers: this.headers,
        body: sharedStream(this),
        duplex: 'half',
      } as RequestInit);
    },
  },
  body: {
    configurable: true,
    get(this: SharingRequest): ReadableStream<Uint8Array> {
      return sharedStream(this);
    },
  },
  bodyUsed: {
    configurable: true,
    get(): boolean {
      return false;
    },
  },
};

/**
 * Makes a request serve its body from what was read once.
 *
 * @param {Request} request - The request whose body is being read
 * @param {SharedBody} shared - The body, in the form it is being read in
 * @returns {void}
 */
function share(request: Request, shared: SharedBody): void {
  try {
    (request as SharingRequest)[SHARED_BODY] = shared;
    Object.defineProperties(request, SHARED_READERS);
  } catch {
    // A request that cannot be extended still answers its first reader; a
    // second one is told the body was used, as the platform would.
  }
}

/**
 * Decodes bytes as UTF-8.
 *
 * @param {Uint8Array} bytes - The bytes
 * @returns {string} The text
 */
function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * Decodes the chunks of a body as UTF-8.
 *
 * @param {Uint8Array[]} chunks - The chunks, in order
 * @returns {string} The text
 */
function decodeChunks(chunks: Uint8Array[]): string {
  const decoder = new TextDecoder();
  let text = '';

  for (const chunk of chunks) {
    text += decoder.decode(chunk, { stream: true });
  }

  return text + decoder.decode();
}

/**
 * Encodes text as UTF-8.
 *
 * @param {string} text - The text
 * @returns {Uint8Array} The bytes
 */
function encode(text: string): Uint8Array {
  return encoder.encode(text);
}

/**
 * Copies bytes, so a reader that changes them does not change them for the next one.
 *
 * @param {Uint8Array} bytes - The bytes
 * @returns {Uint8Array} A copy
 */
function copy(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

/**
 * Wraps a buffer in a byte view.
 *
 * @param {ArrayBuffer} buffer - The buffer
 * @returns {Uint8Array} The bytes
 */
function toBytes(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer);
}

/**
 * Joins the chunks of a body.
 *
 * @param {Uint8Array[]} chunks - The chunks, in order
 * @returns {Uint8Array} The bytes
 */
function concat(chunks: Uint8Array[]): Uint8Array {
  if (chunks.length === 1) {
    return chunks[0];
  }

  let size = 0;

  for (const chunk of chunks) {
    size += chunk.byteLength;
  }

  const bytes = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}
