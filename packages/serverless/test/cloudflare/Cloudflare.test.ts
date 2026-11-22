import { Controller, createApp, Get, HttpServer, type App } from '@vercube/core';
import { Inject } from '@vercube/di';
import { describe, expect, it, vi } from 'vitest';
import { CloudflareBindings, toPagesFunction, toServerlessHandler } from '../../src/Adapters/cloudflare';
import type { Mock } from 'vitest';

interface Env {
  GREETING: string;
}

const LONG = 'a line that would compress well. '.repeat(100);

@Controller('/cf')
class CloudflareController {
  @Inject(CloudflareBindings)
  private readonly gCloudflare!: CloudflareBindings<Env>;

  @Get('/greeting')
  public greeting(): { message: string } {
    return { message: this.gCloudflare.env.GREETING };
  }

  @Get('/later')
  public async later(): Promise<{ message: string }> {
    await new Promise((resolve) => setTimeout(resolve, 5));

    return { message: this.gCloudflare.env.GREETING };
  }

  @Get('/background')
  public background(): { queued: boolean } {
    this.gCloudflare.waitUntil(Promise.resolve('written'));

    return { queued: this.gCloudflare.active };
  }

  @Get('/long')
  public long(): { text: string } {
    return { text: LONG };
  }
}

function createCloudflareApp(bind: boolean = true): Promise<App> {
  return createApp({
    cfg: { requestLogging: false, logLevel: 'error', compression: true },
    configFile: false,
    setup: (app) => {
      if (bind) {
        app.container.bind(CloudflareBindings);
      }

      app.container.bind(CloudflareController);
    },
  });
}

const context = (): { waitUntil: Mock<(promise: Promise<unknown>) => void> } => ({
  waitUntil: vi.fn<(promise: Promise<unknown>) => void>(),
});
const request = (path: string, init?: RequestInit): Request => new Request(`http://localhost/cf${path}`, init);

describe('Cloudflare adapter', () => {
  it('answers through the application and hands it the bindings of the request', async () => {
    const handler = toServerlessHandler<Env>(await createCloudflareApp());
    const response = await handler.fetch(request('/greeting'), { GREETING: 'hello' }, context());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: 'hello' });
  });

  it('keeps the bindings of concurrent requests apart', async () => {
    const handler = toServerlessHandler<Env>(await createCloudflareApp());
    const [first, second] = await Promise.all([
      handler.fetch(request('/later'), { GREETING: 'first' }, context()),
      handler.fetch(request('/later'), { GREETING: 'second' }, context()),
    ]);

    expect(await first.json()).toEqual({ message: 'first' });
    expect(await second.json()).toEqual({ message: 'second' });
  });

  it('passes waitUntil() through to the execution context', async () => {
    const handler = toServerlessHandler<Env>(await createCloudflareApp());
    const ctx = context();
    const response = await handler.fetch(request('/background'), { GREETING: 'x' }, ctx);

    expect(await response.json()).toEqual({ queued: true });
    // the handler's promise, and the telemetry flush of the adapter
    expect(ctx.waitUntil).toHaveBeenCalledTimes(2);
    await expect(ctx.waitUntil.mock.calls[0][0]).resolves.toBe('written');
  });

  it('refuses to hand out bindings outside a request', async () => {
    const app = await createCloudflareApp();
    const bindings = app.container.get(CloudflareBindings);

    expect(bindings.active).toBe(false);
    expect(() => bindings.env).toThrow('CloudflareBindings was read outside a request');
    expect(() => bindings.ctx).toThrow('CloudflareBindings was read outside a request');
  });

  it('exposes the execution context of the request', async () => {
    const app = await createCloudflareApp();
    const handler = toServerlessHandler<Env>(app);
    const ctx = context();
    let seen: unknown;

    app.container.get(CloudflareBindings);

    const original = app.fetch.bind(app);

    app.fetch = async (incoming: Request): Promise<Response> => {
      seen = app.container.get(CloudflareBindings).ctx;

      return original(incoming);
    };

    await handler.fetch(request('/greeting'), { GREETING: 'x' }, ctx);

    expect(seen).toBe(ctx);
  });

  it('leaves compression to Cloudflare', async () => {
    const app = await createCloudflareApp();
    const handler = toServerlessHandler<Env>(app);

    expect(app.container.get(HttpServer).compressionEncodings.length).toBeGreaterThan(0);

    const response = await handler.fetch(
      request('/long', { headers: { 'accept-encoding': 'gzip, br' } }),
      { GREETING: 'x' },
      context(),
    );

    expect(response.headers.get('content-encoding')).toBeNull();
    expect(await response.json()).toEqual({ text: LONG });
    expect(app.container.get(HttpServer).compressionEncodings).toEqual([]);
  });

  it('binds CloudflareBindings for an application that did not', async () => {
    const app = await createApp({ cfg: { requestLogging: false, logLevel: 'error' }, configFile: false });
    const handler = toServerlessHandler(app);

    expect(app.container.getOptional(CloudflareBindings)).toBeNull();

    await handler.fetch(new Request('http://localhost/none'), {}, context());

    expect(app.container.getOptional(CloudflareBindings)).toBeInstanceOf(CloudflareBindings);
  });

  it('creates the application on the first request when given a function, once', async () => {
    const create = vi.fn(() => createCloudflareApp());
    const handler = toServerlessHandler<Env>(create);

    expect(create).not.toHaveBeenCalled();

    const responses = await Promise.all([
      handler.fetch(request('/greeting'), { GREETING: 'a' }, context()),
      handler.fetch(request('/greeting'), { GREETING: 'b' }, context()),
    ]);

    await handler.fetch(request('/greeting'), { GREETING: 'c' }, context());

    expect(create).toHaveBeenCalledTimes(1);
    expect(await responses[1].json()).toEqual({ message: 'b' });
  });

  it('tries again after an application that failed to start', async () => {
    const create = vi
      .fn<() => Promise<App>>()
      .mockRejectedValueOnce(new Error('database unreachable'))
      .mockImplementation(() => createCloudflareApp());
    const handler = toServerlessHandler<Env>(create);

    await expect(handler.fetch(request('/greeting'), { GREETING: 'a' }, context())).rejects.toThrow('database unreachable');

    const response = await handler.fetch(request('/greeting'), { GREETING: 'a' }, context());

    expect(response.status).toBe(200);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('answers a caller that passes the request alone, as `vercube dev` does', async () => {
    const handler = toServerlessHandler<Env>(await createCloudflareApp());
    const response = await handler.fetch(request('/background'));

    expect(await response.json()).toEqual({ queued: true });
    expect(await (await handler.fetch(request('/greeting'))).json()).toEqual({});
  });

  it('serves a Pages Function from the same application', async () => {
    const onRequest = toPagesFunction<Env>(await createCloudflareApp());
    const response = await onRequest({ request: request('/greeting'), env: { GREETING: 'pages' }, ...context() });

    expect(await response.json()).toEqual({ message: 'pages' });
  });
});
