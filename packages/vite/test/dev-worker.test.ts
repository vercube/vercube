import { beforeEach, describe, expect, it, vi } from 'vitest';

const moduleImport = vi.hoisted(() => vi.fn());
const registerTransportListener = vi.hoisted(() => {
  let register: ((listener: (message: unknown) => void) => void) | undefined;
  return {
    set(fn: (listener: (message: unknown) => void) => void) {
      register = fn;
    },
    add(listener: (message: unknown) => void) {
      register?.(listener);
    },
  };
});

vi.mock('env-runner/vite', () => ({
  createViteTransport: vi.fn((_send, onRegister: (listener: (message: unknown) => void) => void) => {
    registerTransportListener.set(onRegister);
    return {};
  }),
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
    process.setMaxListeners(50);
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

  it('uses a default export fetch handler when no named export exists', async () => {
    moduleImport.mockResolvedValue({
      default: { fetch: async () => new Response('from-default') },
    });

    worker.ipc.onOpen({ sendMessage: vi.fn() });
    worker.ipc.onMessage({
      type: 'custom',
      event: 'vercube:vite-env',
      data: { name: 'default-env', entry: '/default.mjs' },
    });
    await vi.waitFor(() => expect(moduleImport).toHaveBeenCalled());

    const response = await worker.fetch(new Request('http://localhost', { headers: { 'x-vite-env': 'default-env' } }));
    expect(await response.text()).toBe('from-default');
  });

  it('returns an error when the entry exports no fetch handler', async () => {
    moduleImport.mockResolvedValue({});

    worker.ipc.onOpen({ sendMessage: vi.fn() });
    worker.ipc.onMessage({
      type: 'custom',
      event: 'vercube:vite-env',
      data: { name: 'empty-env', entry: '/empty.mjs' },
    });
    await vi.waitFor(() => expect(moduleImport).toHaveBeenCalled());

    const response = await worker.fetch(new Request('http://localhost', { headers: { 'x-vite-env': 'empty-env' } }));
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      message: expect.stringContaining('No fetch handler exported from /empty.mjs'),
    });
  });

  it('returns an error when the fetch handler throws', async () => {
    moduleImport.mockResolvedValue({
      fetch: async () => {
        throw new Error('handler crash');
      },
    });

    worker.ipc.onOpen({ sendMessage: vi.fn() });
    worker.ipc.onMessage({
      type: 'custom',
      event: 'vercube:vite-env',
      data: { name: 'throws-env', entry: '/throws.mjs' },
    });
    await vi.waitFor(() => expect(moduleImport).toHaveBeenCalled());

    const response = await worker.fetch(new Request('http://localhost', { headers: { 'x-vite-env': 'throws-env' } }));
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ message: 'handler crash' });
  });

  it('waits for a still-loading entry before dispatching fetch', async () => {
    vi.useFakeTimers();
    let resolveImport!: (value: unknown) => void;
    moduleImport.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveImport = resolve;
        }),
    );

    worker.ipc.onOpen({ sendMessage: vi.fn() });
    worker.ipc.onMessage({
      type: 'custom',
      event: 'vercube:vite-env',
      data: { name: 'slow-env', entry: '/slow.mjs' },
    });

    const responsePromise = worker.fetch(new Request('http://localhost', { headers: { 'x-vite-env': 'slow-env' } }));

    resolveImport({ fetch: async () => new Response('late') });
    await vi.advanceTimersByTimeAsync(100);

    const response = await responsePromise;
    expect(await response.text()).toBe('late');
    vi.useRealTimers();
  });

  it('no-ops upgrades without node context or a handleUpgrade export', async () => {
    moduleImport.mockResolvedValue({});
    worker.ipc.onOpen({ sendMessage: vi.fn() });
    worker.ipc.onMessage({
      type: 'custom',
      event: 'vercube:vite-env',
      data: { name: 'vercube', entry: '/entry.mjs' },
    });
    await vi.waitFor(() => expect(moduleImport).toHaveBeenCalled());

    expect(() => worker.upgrade({} as any)).not.toThrow();
  });

  it('includes error stacks in JSON error responses', async () => {
    const error = new Error('with stack');
    moduleImport.mockRejectedValueOnce(error);

    worker.ipc.onOpen({ sendMessage: vi.fn() });
    worker.ipc.onMessage({
      type: 'custom',
      event: 'vercube:vite-env',
      data: { name: 'stack-env', entry: '/stack.mjs' },
    });
    await vi.waitFor(() => expect(moduleImport).toHaveBeenCalled());

    const response = await worker.fetch(new Request('http://localhost', { headers: { 'x-vite-env': 'stack-env' } }));
    const body = await response.json();
    expect(body.stack).toBeTypeOf('object');
    expect(body.message).toBe('with stack');
  });

  it('relays transport messages to registered listeners and supports onClose', async () => {
    worker.ipc.onOpen({ sendMessage: vi.fn() });
    worker.ipc.onMessage({
      type: 'custom',
      event: 'vercube:vite-env',
      data: { name: 'relay-env', entry: '/relay.mjs' },
    });
    await vi.waitFor(() => expect(moduleImport).toHaveBeenCalled());

    const listener = vi.fn();
    registerTransportListener.add(listener);

    const payload = { type: 'update', file: '/changed.ts' };
    worker.ipc.onMessage(payload);
    expect(listener).toHaveBeenCalledWith(payload);

    expect(() => worker.ipc.onClose()).not.toThrow();
  });
});
