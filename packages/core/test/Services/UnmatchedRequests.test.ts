import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { BaseMiddleware, Controller, createApp, Get, GlobalMiddlewareRegistry } from '../../src';
import type { App } from '../../src';

const order: string[] = [];

class CorsMiddleware extends BaseMiddleware {
  public override onRequest(_request: Request, response: Response): void {
    order.push('cors');
    response.headers.set('access-control-allow-origin', '*');
  }
}

class FirstMiddleware extends BaseMiddleware {
  public override onRequest(): void {
    order.push('first');
  }
}

class LateMiddleware extends BaseMiddleware {
  public override onRequest(_request: Request, response: Response): void {
    order.push('late');
    response.headers.set('x-late', 'yes');
  }
}

@Controller('/t')
class UnmatchedController {
  @Get('/ok')
  public ok() {
    return { ok: true };
  }
}

const dir = mkdtempSync(join(tmpdir(), 'vercube-static-'));
writeFileSync(join(dir, 'file.txt'), 'hello');

afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function boot(): Promise<App> {
  const app = await createApp({
    cfg: { requestLogging: false, server: { static: { dirs: [relative(process.cwd(), dir)], etag: true } } },
    setup: (app) => {
      const registry = app.container.get(GlobalMiddlewareRegistry);
      registry.registerGlobalMiddleware(CorsMiddleware, { target: '__global__', priority: 10 });
      registry.registerGlobalMiddleware(FirstMiddleware, { target: '__global__', priority: 1 });
      app.container.bind(UnmatchedController);
    },
  });

  return app;
}

describe('requests no route handles', () => {
  it('should run global middlewares on a 404', async () => {
    const app = await boot();

    const response = await app.fetch(new Request('http://localhost/nope'));

    expect(response.status).toBe(404);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('should answer a wrong method with 405 and Allow', async () => {
    const app = await boot();

    const response = await app.fetch(new Request('http://localhost/t/ok', { method: 'DELETE' }));

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, HEAD');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('should answer a preflight with 204, no body, no content type, middlewares by priority', async () => {
    const app = await boot();
    order.length = 0;

    const response = await app.fetch(new Request('http://localhost/t/ok', { method: 'OPTIONS' }));

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(response.headers.get('content-type')).toBeNull();
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(order).toEqual(['first', 'cors']);
  });

  it('should run a global middleware registered after the first preflight', async () => {
    const app = await boot();

    await app.fetch(new Request('http://localhost/t/ok', { method: 'OPTIONS' }));
    app.container.get(GlobalMiddlewareRegistry).registerGlobalMiddleware(LateMiddleware);

    const response = await app.fetch(new Request('http://localhost/t/ok', { method: 'OPTIONS' }));

    expect(response.headers.get('x-late')).toBe('yes');
  });

  it('should serve static files through global middlewares, with HEAD and 304', async () => {
    const app = await boot();

    const get = await app.fetch(new Request('http://localhost/file.txt'));
    expect(get.status).toBe(200);
    expect(await get.text()).toBe('hello');
    expect(get.headers.get('access-control-allow-origin')).toBe('*');

    const head = await app.fetch(new Request('http://localhost/file.txt', { method: 'HEAD' }));
    expect(head.status).toBe(200);
    expect(head.headers.get('content-length')).toBe('5');
    expect(await head.text()).toBe('');

    const etag = get.headers.get('etag')!;
    const cached = await app.fetch(new Request('http://localhost/file.txt', { headers: { 'if-none-match': etag } }));
    expect(cached.status).toBe(304);
    expect(await cached.text()).toBe('');

    const listed = await app.fetch(
      new Request('http://localhost/file.txt', { headers: { 'if-none-match': `"other", ${etag.slice(2)}` } }),
    );
    expect(listed.status).toBe(304);

    const any = await app.fetch(new Request('http://localhost/file.txt', { headers: { 'if-none-match': '*' } }));
    expect(any.status).toBe(304);

    const stale = await app.fetch(new Request('http://localhost/file.txt', { headers: { 'if-none-match': '"other"' } }));
    expect(stale.status).toBe(200);
  });
});
