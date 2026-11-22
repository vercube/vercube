import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliCompressSync, brotliDecompressSync, gunzipSync, gzipSync, inflateSync, zstdDecompressSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  Compression,
  Controller,
  createApp,
  Get,
  Head,
  HttpServer,
  SetHeader,
  Sse,
  Status,
  Stream,
  streamFile,
  type App,
  type ConfigTypes,
} from '../../src';
import { ResponseCompressor } from '../../src/Services/Compression/ResponseCompressor';

const LARGE = 'vercube compresses this line. '.repeat(200);
const SMALL = 'tiny';

const state = { closed: 0 };

function decode(encoding: string | null, body: Uint8Array): string {
  const buffer = Buffer.from(body);

  switch (encoding) {
    case 'br': {
      return brotliDecompressSync(buffer).toString();
    }
    case 'gzip': {
      return gunzipSync(buffer).toString();
    }
    case 'deflate': {
      return inflateSync(buffer).toString();
    }
    case 'zstd': {
      return zstdDecompressSync(buffer).toString();
    }
    default: {
      return buffer.toString();
    }
  }
}

@Controller('/c')
class CompressionController {
  @Get('/large')
  public large(): { text: string } {
    return { text: LARGE };
  }

  @Get('/small')
  public small(): { text: string } {
    return { text: SMALL };
  }

  @Get('/async')
  public async async(): Promise<{ text: string }> {
    return { text: LARGE };
  }

  @Get('/empty')
  public empty(): void {}

  @Get('/no-content')
  @Status(204)
  public noContent(): void {}

  @Head('/large')
  public head(): Response {
    return new Response(null, { headers: { 'content-type': 'application/json' } });
  }

  @Get('/off')
  @Compression(false)
  public off(): { text: string } {
    return { text: LARGE };
  }

  @Get('/etag')
  @SetHeader('ETag', '"abc"')
  @SetHeader('Vary', 'Origin')
  public etag(): { text: string } {
    return { text: LARGE };
  }

  @Get('/weak-etag')
  @SetHeader('ETag', 'W/"abc"')
  public weakEtag(): { text: string } {
    return { text: LARGE };
  }

  @Get('/no-transform')
  @SetHeader('Cache-Control', 'public, no-transform')
  public noTransform(): { text: string } {
    return { text: LARGE };
  }

  @Get('/encoded')
  public encoded(): Response {
    return new Response(gzipSync(LARGE), { headers: { 'content-type': 'text/plain', 'content-encoding': 'gzip' } });
  }

  @Get('/image')
  public image(): Response {
    return new Response(new Uint8Array(4096), { headers: { 'content-type': 'image/png' } });
  }

  @Get('/untyped')
  public untyped(): Response {
    return new Response(new Uint8Array(4096));
  }

  @Get('/partial')
  public partial(): Response {
    return new Response(LARGE, {
      status: 206,
      headers: { 'content-type': 'text/plain', 'content-range': 'bytes 0-5999/6000' },
    });
  }

  @Get('/text')
  public text(): Response {
    return new Response(LARGE, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }

  @Get('/known-small')
  public knownSmall(): Response {
    return new Response(SMALL, { headers: { 'content-type': 'text/plain', 'content-length': String(SMALL.length) } });
  }

  @Get('/known-large')
  public knownLarge(): Response {
    return new Response(LARGE, { headers: { 'content-type': 'text/plain', 'content-length': String(LARGE.length) } });
  }

  @Get('/chunked')
  public chunked(): Response {
    const encoder = new TextEncoder();
    const parts = [LARGE.slice(0, 400), LARGE.slice(400, 900), LARGE.slice(900)];

    return new Response(
      new ReadableStream<Uint8Array>({
        pull(controller): void {
          const part = parts.shift();

          if (part === undefined) {
            controller.close();
          } else {
            controller.enqueue(encoder.encode(part));
          }
        },
      }),
      { headers: { 'content-type': 'text/plain' } },
    );
  }

  @Get('/chunked-small')
  public chunkedSmall(): Response {
    const encoder = new TextEncoder();
    const parts = ['a', 'b', 'c'];

    return new Response(
      new ReadableStream<Uint8Array>({
        pull(controller): void {
          const part = parts.shift();

          if (part === undefined) {
            controller.close();
          } else {
            controller.enqueue(encoder.encode(part));
          }
        },
      }),
      { headers: { 'content-type': 'text/plain', 'x-kept': 'yes' } },
    );
  }

  @Get('/file')
  public file(): Promise<Response> {
    return streamFile(new Blob([LARGE], { type: 'text/csv' }), { filename: 'report.csv' });
  }

  @Get('/stream')
  @Stream({ type: 'text/plain' })
  public async *stream(): AsyncGenerator<string> {
    yield LARGE;
    yield LARGE;
  }

  @Get('/stream-on')
  @Stream({ type: 'application/x-ndjson' })
  @Compression({ streams: true })
  public async *streamOn(): AsyncGenerator<{ line: number }> {
    yield { line: 1 };
    yield { line: 2 };
  }

  @Get('/stream-off')
  @Stream({ type: 'text/plain' })
  @Compression({ streams: false })
  public async *streamOff(): AsyncGenerator<string> {
    yield LARGE;
  }

  @Get('/raw-stream')
  @SetHeader('Content-Type', 'text/plain')
  public rawStream(): ReadableStream<Uint8Array> {
    return new Blob([LARGE]).stream();
  }

  @Sse('/sse')
  @Compression({ streams: true })
  public async *sse(): AsyncGenerator<{ data: string }> {
    yield { data: 'one' };
    yield { data: 'two' };
  }

  @Sse('/sse-plain')
  public async *ssePlain(): AsyncGenerator<{ data: string }> {
    yield { data: 'one' };
  }

  @Get('/endless')
  @Stream({ type: 'text/plain' })
  @Compression({ streams: true })
  public async *endless(): AsyncGenerator<string> {
    try {
      for (let index = 0; ; index++) {
        yield `tick ${index}\n`;
      }
    } finally {
      state.closed++;
    }
  }

  @Get('/breaks')
  @Stream({ type: 'text/plain', onError: () => {} })
  @Compression({ streams: true })
  public async *breaks(): AsyncGenerator<string> {
    yield 'one';
    throw new Error('backend went away');
  }
}

async function createCompressionApp(compression: ConfigTypes.Config['compression'] = true): Promise<App> {
  return createApp({
    cfg: { requestLogging: false, logLevel: 'error', compression, server: { static: { dirs: [] } } },
    configFile: false,
    setup: (app) => app.container.bind(CompressionController),
  });
}

function request(path: string, accept: string | null = 'gzip', init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);

  if (accept !== null) {
    headers.set('accept-encoding', accept);
  }

  return new Request(`http://localhost${path}`, { ...init, headers });
}

async function read(response: Response): Promise<string> {
  return decode(response.headers.get('content-encoding'), new Uint8Array(await response.arrayBuffer()));
}

describe('response compression', () => {
  let app: App;

  beforeAll(async () => {
    app = await createCompressionApp();
  });

  describe('when it is off', () => {
    it('sends responses as they are and adds no header', async () => {
      const plain = await createCompressionApp(false);
      const response = await plain.fetch(request('/c/large', 'br, gzip'));

      expect(response.headers.get('content-encoding')).toBeNull();
      expect(response.headers.get('vary')).toBeNull();
      expect(await response.json()).toEqual({ text: LARGE });
      expect(plain.container.get(HttpServer).compressionEncodings).toEqual([]);
    });

    it('is the default', async () => {
      const plain = await createApp({
        cfg: { requestLogging: false, logLevel: 'error' },
        configFile: false,
        setup: (target) => target.container.bind(CompressionController),
      });
      const response = await plain.fetch(request('/c/large', 'br, gzip'));

      expect(response.headers.get('content-encoding')).toBeNull();
    });

    it('keeps answering a synchronous route synchronously', async () => {
      const plain = await createCompressionApp(false);

      expect(plain.container.get(HttpServer).handleRequest(request('/c/large'))).toBeInstanceOf(Response);
    });
  });

  describe('encodings', () => {
    it.each(['br', 'gzip', 'deflate', 'zstd'] as const)('compresses a JSON response with %s', async (encoding) => {
      const target = await createCompressionApp({ encodings: [encoding] });
      const response = await target.fetch(request('/c/large', encoding));

      expect(response.status).toBe(200);
      expect(response.headers.get('content-encoding')).toBe(encoding);
      expect(response.headers.get('content-type')).toContain('application/json');
      expect(response.headers.get('vary')).toBe('Accept-Encoding');

      const body = new Uint8Array(await response.arrayBuffer());

      expect(body.byteLength).toBeLessThan(LARGE.length / 4);
      expect(JSON.parse(decode(encoding, body))).toEqual({ text: LARGE });
    });

    it('offers Brotli, gzip and deflate by default', () => {
      expect(app.container.get(HttpServer).compressionEncodings).toEqual(['br', 'gzip', 'deflate']);
    });

    it('leaves out an encoding it does not know and stays off when none is left', async () => {
      const partial = await createCompressionApp({ encodings: ['lz4' as never, 'gzip', 'gzip'] });
      const none = await createCompressionApp({ encodings: ['lz4' as never] });

      expect(partial.container.get(HttpServer).compressionEncodings).toEqual(['gzip']);
      expect(none.container.get(HttpServer).compressionEncodings).toEqual([]);
      expect((await none.fetch(request('/c/large'))).headers.get('content-encoding')).toBeNull();
    });

    it('compresses the response of an async handler', async () => {
      const response = await app.fetch(request('/c/async'));

      expect(response.headers.get('content-encoding')).toBe('gzip');
      expect(JSON.parse(await read(response))).toEqual({ text: LARGE });
    });

    it('applies the configured level', async () => {
      const fast = await createCompressionApp({ level: 1 });
      const tight = await createCompressionApp({ level: { gzip: 9 } });
      const size = async (target: App): Promise<number> =>
        (await (await target.fetch(request('/c/text', 'gzip'))).arrayBuffer()).byteLength;
      const noisy = Array.from({ length: 4000 }, (_, index) => `${index * 7919}`).join(',');

      // repeated text compresses the same at every level, so compare the encoder itself
      const compressor = (await ResponseCompressor.create({ level: 1 }))!;
      const best = (await ResponseCompressor.create({ level: 9 }))!;
      const measure = async (target: ResponseCompressor): Promise<number> => {
        const response = await target.compress(
          request('/', 'gzip'),
          new Response(noisy, { headers: { 'content-type': 'text/plain' } }),
        );

        return (await response.arrayBuffer()).byteLength;
      };

      expect(await measure(best)).toBeLessThan(await measure(compressor));
      expect(await size(fast)).toBeGreaterThan(0);
      expect(await size(tight)).toBeGreaterThan(0);
    });
  });

  describe('negotiation', () => {
    it.each([
      ['gzip', 'gzip'],
      ['br', 'br'],
      ['gzip, br', 'br'],
      ['gzip, deflate, br, zstd', 'br'],
      ['gzip;q=1.0, br;q=0.5', 'gzip'],
      ['br;q=0, gzip', 'gzip'],
      ['deflate', 'deflate'],
      ['x-gzip', 'gzip'],
      ['GZIP', 'gzip'],
      ['*', 'br'],
      ['*;q=0.5, gzip;q=0.9', 'gzip'],
      ['br;q=0, *', 'gzip'],
      ['identity', null],
      ['gzip;q=0', null],
      ['*;q=0', null],
      ['zstd', null],
      ['', null],
      ['gzip;q=abc', null],
      [' gzip ; q=0.8 , br ; q=0.9 ', 'br'],
    ])('answers "%s" with %s', async (accept, expected) => {
      const response = await app.fetch(request('/c/large', accept));

      expect(response.headers.get('content-encoding')).toBe(expected);
      expect(JSON.parse(await read(response))).toEqual({ text: LARGE });
    });

    it('sends the response as it is without Accept-Encoding, and still varies on it', async () => {
      const response = await app.fetch(request('/c/large', null));

      expect(response.headers.get('content-encoding')).toBeNull();
      expect(response.headers.get('vary')).toBe('Accept-Encoding');
      expect(await response.json()).toEqual({ text: LARGE });
    });

    it('follows the configured order between encodings the client weighs the same', async () => {
      const target = await createCompressionApp({ encodings: ['gzip', 'br'] });

      expect((await target.fetch(request('/c/large', 'br, gzip'))).headers.get('content-encoding')).toBe('gzip');
    });

    it('forgets remembered headers once there are too many', async () => {
      const compressor = (await ResponseCompressor.create(true))!;

      for (let index = 0; index < 300; index++) {
        expect(compressor.negotiate(`gzip;q=0.${index}1`)).toBe('gzip');
      }

      expect(compressor.negotiate('br')).toBe('br');
    });
  });

  describe('what is left alone', () => {
    it.each([
      ['a body under the threshold', '/c/small'],
      ['a body under the threshold with a declared length', '/c/known-small'],
      ['a short body that arrives in pieces', '/c/chunked-small'],
    ])('%s, which still varies', async (_name, path) => {
      const response = await app.fetch(request(path));

      expect(response.headers.get('content-encoding')).toBeNull();
      expect(response.headers.get('vary')).toBe('Accept-Encoding');
      expect((await response.text()).length).toBeGreaterThan(0);
    });

    it('keeps the status and headers of a short body it had to read', async () => {
      const response = await app.fetch(request('/c/chunked-small'));

      expect(response.status).toBe(200);
      expect(response.headers.get('x-kept')).toBe('yes');
      expect(await response.text()).toBe('abc');
    });

    it.each([
      ['a response that is already encoded', '/c/encoded', 'gzip'],
      ['an image', '/c/image', null],
      ['a response without a content type', '/c/untyped', null],
      ['a partial response', '/c/partial', null],
      ['a response marked no-transform', '/c/no-transform', null],
      ['a route with @Compression(false)', '/c/off', null],
      ['an empty response', '/c/empty', null],
      ['a 204', '/c/no-content', null],
    ])('%s', async (_name, path, encoding) => {
      const response = await app.fetch(request(path));

      expect(response.headers.get('content-encoding')).toBe(encoding);
      expect(response.headers.get('vary')).toBeNull();
    });

    it('a HEAD request', async () => {
      const response = await app.fetch(request('/c/large', 'gzip', { method: 'HEAD' }));

      expect(response.headers.get('content-encoding')).toBeNull();
    });

    it('a 304', async () => {
      const compressor = (await ResponseCompressor.create(true))!;
      const response = new Response(null, { status: 304, headers: { 'content-type': 'text/plain' } });

      expect(compressor.compress(request('/'), response)).toBe(response);
    });

    it('a 404 with a short body, and an error is compressed like any response when it is long', async () => {
      const response = await app.fetch(request('/c/missing'));

      expect(response.status).toBe(404);
      expect(response.headers.get('content-encoding')).toBeNull();
      expect((await response.json()).status).toBe(404);
    });

    it('rebuilds a response whose headers cannot be changed', async () => {
      const compressor = (await ResponseCompressor.create(true))!;
      const frozen = new Response(LARGE, { headers: { 'content-type': 'text/plain' } });

      vi.spyOn(frozen.headers, 'set').mockImplementation(() => {
        throw new TypeError('immutable');
      });

      const response = await compressor.compress(request('/', null), frozen);

      expect(response).not.toBe(frozen);
      expect(response.headers.get('vary')).toBe('Accept-Encoding');
      expect(await response.text()).toBe(LARGE);
    });
  });

  describe('headers', () => {
    it('weakens a strong ETag and merges Vary', async () => {
      const response = await app.fetch(request('/c/etag'));

      expect(response.headers.get('content-encoding')).toBe('gzip');
      expect(response.headers.get('etag')).toBe('W/"abc"');
      expect(response.headers.get('vary')).toBe('Origin, Accept-Encoding');
    });

    it('keeps a weak ETag', async () => {
      const response = await app.fetch(request('/c/weak-etag'));

      expect(response.headers.get('etag')).toBe('W/"abc"');
    });

    it('keeps a strong ETag on a response it does not compress', async () => {
      const response = await app.fetch(request('/c/etag', null));

      expect(response.headers.get('etag')).toBe('"abc"');
      expect(response.headers.get('vary')).toBe('Origin, Accept-Encoding');
    });

    it('replaces a declared length', async () => {
      const response = await app.fetch(request('/c/known-large'));
      const length = response.headers.get('content-length');
      const body = new Uint8Array(await response.arrayBuffer());

      expect(response.headers.get('content-encoding')).toBe('gzip');
      expect(length === null || Number(length) === body.byteLength).toBe(true);
      expect(decode('gzip', body)).toBe(LARGE);
    });

    it('keeps the status and the content type', async () => {
      const response = await app.fetch(request('/c/text', 'br'));

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
      expect(await read(response)).toBe(LARGE);
    });
  });

  describe('threshold', () => {
    it('compresses everything at zero', async () => {
      const target = await createCompressionApp({ threshold: 0 });
      const response = await target.fetch(request('/c/small'));

      expect(response.headers.get('content-encoding')).toBe('gzip');
      expect(JSON.parse(await read(response))).toEqual({ text: SMALL });
    });

    it('leaves a large body alone under a larger threshold', async () => {
      const target = await createCompressionApp({ threshold: 1024 * 1024 });
      const response = await target.fetch(request('/c/large'));

      expect(response.headers.get('content-encoding')).toBeNull();
      expect(await response.json()).toEqual({ text: LARGE });
    });

    it('compresses a body that passes the threshold while it arrives in pieces', async () => {
      const response = await app.fetch(request('/c/chunked', 'br'));

      expect(response.headers.get('content-encoding')).toBe('br');
      expect(await read(response)).toBe(LARGE);
    });

    it('compresses a file of known size', async () => {
      const response = await app.fetch(request('/c/file'));

      expect(response.headers.get('content-encoding')).toBe('gzip');
      expect(response.headers.get('content-disposition')).toContain('report.csv');
      expect(await read(response)).toBe(LARGE);
    });
  });

  describe('streams', () => {
    it.each([
      ['@Stream()', '/c/stream', LARGE + LARGE],
      ['a returned ReadableStream', '/c/raw-stream', LARGE],
      ['@Compression({ streams: false })', '/c/stream-off', LARGE],
    ])('leaves %s alone by default', async (_name, path, expected) => {
      const response = await app.fetch(request(path));

      expect(response.headers.get('content-encoding')).toBeNull();
      expect(response.headers.get('vary')).toBe('Accept-Encoding');
      expect(await response.text()).toBe(expected);
    });

    it('leaves an event stream alone by default', async () => {
      const response = await app.fetch(request('/c/sse-plain'));

      expect(response.headers.get('content-encoding')).toBeNull();
      expect(await response.text()).toContain('data: one');
    });

    it('compresses a stream on a route that asks for it', async () => {
      const response = await app.fetch(request('/c/stream-on', 'br'));

      expect(response.headers.get('content-encoding')).toBe('br');
      expect(response.headers.get('content-type')).toBe('application/x-ndjson');
      expect(await read(response)).toBe('{"line":1}\n{"line":2}\n');
    });

    it('compresses an event stream on a route that asks for it', async () => {
      const response = await app.fetch(request('/c/sse'));

      expect(response.headers.get('content-encoding')).toBe('gzip');
      expect(await read(response)).toBe('data: one\n\ndata: two\n\n');
    });

    it('compresses every stream with `streams: true`, except on a route that opted out', async () => {
      const target = await createCompressionApp({ streams: true });

      expect((await target.fetch(request('/c/stream'))).headers.get('content-encoding')).toBe('gzip');
      expect((await target.fetch(request('/c/raw-stream'))).headers.get('content-encoding')).toBe('gzip');
      expect((await target.fetch(request('/c/stream-off'))).headers.get('content-encoding')).toBeNull();
      expect(await read(await target.fetch(request('/c/stream')))).toBe(LARGE + LARGE);
    });

    it.each(['br', 'gzip', 'deflate', 'zstd'] as const)('sends each chunk as it is produced with %s', async (encoding) => {
      const target = await createCompressionApp({ encodings: [encoding] });
      const before = state.closed;
      const response = await target.fetch(request('/c/endless', encoding));
      const reader = response.body!.getReader();
      const first = await reader.read();

      // the generator never ends: bytes can only be here because the chunk was flushed
      expect(first.done).toBe(false);
      expect(first.value!.byteLength).toBeGreaterThan(0);

      await reader.cancel();
      await vi.waitFor(() => expect(state.closed).toBe(before + 1));
    });

    it('closes the source when the client goes away', async () => {
      const before = state.closed;
      const response = await app.fetch(request('/c/endless'));
      const reader = response.body!.getReader();

      await reader.read();
      await reader.read();
      await reader.cancel(new Error('client left'));

      await vi.waitFor(() => expect(state.closed).toBe(before + 1));
    });

    it('fails the response when the source fails', async () => {
      const response = await app.fetch(request('/c/breaks'));

      expect(response.headers.get('content-encoding')).toBe('gzip');
      await expect(response.arrayBuffer()).rejects.toThrow();
    });
  });

  describe('disableCompression()', () => {
    it('turns compression off for an application that configured it', async () => {
      const target = await createCompressionApp(true);

      target.container.get(HttpServer).disableCompression();

      const response = await target.fetch(request('/c/large'));

      expect(response.headers.get('content-encoding')).toBeNull();
      expect(response.headers.get('vary')).toBeNull();
    });
  });
});

describe('precompressed static files', () => {
  let root: string;
  let app: App;

  const script = 'console.log("vercube");\n'.repeat(100);
  const brotli = brotliCompressSync(script);
  const gzip = gzipSync(script);

  async function createStaticApp(compression: ConfigTypes.Config['compression'], etag: boolean = true): Promise<App> {
    return createApp({
      cfg: { requestLogging: false, logLevel: 'error', compression, server: { static: { dirs: ['public'], etag } } },
      configFile: false,
    });
  }

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'vercube-compression-'));
    mkdirSync(join(root, 'public'));
    writeFileSync(join(root, 'public', 'app.js'), script);
    writeFileSync(join(root, 'public', 'app.js.br'), brotli);
    writeFileSync(join(root, 'public', 'app.js.gz'), gzip);
    writeFileSync(join(root, 'public', 'only-gz.js'), script);
    writeFileSync(join(root, 'public', 'only-gz.js.gz'), gzip);
    writeFileSync(join(root, 'public', 'plain.js'), script);
    writeFileSync(join(root, 'public', 'tiny.js'), '1;');
    writeFileSync(join(root, 'public', 'photo.png'), new Uint8Array(4096));
    writeFileSync(join(root, 'secret.txt'), 'outside the static directory');
    writeFileSync(join(root, 'public', 'escape.js'), script);
    symlinkSync(join(root, 'secret.txt'), join(root, 'public', 'escape.js.br'));
    writeFileSync(join(root, 'public', '.hidden.br'), brotli);
    writeFileSync(join(root, 'public', 'dot.js'), script);
    symlinkSync(join(root, 'public', '.hidden.br'), join(root, 'public', 'dot.js.br'));
    mkdirSync(join(root, 'public', 'dir.js.br'));
    writeFileSync(join(root, 'public', 'dir.js'), script);

    vi.spyOn(process, 'cwd').mockReturnValue(root);

    app = await createStaticApp(true);
  });

  afterAll(() => {
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  it('serves the Brotli copy to a client that accepts it', async () => {
    const response = await app.fetch(request('/public/app.js', 'gzip, br'));
    const body = new Uint8Array(await response.arrayBuffer());

    expect(response.headers.get('content-encoding')).toBe('br');
    expect(response.headers.get('content-type')).toBe('application/javascript');
    expect(response.headers.get('content-length')).toBe(String(brotli.byteLength));
    expect(response.headers.get('vary')).toBe('Accept-Encoding');
    expect(Buffer.from(body).equals(brotli)).toBe(true);
  });

  it('serves the gzip copy to a client that only accepts gzip', async () => {
    const response = await app.fetch(request('/public/app.js', 'gzip'));

    expect(response.headers.get('content-encoding')).toBe('gzip');
    expect(Buffer.from(await response.arrayBuffer()).equals(gzip)).toBe(true);
  });

  it('falls back to the next accepted encoding that has a copy', async () => {
    const response = await app.fetch(request('/public/only-gz.js', 'br, gzip'));

    expect(response.headers.get('content-encoding')).toBe('gzip');
    expect(Buffer.from(await response.arrayBuffer()).equals(gzip)).toBe(true);
  });

  it('compresses a file without a copy on the fly', async () => {
    const response = await app.fetch(request('/public/plain.js', 'gzip'));

    expect(response.headers.get('content-encoding')).toBe('gzip');
    expect(response.headers.get('vary')).toBe('Accept-Encoding');
    expect(await read(response)).toBe(script);
  });

  it('sends a small file and an image as they are', async () => {
    const tiny = await app.fetch(request('/public/tiny.js', 'gzip'));
    const image = await app.fetch(request('/public/photo.png', 'gzip'));

    expect(tiny.headers.get('content-encoding')).toBeNull();
    expect(await tiny.text()).toBe('1;');
    expect(image.headers.get('content-encoding')).toBeNull();
    expect((await image.arrayBuffer()).byteLength).toBe(4096);
  });

  it('sends the file itself to a client that accepts no encoding', async () => {
    const response = await app.fetch(request('/public/app.js', null));

    expect(response.headers.get('content-encoding')).toBeNull();
    expect(response.headers.get('vary')).toBe('Accept-Encoding');
    expect(await response.text()).toBe(script);
  });

  it('gives each copy its own ETag and answers 304 for it', async () => {
    const identity = await app.fetch(request('/public/app.js', null));
    const encoded = await app.fetch(request('/public/app.js', 'br'));
    const etag = encoded.headers.get('etag')!;

    expect(etag).toMatch(/^W\/".+-br"$/);
    expect(identity.headers.get('etag')).not.toBe(etag);

    const cached = await app.fetch(request('/public/app.js', 'br', { headers: { 'if-none-match': etag } }));

    expect(cached.status).toBe(304);
    expect(cached.headers.get('content-encoding')).toBeNull();
    expect(cached.headers.get('vary')).toBe('Accept-Encoding');

    const other = await app.fetch(request('/public/app.js', 'gzip', { headers: { 'if-none-match': etag } }));

    expect(other.status).toBe(200);
  });

  it('answers HEAD with the headers of the copy', async () => {
    const response = await app.fetch(request('/public/app.js', 'br', { method: 'HEAD' }));

    expect(response.headers.get('content-encoding')).toBe('br');
    expect(response.headers.get('content-length')).toBe(String(brotli.byteLength));
    expect(await response.text()).toBe('');
  });

  it.each([
    ['a link that leaves the static directory', '/public/escape.js'],
    ['a link to a dotfile', '/public/dot.js'],
    ['a directory', '/public/dir.js'],
  ])('does not serve a copy that is %s', async (_name, path) => {
    const response = await app.fetch(request(path, 'br'));

    expect(response.headers.get('content-encoding')).toBe('br');
    expect(await read(response)).toBe(script);
  });

  it('does not look for copies with `precompressed: false`', async () => {
    const target = await createStaticApp({ precompressed: false });
    const response = await target.fetch(request('/public/app.js', 'br'));
    const body = new Uint8Array(await response.arrayBuffer());

    expect(response.headers.get('content-encoding')).toBe('br');
    expect(Buffer.from(body).equals(brotli)).toBe(false);
    expect(decode('br', body)).toBe(script);
  });

  it('does not look for copies while compression is off', async () => {
    const target = await createStaticApp(false);
    const response = await target.fetch(request('/public/app.js', 'br'));

    expect(response.headers.get('content-encoding')).toBeNull();
    expect(response.headers.get('vary')).toBeNull();
    expect(await response.text()).toBe(script);
  });

  it('stops serving copies after disableCompression()', async () => {
    const target = await createStaticApp(true);

    target.container.get(HttpServer).disableCompression();

    const response = await target.fetch(request('/public/app.js', 'br'));

    expect(response.headers.get('content-encoding')).toBeNull();
    expect(await response.text()).toBe(script);
  });
});
