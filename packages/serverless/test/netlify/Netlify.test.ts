import { Controller, createApp, Get, HttpServer, type App } from '@vercube/core';
import { Inject } from '@vercube/di';
import { describe, expect, it, vi } from 'vitest';
import { NetlifyContext, toServerlessHandler } from '../../src/Adapters/netlify';

interface Context {
  geo?: { country?: { code?: string } };
  waitUntil?: (promise: Promise<unknown>) => void;
}

const LONG = 'a line that would compress well. '.repeat(100);

@Controller('/nf')
class NetlifyController {
  @Inject(NetlifyContext)
  private readonly gNetlify!: NetlifyContext<Context>;

  @Get('/where')
  public where(): { country: string | null } {
    return { country: this.gNetlify.context.geo?.country?.code ?? null };
  }

  @Get('/later')
  public async later(): Promise<{ country: string | null }> {
    await new Promise((resolve) => setTimeout(resolve, 5));

    return { country: this.gNetlify.context.geo?.country?.code ?? null };
  }

  @Get('/background')
  public background(): { queued: boolean } {
    this.gNetlify.waitUntil(Promise.resolve('written'));

    return { queued: this.gNetlify.active };
  }

  @Get('/long')
  public long(): { text: string } {
    return { text: LONG };
  }
}

function createNetlifyApp(): Promise<App> {
  return createApp({
    cfg: { requestLogging: false, logLevel: 'error', compression: true },
    configFile: false,
    setup: (app) => {
      app.container.bind(NetlifyContext);
      app.container.bind(NetlifyController);
    },
  });
}

const request = (path: string, init?: RequestInit): Request => new Request(`http://localhost/nf${path}`, init);
const from = (code: string): Context => ({ geo: { country: { code } } });

describe('Netlify adapter', () => {
  it('answers through the application and hands it the context of the request', async () => {
    const handler = toServerlessHandler(await createNetlifyApp());
    const response = await handler(request('/where'), from('PL'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ country: 'PL' });
  });

  it('keeps the contexts of concurrent requests apart', async () => {
    const handler = toServerlessHandler(await createNetlifyApp());
    const [first, second] = await Promise.all([handler(request('/later'), from('PL')), handler(request('/later'), from('DE'))]);

    expect(await first.json()).toEqual({ country: 'PL' });
    expect(await second.json()).toEqual({ country: 'DE' });
  });

  it('passes waitUntil() to the platform when it offers one', async () => {
    const handler = toServerlessHandler(await createNetlifyApp());
    const waitUntil = vi.fn<(promise: Promise<unknown>) => void>();
    const response = await handler(request('/background'), { waitUntil });

    expect(await response.json()).toEqual({ queued: true });
    // the handler's promise, and the telemetry flush of the adapter
    expect(waitUntil).toHaveBeenCalledTimes(2);
    await expect(waitUntil.mock.calls[0][0]).resolves.toBe('written');
  });

  it('lets the work finish by itself where there is no waitUntil()', async () => {
    const handler = toServerlessHandler(await createNetlifyApp());

    expect(await (await handler(request('/background'), {})).json()).toEqual({ queued: true });
  });

  it('answers a caller that passes the request alone', async () => {
    const handler = toServerlessHandler(await createNetlifyApp());

    expect(await (await handler(request('/where'))).json()).toEqual({ country: null });
  });

  it('refuses to hand out the context outside a request', async () => {
    const app = await createNetlifyApp();
    const netlify = app.container.get(NetlifyContext);

    expect(netlify.active).toBe(false);
    expect(() => netlify.context).toThrow('NetlifyContext was read outside a request');
    expect(() => netlify.waitUntil(Promise.resolve())).toThrow('NetlifyContext was read outside a request');
  });

  it("leaves compression to Netlify's CDN", async () => {
    const app = await createNetlifyApp();
    const handler = toServerlessHandler(app);

    expect(app.container.get(HttpServer).compressionEncodings.length).toBeGreaterThan(0);

    const response = await handler(request('/long', { headers: { 'accept-encoding': 'gzip, br' } }), {});

    expect(response.headers.get('content-encoding')).toBeNull();
    expect(await response.json()).toEqual({ text: LONG });
    expect(app.container.get(HttpServer).compressionEncodings).toEqual([]);
  });

  it('creates the application on the first request when given a function, once', async () => {
    const create = vi.fn(() => createNetlifyApp());
    const handler = toServerlessHandler(create);

    expect(create).not.toHaveBeenCalled();

    await Promise.all([handler(request('/where'), from('PL')), handler(request('/where'), from('DE'))]);
    await handler(request('/where'), from('FR'));

    expect(create).toHaveBeenCalledTimes(1);
  });

  it('tries again after an application that failed to start', async () => {
    const create = vi
      .fn<() => Promise<App>>()
      .mockRejectedValueOnce(new Error('database unreachable'))
      .mockImplementation(() => createNetlifyApp());
    const handler = toServerlessHandler(create);

    await expect(handler(request('/where'), {})).rejects.toThrow('database unreachable');
    expect((await handler(request('/where'), {})).status).toBe(200);
    expect(create).toHaveBeenCalledTimes(2);
  });
});
