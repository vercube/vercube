import { Logger } from '@vercube/logger';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  BaseMiddleware,
  Controller,
  createApp,
  createSseResponse,
  formatSseMessage,
  Get,
  Header,
  Middleware,
  Param,
  Request,
  Router,
  Sse,
  UnauthorizedError,
} from '../../../src';
import type { App, SseMessage } from '../../../src';

const finalized = vi.fn();
const signalFinalized = vi.fn();
const invalidFinalized = vi.fn();
const logError = vi.fn();

@Controller('/sse')
class SseController {
  @Sse('/finite')
  public async *finite(): AsyncGenerator<SseMessage> {
    yield { event: 'greeting', id: 1, data: 'hello' };
    yield { data: { n: 2 } };
  }

  @Sse('/sync/:count')
  public sync(@Param('count') count: string): string[] {
    return Array.from({ length: Number(count) }, (_, i) => `item-${i}`);
  }

  @Sse('/async-method')
  public async asyncMethod(): Promise<SseMessage[]> {
    return [{ data: 'from-promise' }];
  }

  @Sse('/infinite')
  public async *infinite(): AsyncGenerator<SseMessage> {
    try {
      let i = 0;
      while (true) {
        yield { data: i++ };
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    } finally {
      finalized();
    }
  }

  @Sse('/waits-for-events')
  public async *waitsForEvents(@Request() req: Request): AsyncGenerator<SseMessage> {
    try {
      yield { data: 'ready' };
      // Stands in for awaiting a queue or pub/sub message that never arrives.
      await new Promise((_, reject) => req.signal.addEventListener('abort', () => reject(req.signal.reason), { once: true }));
    } finally {
      signalFinalized();
    }
  }

  @Sse('/invalid-first')
  public async *invalidFirst(): AsyncGenerator<any> {
    try {
      yield { name: 'Bob' };
    } finally {
      invalidFinalized();
    }
  }

  @Sse('/invalid-later')
  public async *invalidLater(): AsyncGenerator<any> {
    yield { data: 'ok' };
    yield [1, 2];
  }

  @Sse('/passthrough')
  public passthrough(): Response {
    return new Response('nope', { status: 401 });
  }

  @Sse('/invalid/object')
  public invalidObject(): any {
    return { data: 'not iterable' };
  }

  @Sse('/invalid/string')
  public invalidString(): any {
    return 'hello';
  }

  @Sse('/invalid/async')
  public async invalidAsync(): Promise<any> {
    return undefined;
  }

  @Sse('/throws-at-start')
  public async *throwsAtStart(@Header('authorization') token: string | null): AsyncGenerator<SseMessage> {
    if (!token) {
      throw new UnauthorizedError('No token');
    }

    yield { data: token };
  }

  @Sse('/throws-mid-stream')
  public async *throwsMidStream(): AsyncGenerator<SseMessage> {
    yield { data: 'first' };
    throw new Error('Boom');
  }

  @Get('/plain')
  public plain(): unknown {
    return { ok: true };
  }
}

describe('Sse Decorator', () => {
  let app: App;

  beforeAll(async () => {
    app = await createApp({
      cfg: { requestLogging: false, requestContext: false },
      setup: (instance) => {
        instance.container.bind(SseController);
      },
    });

    app.container.bindMock(Logger, { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: logError });
  });

  const fetch = (path: string) => app.fetch(new globalThis.Request(`http://localhost${path}`));

  it('should register only a GET route', () => {
    const router = app.container.get(Router);

    expect(router.resolve({ method: 'GET', path: '/sse/finite' })).toBeDefined();
    expect(router.resolve({ method: 'HEAD', path: '/sse/finite' })).toBeUndefined();
  });

  it('should stream an async generator as text/event-stream', async () => {
    const response = await fetch('/sse/finite');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-cache');
    expect(await response.text()).toBe('event: greeting\nid: 1\ndata: hello\n\ndata: {"n":2}\n\n');
  });

  it('should stream a sync iterable and resolve handler args', async () => {
    const response = await fetch('/sse/sync/2');

    expect(await response.text()).toBe('data: item-0\n\ndata: item-1\n\n');
  });

  it('should await a handler returning a promise', async () => {
    const response = await fetch('/sse/async-method');

    expect(await response.text()).toBe('data: from-promise\n\n');
  });

  it('should let a generator awaiting external events clean up through the request signal', async () => {
    const abort = new AbortController();
    const response = await app.fetch(new globalThis.Request('http://localhost/sse/waits-for-events', { signal: abort.signal }));
    const reader = response.body!.getReader();

    expect(new TextDecoder().decode((await reader.read()).value)).toBe('data: ready\n\n');
    const pending = reader.read();
    expect(signalFinalized).not.toHaveBeenCalled();

    // The server aborts the request signal when the client disconnects.
    abort.abort();
    expect((await pending).done).toBe(true);
    expect(signalFinalized).toHaveBeenCalledOnce();
    expect(logError).not.toHaveBeenCalledWith(expect.stringContaining('waitsForEvents'), expect.anything());
  });

  it('should pass a Response returned by the handler through', async () => {
    const response = await fetch('/sse/passthrough');

    expect(response.status).toBe(401);
    expect(await response.text()).toBe('nope');
  });

  it('should close the generator when the client disconnects', async () => {
    const response = await fetch('/sse/infinite');
    const reader = response.body!.getReader();

    const { value } = await reader.read();
    expect(new TextDecoder().decode(value)).toBe('data: 0\n\n');

    await reader.cancel();
    // The generator closes at its next `yield`, after the pending sleep.
    await vi.waitFor(() => expect(finalized).toHaveBeenCalledOnce());
  });

  it.each(['object', 'string', 'async'])('should respond with 500 when the handler returns a non-iterable (%s)', async (kind) => {
    const response = await fetch(`/sse/invalid/${kind}`);

    expect(response.status).toBe(500);
    expect(response.headers.get('content-type') ?? '').not.toContain('text/event-stream');
    expect(await response.text()).toContain('SSE handler must return an AsyncIterable or Iterable of messages');
  });

  it('should turn an error thrown before the first event into a regular error response', async () => {
    const response = await fetch('/sse/throws-at-start');

    expect(response.status).toBe(401);
    expect(response.headers.get('content-type') ?? '').not.toContain('text/event-stream');
    expect(await response.text()).toContain('No token');
  });

  it('should close the stream and log an error thrown mid-stream', async () => {
    const response = await fetch('/sse/throws-mid-stream');
    const reader = response.body!.getReader();

    expect(response.status).toBe(200);
    expect(new TextDecoder().decode((await reader.read()).value)).toBe('data: first\n\n');
    await expect(reader.read()).rejects.toThrow('Boom');
    expect(logError).toHaveBeenCalledWith('SseController::throwsMidStream: SSE stream failed', expect.any(Error));
  });

  it('should respond with 500 when the first message is not an SSE message', async () => {
    const response = await fetch('/sse/invalid-first');

    expect(response.status).toBe(500);
    expect((await response.json()).message).toContain('SSE message has unknown field "name"');
    await vi.waitFor(() => expect(invalidFinalized).toHaveBeenCalledOnce());
  });

  it('should close the stream and log when a later message is not an SSE message', async () => {
    const response = await fetch('/sse/invalid-later');
    const reader = response.body!.getReader();

    expect(new TextDecoder().decode((await reader.read()).value)).toBe('data: ok\n\n');
    await expect(reader.read()).rejects.toThrow('got an array');
    expect(logError).toHaveBeenCalledWith('SseController::invalidLater: SSE stream failed', expect.any(TypeError));
  });

  it('should not affect regular routes', async () => {
    const response = await fetch('/sse/plain');

    expect(await response.json()).toEqual({ ok: true });
  });
});

class CorsMiddleware extends BaseMiddleware {
  public override onRequest(_request: globalThis.Request, response: Response): void {
    response.headers.set('access-control-allow-origin', 'https://app.example');
    response.headers.set('cache-control', 'no-store');
  }
}

@Controller('/cors-sse')
@Middleware(CorsMiddleware)
class CorsSseController {
  @Sse('/stream')
  public async *stream(): AsyncGenerator<SseMessage> {
    yield { data: 'hello' };
  }

  @Sse('/protected')
  public async *protectedStream(@Header('authorization') token: string | null): AsyncGenerator<SseMessage> {
    if (!token) {
      throw new UnauthorizedError('No token');
    }

    yield { data: token };
  }
}

describe('Sse Decorator with middleware headers', () => {
  let app: App;

  beforeAll(async () => {
    app = await createApp({
      cfg: { requestLogging: false, requestContext: false },
      setup: (instance) => {
        instance.container.bind(CorsSseController);
      },
    });
  });

  const fetch = (path: string) => app.fetch(new globalThis.Request(`http://localhost/cors-sse${path}`));

  it('should send CORS headers from a middleware with the stream, keeping the SSE headers', async () => {
    const response = await fetch('/stream');

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://app.example');
    expect(response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-cache');
    expect(await response.text()).toBe('data: hello\n\n');
  });

  it('should send CORS headers with the error response of a stream failing at its start', async () => {
    const response = await fetch('/protected');

    // Without them a cross-origin EventSource sees a network error and keeps reconnecting.
    expect(response.status).toBe(401);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://app.example');
    expect(response.headers.get('content-type') ?? '').not.toContain('text/event-stream');
  });
});

describe('createSseResponse heartbeat', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  async function* firstThenWait(): AsyncGenerator<SseMessage> {
    yield { data: 'first' };
    await new Promise(() => {});
  }

  /** Resolves with the next chunk, or `null` when none arrives within 20ms. */
  const readOrNull = (reader: ReadableStreamDefaultReader<Uint8Array>) =>
    Promise.race([
      reader.read().then(({ value }) => new TextDecoder().decode(value)),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 20)),
    ]);

  it('should send pings while the client keeps reading', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const reader = (await createSseResponse(firstThenWait(), { heartbeat: 1000 })).body!.getReader();

    expect(await readOrNull(reader)).toBe('data: first\n\n');
    vi.advanceTimersByTime(1000);
    expect(await readOrNull(reader)).toBe(': ping\n\n');

    await reader.cancel();
  });

  it('should not queue pings while the client is not reading', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const reader = (await createSseResponse(firstThenWait(), { heartbeat: 1000 })).body!.getReader();

    // The queue already holds the first event, so a stalled client gets no pings.
    vi.advanceTimersByTime(100_000);

    expect(await readOrNull(reader)).toBe('data: first\n\n');
    expect(await readOrNull(reader)).toBeNull();

    await reader.cancel();
  });
});

describe('formatSseMessage', () => {
  it('should split multiline data into multiple data fields', () => {
    expect(formatSseMessage({ data: 'a\nb\r\nc' })).toBe('data: a\ndata: b\ndata: c\n\n');
  });

  it('should strip line breaks from single-line fields', () => {
    expect(formatSseMessage({ event: 'x\ndata: injected', id: 'a\rb', data: 1 })).toBe(
      'event: xdata: injected\nid: ab\ndata: 1\n\n',
    );
  });

  it('should truncate retry to an integer', () => {
    expect(formatSseMessage({ retry: 1500.7 })).toBe('retry: 1500\n\n');
  });

  it('should reject objects with fields other than SSE fields', () => {
    expect(() => formatSseMessage({ id: 5, name: 'Bob' } as any)).toThrow('SSE message has unknown field "name"');
  });

  it('should reject arrays', () => {
    expect(() => formatSseMessage([1, 2] as any)).toThrow('got an array');
  });

  it('should reject data that cannot be serialized to JSON', () => {
    expect(() => formatSseMessage({ data: () => 1 })).toThrow('SSE message data of type function cannot be serialized to JSON.');
    expect(() => formatSseMessage({ data: Symbol('x') })).toThrow('of type symbol');
  });

  it('should reject a retry that is not a finite number', () => {
    expect(() => formatSseMessage({ retry: Number('abc') })).toThrow('SSE message retry must be a finite number, got NaN.');
    expect(() => formatSseMessage({ retry: Infinity })).toThrow('got Infinity');
  });

  it('should send null data as JSON null', () => {
    expect(formatSseMessage({ data: null })).toBe('data: null\n\n');
  });

  it('should treat primitives as data', () => {
    expect(formatSseMessage(42)).toBe('data: 42\n\n');
  });
});
