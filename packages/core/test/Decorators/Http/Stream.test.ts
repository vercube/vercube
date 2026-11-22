import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import {
  BaseMiddleware,
  Controller,
  createApp,
  createStream,
  Get,
  initializeMetadata,
  Middleware,
  NotFoundError,
  SetHeader,
  Sse,
  Status,
  Stream,
  streamFile,
} from '../../../src';

const state = {
  closed: 0,
  errors: [] as unknown[],
  pulled: 0,
};

class TagMiddleware extends BaseMiddleware {
  public override onRequest(_request: Request, response: Response): void {
    response.headers.set('x-mw', 'yes');
  }
}

class ReplaceMiddleware extends BaseMiddleware {
  public override onResponse(): Response {
    return new Response('replaced', { status: 203 });
  }
}

class ThrowingAfterMiddleware extends BaseMiddleware {
  public override onResponse(): void {
    throw new Error('after hook failed');
  }
}

function fromText(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }

      controller.close();
    },
  });
}

@Controller('/stream')
class StreamController {
  @Get('/raw')
  public raw(): ReadableStream {
    return fromText('a', 'b', 'c');
  }

  @Get('/raw-async')
  public async rawAsync(): Promise<ReadableStream> {
    return fromText('async');
  }

  @Get('/raw-decorated')
  @Status(202)
  @SetHeader('Content-Type', 'text/csv')
  @SetHeader('X-Export', '1')
  public rawDecorated(): ReadableStream {
    return fromText('id\n1\n');
  }

  @Get('/raw-middleware')
  @Middleware(TagMiddleware)
  @Status(201)
  public rawMiddleware(): ReadableStream {
    return fromText('mw');
  }

  @Get('/ndjson')
  @Stream()
  public async *ndjson(): AsyncGenerator<{ line: number }> {
    yield { line: 1 };
    yield { line: 2 };
  }

  @Get('/text')
  @Stream()
  public *text(): Generator<string> {
    yield 'hello ';
    yield 'world';
  }

  @Get('/bytes')
  @Stream()
  public bytes(): Uint8Array[] {
    return [new Uint8Array([1, 2]), new Uint8Array([3])];
  }

  @Get('/typed')
  @Stream({ type: 'text/csv', serialize: (row: { id: number }) => `${row.id}\n` })
  @Status(206)
  @SetHeader('X-Rows', '2')
  public async *typed(): AsyncGenerator<{ id: number }> {
    yield { id: 1 };
    yield { id: 2 };
  }

  @Get('/typed-stream')
  @Stream({ type: 'text/plain' })
  public typedStream(): ReadableStream {
    return fromText('typed');
  }

  @Get('/node')
  @Stream({ type: 'application/octet-stream' })
  public node(): Readable {
    return Readable.from([Buffer.from('node '), Buffer.from('stream')]);
  }

  @Get('/empty')
  @Stream()
  public async *empty(): AsyncGenerator<string> {}

  @Get('/fails-first')
  @Stream()
  // oxlint-disable-next-line require-yield
  public async *failsFirst(): AsyncGenerator<string> {
    throw new NotFoundError('no such export');
  }

  @Get('/fails-later')
  @Stream({ onError: (error) => state.errors.push(error) })
  public async *failsLater(): AsyncGenerator<string> {
    yield 'one';
    throw new Error('backend went away');
  }

  @Get('/bad-chunk')
  @Stream()
  public async *badChunk(): AsyncGenerator<unknown> {
    yield () => {};
  }

  @Get('/not-iterable')
  @Stream()
  public notIterable(): unknown {
    return { not: 'iterable' };
  }

  @Get('/response')
  @Stream()
  public response(): Response {
    return new Response('own', { status: 418 });
  }

  @Get('/nothing')
  @Stream()
  public nothing(): void {}

  @Get('/endless')
  @Stream()
  public async *endless(): AsyncGenerator<string> {
    try {
      for (;;) {
        state.pulled++;
        yield 'tick\n';
      }
    } finally {
      state.closed++;
    }
  }

  @Get('/guessed-overridden')
  @Stream()
  @SetHeader('Content-Type', 'text/csv')
  public *guessedOverridden(): Generator<string> {
    yield 'a,b\n';
  }

  @Get('/explicit-wins')
  @Stream({ type: 'text/tab-separated-values' })
  @SetHeader('Content-Type', 'text/csv')
  public *explicitWins(): Generator<string> {
    yield 'a\tb\n';
  }

  @Get('/objects-stream')
  @Stream({ type: 'application/x-ndjson', serialize: (row: { id: number }) => `${JSON.stringify(row)}\n` })
  public objectsStream(): ReadableStream<{ id: number }> {
    return new ReadableStream({
      start(controller) {
        controller.enqueue({ id: 1 });
        controller.enqueue({ id: 2 });
        controller.close();
      },
    });
  }

  @Get('/failing-stream')
  @Stream({ onError: (error) => state.errors.push(error) })
  public failingStream(): ReadableStream<Uint8Array> {
    let sent = false;

    return new ReadableStream({
      pull(controller) {
        if (sent) {
          controller.error(new Error('upstream reset'));
        } else {
          sent = true;
          controller.enqueue(new Uint8Array([1]));
        }
      },
    });
  }

  @Get('/aborts')
  @Stream({ onError: (error) => state.errors.push(error) })
  public async *aborts(): AsyncGenerator<string> {
    yield 'partial';
    throw new DOMException('upstream timed out', 'AbortError');
  }

  @Get('/bare-generator')
  public async *bareGenerator(): AsyncGenerator<string> {
    yield 'never sent';
  }

  @Get('/bare-readable')
  @Status(201)
  public bareReadable(): Readable {
    return Readable.from(['never sent']);
  }

  @Get('/dropped')
  @Middleware(ReplaceMiddleware)
  @Stream()
  public async *dropped(): AsyncGenerator<string> {
    try {
      yield 'one';
      yield 'two';
    } finally {
      state.closed++;
    }
  }

  @Get('/dropped-by-error')
  @Middleware(ThrowingAfterMiddleware)
  public droppedByError(): ReadableStream {
    return new ReadableStream({
      cancel() {
        state.closed++;
      },
    });
  }

  @Get('/short-file')
  public shortFile(): Promise<Response> {
    return streamFile([new Uint8Array(3)], { size: 100 });
  }

  @Get('/long-file')
  public longFile(): Promise<Response> {
    return streamFile([new Uint8Array(4), new Uint8Array(4)], { size: 6 });
  }

  @Get('/manual')
  public async manual(): Promise<ReadableStream> {
    return createStream(['a', 'b'], { type: 'text/x-custom' });
  }

  @Get('/file')
  public file(): Promise<Response> {
    return streamFile(Readable.from([Buffer.from('id,name\n'), Buffer.from('1,Zoë\n')]), {
      filename: 'raport Zoë.csv',
      size: 15,
    });
  }

  @Get('/blob')
  public blob(): Promise<Response> {
    return streamFile(new Blob(['{"a":1}'], { type: 'application/json' }), { filename: 'data.json', disposition: 'inline' });
  }
}

async function createStreamApp() {
  return createApp({
    cfg: { requestLogging: false, logLevel: 'error' },
    configFile: false,
    setup: (app) => app.container.bind(StreamController),
  });
}

async function call(path: string): Promise<Response> {
  const app = await createStreamApp();

  return app.fetch(new Request(`http://localhost/stream${path}`));
}

describe('streaming responses', () => {
  describe('a ReadableStream returned without a decorator', () => {
    it('is streamed as bytes', async () => {
      const response = await call('/raw');

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/octet-stream');
      expect(await response.text()).toBe('abc');
    });

    it('is streamed from an async handler', async () => {
      expect(await (await call('/raw-async')).text()).toBe('async');
    });

    it('takes the status and the headers of the route', async () => {
      const response = await call('/raw-decorated');

      expect(response.status).toBe(202);
      expect(response.headers.get('content-type')).toBe('text/csv');
      expect(response.headers.get('x-export')).toBe('1');
      expect(await response.text()).toBe('id\n1\n');
    });

    it('takes the headers a middleware set', async () => {
      const response = await call('/raw-middleware');

      expect(response.status).toBe(201);
      expect(response.headers.get('x-mw')).toBe('yes');
      expect(response.headers.get('content-type')).toBe('application/octet-stream');
      expect(await response.text()).toBe('mw');
    });
  });

  describe('@Stream', () => {
    it('marks the route for tools', async () => {
      await createStreamApp();
      const meta = initializeMetadata(StreamController.prototype);

      expect(meta.__methods['typed'].meta.stream).toEqual({ type: 'text/csv' });
      expect(meta.__methods['ndjson'].meta.stream).toEqual({ type: undefined });
      expect(meta.__methods['raw'].meta.stream).toBeUndefined();
    });

    it('sends objects as NDJSON', async () => {
      const response = await call('/ndjson');

      expect(response.headers.get('content-type')).toBe('application/x-ndjson');
      expect(await response.text()).toBe('{"line":1}\n{"line":2}\n');
    });

    it('sends strings as text', async () => {
      const response = await call('/text');

      expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
      expect(await response.text()).toBe('hello world');
    });

    it('sends bytes as they are', async () => {
      const response = await call('/bytes');

      expect(response.headers.get('content-type')).toBe('application/octet-stream');
      expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3]);
    });

    it('applies the type, the serializer, @Status and @SetHeader', async () => {
      const response = await call('/typed');

      expect(response.status).toBe(206);
      expect(response.headers.get('content-type')).toBe('text/csv');
      expect(response.headers.get('x-rows')).toBe('2');
      expect(await response.text()).toBe('1\n2\n');
    });

    it('gives a ReadableStream its content type', async () => {
      const response = await call('/typed-stream');

      expect(response.headers.get('content-type')).toBe('text/plain');
      expect(await response.text()).toBe('typed');
    });

    it('streams a Node Readable', async () => {
      expect(await (await call('/node')).text()).toBe('node stream');
    });

    it('answers an empty source with an empty body', async () => {
      const response = await call('/empty');

      expect(response.status).toBe(200);
      expect(await response.text()).toBe('');
    });

    it('turns an error before the first chunk into a regular error response', async () => {
      const response = await call('/fails-first');

      expect(response.status).toBe(404);
      expect(await response.text()).toContain('no such export');
    });

    it('rejects a chunk it cannot serialize before anything is sent', async () => {
      expect((await call('/bad-chunk')).status).toBe(500);
    });

    it('rejects a result that cannot be streamed', async () => {
      const response = await call('/not-iterable');

      expect(response.status).toBe(500);
      expect(await response.text()).toContain('must return a ReadableStream');
    });

    it('cuts the stream off and reports an error after the first chunk', async () => {
      state.errors.length = 0;

      const response = await call('/fails-later');

      expect(response.status).toBe(200);
      await expect(response.text()).rejects.toThrow();
      expect(state.errors).toHaveLength(1);
      expect((state.errors[0] as Error).message).toBe('backend went away');
    });

    it('passes a Response and undefined through', async () => {
      const own = await call('/response');

      expect(own.status).toBe(418);
      expect(await own.text()).toBe('own');
      expect((await call('/nothing')).status).toBe(204);
    });

    it('pulls only as fast as the client reads and closes the source on disconnect', async () => {
      state.pulled = 0;
      state.closed = 0;

      const response = await call('/endless');
      const reader = response.body!.getReader();

      await reader.read();
      await reader.read();
      await new Promise((resolve) => setTimeout(resolve, 20));

      // an endless source did not run away while nobody was reading
      expect(state.pulled).toBeLessThan(10);
      expect(state.closed).toBe(0);

      await reader.cancel();
      await vi.waitFor(() => expect(state.closed).toBe(1));
    });
  });

  describe('content type precedence', () => {
    it('lets @SetHeader name the type of a stream whose type was only guessed', async () => {
      expect((await call('/guessed-overridden')).headers.get('content-type')).toBe('text/csv');
    });

    it('keeps the type given to @Stream over @SetHeader', async () => {
      expect((await call('/explicit-wins')).headers.get('content-type')).toBe('text/tab-separated-values');
    });
  });

  describe('a ReadableStream under @Stream', () => {
    it('is serialized chunk by chunk when a serializer is given', async () => {
      const response = await call('/objects-stream');

      expect(response.headers.get('content-type')).toBe('application/x-ndjson');
      expect(await response.text()).toBe('{"id":1}\n{"id":2}\n');
    });

    it('reports a failure of the stream to onError', async () => {
      state.errors.length = 0;

      const response = await call('/failing-stream');

      await expect(response.arrayBuffer()).rejects.toThrow();
      expect((state.errors[0] as Error).message).toBe('upstream reset');
    });
  });

  describe('what must not pass for a complete response', () => {
    it('cuts off a stream whose source aborted, without reporting a failure', async () => {
      state.errors.length = 0;

      const response = await call('/aborts');

      await expect(response.text()).rejects.toThrow();
      expect(state.errors).toHaveLength(0);
    });

    it('refuses an async generator returned without @Stream', async () => {
      const response = await call('/bare-generator');

      expect(response.status).toBe(500);
      expect(await response.text()).toContain('without @Stream()');
    });

    it('refuses a Node Readable returned without @Stream, on a route with actions too', async () => {
      const response = await call('/bare-readable');

      expect(response.status).toBe(500);
      expect(await response.text()).toContain('without @Stream()');
    });

    it('refuses @Stream and @Sse on one handler', async () => {
      class Both {
        @Sse('/both')
        @Stream()
        public async *both(): AsyncGenerator<string> {
          yield 'x';
        }
      }
      Controller('/conflict')(Both);

      await expect(
        createApp({
          cfg: { requestLogging: false, logLevel: 'error' },
          configFile: false,
          setup: (app) => app.container.bind(Both),
        }),
      ).rejects.toThrow('cannot be combined');
    });
  });

  describe('a stream that is not sent', () => {
    it('is closed when an after-middleware answers in its place', async () => {
      state.closed = 0;

      const response = await call('/dropped');

      expect(response.status).toBe(203);
      expect(await response.text()).toBe('replaced');
      await vi.waitFor(() => expect(state.closed).toBe(1));
    });

    it('is cancelled when an after-middleware throws', async () => {
      state.closed = 0;

      expect((await call('/dropped-by-error')).status).toBe(500);
      await vi.waitFor(() => expect(state.closed).toBe(1));
    });
  });

  it('serves a second application from the same controller', async () => {
    const first = await createStreamApp();
    const second = await createStreamApp();

    expect(await (await first.fetch(new Request('http://localhost/stream/ndjson'))).text()).toBe('{"line":1}\n{"line":2}\n');
    expect(await (await second.fetch(new Request('http://localhost/stream/ndjson'))).text()).toBe('{"line":1}\n{"line":2}\n');
  });

  describe('createStream', () => {
    it('streams from a handler without the decorator', async () => {
      const response = await call('/manual');

      expect(response.headers.get('content-type')).toBe('text/x-custom');
      expect(await response.text()).toBe('ab');
    });

    it('refuses a string, which would stream char by char', async () => {
      await expect(createStream('abc' as never)).rejects.toThrow(TypeError);
    });
  });

  describe('streamFile', () => {
    it('sets the type from the extension, the disposition and the length', async () => {
      const response = await call('/file');

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
      expect(response.headers.get('content-length')).toBe('15');
      expect(response.headers.get('content-disposition')).toBe(
        `attachment; filename="raport Zo_.csv"; filename*=UTF-8''raport%20Zo%C3%AB.csv`,
      );
      expect(await response.text()).toBe('id,name\n1,Zoë\n');
    });

    it('sends a Blob with its own type and size', async () => {
      const response = await call('/blob');

      expect(response.headers.get('content-type')).toBe('application/json');
      expect(response.headers.get('content-length')).toBe('7');
      expect(response.headers.get('content-disposition')).toBe('inline; filename="data.json"');
      expect(await response.json()).toEqual({ a: 1 });
    });

    it('keeps a file name from breaking out of the header', async () => {
      const response = await streamFile(new Blob(['x']), { filename: '../../etc/"pass\r\nwd".txt' });

      expect(response.headers.get('content-disposition')).toBe(
        'attachment; filename="_passwd_.txt"; filename*=UTF-8\'\'%22passwd%22.txt',
      );
      expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    });

    it('fails a file that is shorter or longer than the size it declares', async () => {
      const short = await call('/short-file');
      const long = await call('/long-file');

      expect(short.headers.get('content-length')).toBe('100');
      await expect(short.arrayBuffer()).rejects.toThrow('ended after 3 bytes');
      await expect(long.arrayBuffer()).rejects.toThrow('longer than the 6 bytes');
    });

    it('uses the size of a Blob, whatever the options say', async () => {
      const response = await streamFile(new Blob(['abcdef']), { size: 2 });

      expect(response.headers.get('content-length')).toBe('6');
    });

    it('sets its own headers over the ones passed in, and keeps the rest', async () => {
      const response = await streamFile(new Blob(['x']), {
        filename: 'a.pdf',
        headers: { 'content-type': 'text/html', 'content-length': '999', 'cache-control': 'no-store' },
      });

      expect(response.headers.get('content-type')).toBe('application/pdf');
      expect(response.headers.get('content-length')).toBe('1');
      expect(response.headers.get('cache-control')).toBe('no-store');
    });

    it('survives file names that cannot be encoded or are only a path', async () => {
      expect((await streamFile(new Blob(['x']), { filename: 'a\uD800.txt' })).headers.get('content-disposition')).toBe(
        'attachment; filename="a_.txt"',
      );
      expect((await streamFile(new Blob(['x']), { filename: 'dir/' })).headers.get('content-disposition')).toBe('attachment');
      expect((await streamFile(new Blob(['x']), { filename: '100%.txt' })).headers.get('content-disposition')).toBe(
        `attachment; filename="100_.txt"; filename*=UTF-8''100%25.txt`,
      );
    });

    it('falls back to bytes for an unknown type', async () => {
      const response = await streamFile([new Uint8Array([1])]);

      expect(response.headers.get('content-type')).toBe('application/octet-stream');
      expect(response.headers.get('content-disposition')).toBe('attachment');
      expect(response.headers.has('content-length')).toBe(false);
    });
  });
});
