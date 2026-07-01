import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const serveStatic = vi.hoisted(() => vi.fn(() => 'static-middleware'));

vi.mock('srvx/static', () => ({
  serveStatic,
}));

import { serveStaticFiles, withSpaFallback } from '../../src/Common/ServeStatic';

describe('serveStaticFiles', () => {
  it('registers srvx static middleware on the server', () => {
    const server = { options: {} as { middleware?: unknown[] } };
    serveStaticFiles('/abs/public')(server as any);

    expect(serveStatic).toHaveBeenCalledWith({ dir: '/abs/public' });
    expect(server.options.middleware).toEqual(['static-middleware']);
  });

  it('appends to an existing middleware stack', () => {
    const server = { options: { middleware: ['existing'] as unknown[] } };
    serveStaticFiles('/abs/public')(server as any);

    expect(server.options.middleware).toEqual(['existing', 'static-middleware']);
  });
});

describe('withSpaFallback', () => {
  let publicDir: string;

  afterEach(() => {
    if (publicDir) {
      rmSync(publicDir, { recursive: true, force: true });
    }
  });

  it('serves index.html for unmatched frontend navigations', async () => {
    publicDir = join(tmpdir(), `vercube-spa-${Date.now()}`);
    mkdirSync(publicDir, { recursive: true });
    writeFileSync(join(publicDir, 'index.html'), '<html>spa</html>');

    const fetch = vi.fn().mockResolvedValue(new Response('missing', { status: 404 }));
    const response = await withSpaFallback(fetch, publicDir)(new Request('http://localhost/test'));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('<html>spa</html>');
  });

  it('keeps API 404 responses for JSON clients', async () => {
    publicDir = join(tmpdir(), `vercube-spa-${Date.now()}`);
    mkdirSync(publicDir, { recursive: true });
    writeFileSync(join(publicDir, 'index.html'), '<html>spa</html>');

    const api404 = new Response('missing', { status: 404 });
    const fetch = vi.fn().mockResolvedValue(api404);
    const response = await withSpaFallback(
      fetch,
      publicDir,
    )(new Request('http://localhost/api/missing', { headers: { Accept: 'application/json' } }));

    expect(response).toBe(api404);
  });

  it('passes through successful responses unchanged', async () => {
    publicDir = join(tmpdir(), `vercube-spa-${Date.now()}`);
    mkdirSync(publicDir, { recursive: true });

    const ok = new Response('{"ok":true}', { status: 200 });
    const fetch = vi.fn().mockResolvedValue(ok);
    const response = await withSpaFallback(fetch, publicDir)(new Request('http://localhost/api/hello'));

    expect(response).toBe(ok);
  });

  it('does not rewrite missing asset requests', async () => {
    publicDir = join(tmpdir(), `vercube-spa-${Date.now()}`);
    mkdirSync(publicDir, { recursive: true });
    writeFileSync(join(publicDir, 'index.html'), '<html>spa</html>');

    const asset404 = new Response('missing', { status: 404 });
    const fetch = vi.fn().mockResolvedValue(asset404);
    const response = await withSpaFallback(fetch, publicDir)(new Request('http://localhost/assets/app.js'));

    expect(response).toBe(asset404);
  });
});
