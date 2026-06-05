import { beforeEach, describe, expect, it, vi } from 'vitest';

const moduleImport = vi.hoisted(() => vi.fn());

vi.mock('env-runner/vite', () => ({
  createViteTransport: vi.fn(() => ({})),
}));
vi.mock('vite/module-runner', () => ({
  ESModulesEvaluator: class {},
  ModuleRunner: class {
    import = moduleImport;
  },
}));

type DevWorker = typeof import('../src/runtime/dev-worker');

describe('dev-worker', () => {
  let worker: DevWorker;

  beforeEach(async () => {
    vi.resetModules();
    moduleImport.mockReset();
    worker = await import('../src/runtime/dev-worker');
  });

  it('returns an error for unknown environments', async () => {
    const response = await worker.fetch(new Request('http://localhost', { headers: { 'x-vite-env': 'missing' } }));
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ message: expect.stringContaining('Unknown vite environment') });
  });

  it('dispatches requests through a registered environment entry', async () => {
    moduleImport.mockResolvedValue({
      fetch: async () =>
        new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    });

    worker.ipc.onOpen({ sendMessage: vi.fn() });
    worker.ipc.onMessage({
      type: 'custom',
      event: 'vercube:vite-env',
      data: { name: 'vercube', entry: '/entry.mjs' },
    });

    await vi.waitFor(() => expect(moduleImport).toHaveBeenCalledWith('/entry.mjs'));

    const response = await worker.fetch(new Request('http://localhost/api/hello'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('surfaces import and handler errors as JSON 500 responses', async () => {
    moduleImport.mockRejectedValueOnce(new Error('load failed'));
    worker.ipc.onOpen({ sendMessage: vi.fn() });
    worker.ipc.onMessage({
      type: 'custom',
      event: 'vercube:vite-env',
      data: { name: 'broken', entry: '/broken.mjs' },
    });

    await vi.waitFor(() => expect(moduleImport).toHaveBeenCalled());

    const response = await worker.fetch(new Request('http://localhost', { headers: { 'x-vite-env': 'broken' } }));
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ message: 'load failed' });
  });

  it('forwards websocket upgrades to the Vercube environment', async () => {
    const handleUpgrade = vi.fn();
    moduleImport.mockResolvedValue({ handleUpgrade });

    worker.ipc.onOpen({ sendMessage: vi.fn() });
    worker.ipc.onMessage({
      type: 'custom',
      event: 'vercube:vite-env',
      data: { name: 'vercube', entry: '/entry.mjs' },
    });
    await vi.waitFor(() => expect(moduleImport).toHaveBeenCalledWith('/entry.mjs'));

    const node = { req: {}, socket: {}, head: Buffer.from('') };
    worker.upgrade({ node } as any);
    await vi.waitFor(() => expect(handleUpgrade).toHaveBeenCalledWith(node.req, node.socket, node.head));
  });

  it('reloads every environment on full-reload messages', async () => {
    moduleImport.mockResolvedValue({ fetch: async () => new Response('v1') });
    worker.ipc.onOpen({ sendMessage: vi.fn() });
    worker.ipc.onMessage({
      type: 'custom',
      event: 'vercube:vite-env',
      data: { name: 'reload-env', entry: '/reload.mjs' },
    });
    await vi.waitFor(() => expect(moduleImport).toHaveBeenCalledTimes(1));

    moduleImport.mockResolvedValue({ fetch: async () => new Response('v2') });
    worker.ipc.onMessage({ type: 'full-reload' });
    await vi.waitFor(() => expect(moduleImport).toHaveBeenCalledTimes(2));
  });
});
