import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const scanProject = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const watchHandlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => void>());
const watcherClose = vi.hoisted(() => vi.fn());

vi.mock('chokidar', () => ({
  watch: vi.fn(() => ({
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      watchHandlers.set(event, cb);
      return { on: vi.fn(), close: watcherClose };
    }),
    close: watcherClose,
  })),
}));
vi.mock('srvx/node', () => ({
  NodeRequest: class {
    constructor(_opts: unknown) {}
  },
  sendNodeResponse: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('env-runner/vite', () => ({
  createViteHotChannel: vi.fn(() => ({})),
}));
vi.mock('../src/context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/context')>();
  return { ...actual, scanProject };
});
vi.mock('vite', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vite')>();
  return {
    ...actual,
    DevEnvironment: class {
      name: string;
      config: unknown;
      constructor(name: string, config: unknown) {
        this.name = name;
        this.config = config;
      }
      async init() {}
    },
  };
});

import { configureViteDevServer, createFetchableDevEnvironment, FetchableDevEnvironment } from '../src/dev';
import { VERCUBE_ENV } from '../src/types';
import type { VercubePluginContext } from '../src/types';

function ctx(overrides: Partial<VercubePluginContext> = {}): VercubePluginContext {
  return {
    pluginConfig: {},
    root: '/abs',
    scanDirs: ['/abs/src'],
    serverEntry: '/abs/node_modules/.vercube/server-entry.mjs',
    dev: true,
    hasClient: false,
    controllers: [],
    routes: [
      { route: '/api/hello', method: 'GET', import: '', importClassName: 'HelloController', fullPath: '', path: '', params: [] },
    ],
    services: [],
    ...overrides,
  };
}

describe('FetchableDevEnvironment', () => {
  it('dispatches fetch requests into the worker and announces its entry on init', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('ok'));
    const init = vi.fn();
    const sendMessage = vi.fn();
    const devServer = { fetch, init, sendMessage, onMessage: vi.fn(), offMessage: vi.fn() };

    const env = createFetchableDevEnvironment(VERCUBE_ENV, {} as any, devServer, '/entry.mjs');
    await env.dispatchFetch(new Request('http://localhost/api/hello'));
    await env.init();

    expect(fetch).toHaveBeenCalledOnce();
    expect(init).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'custom',
      event: 'vercube:vite-env',
      data: { name: VERCUBE_ENV, entry: '/entry.mjs' },
    });
    expect(env).toBeInstanceOf(FetchableDevEnvironment);
  });
});

describe('configureViteDevServer', () => {
  let middleware: (req: { url?: string }, res: Record<string, unknown>, next: (error?: unknown) => void) => Promise<void>;
  let upgradeHandler: (req: { headers: Record<string, string | string[] | undefined> }, socket: unknown, head: unknown) => void;
  let closeHandler: () => void;
  let dispatchFetch: ReturnType<typeof vi.fn>;
  let envRunnerClose: ReturnType<typeof vi.fn>;
  let envRunnerUpgrade: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    dispatchFetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    envRunnerClose = vi.fn();
    envRunnerUpgrade = vi.fn();

    const httpServer = {
      once: vi.fn((event: string, cb: () => void) => {
        if (event === 'close') closeHandler = cb;
      }),
      on: vi.fn((event: string, cb: typeof upgradeHandler) => {
        if (event === 'upgrade') upgradeHandler = cb;
      }),
    };

    const env = {
      dispatchFetch,
      moduleGraph: { invalidateAll: vi.fn() },
      hot: { send: vi.fn() },
    };

    watchHandlers.clear();
    watcherClose.mockClear();

    configureViteDevServer(ctx({ _envRunner: { close: envRunnerClose, upgrade: envRunnerUpgrade } as any }), {
      environments: { [VERCUBE_ENV]: env },
      middlewares: {
        use: vi.fn((fn) => {
          middleware = fn;
        }),
      },
      httpServer,
    } as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('forwards only matching API routes to the worker', async () => {
    const next = vi.fn();
    const res = { writableEnded: false, headersSent: false, writeHead: vi.fn(), end: vi.fn() };

    await middleware({ url: '/api/hello' }, res, next);
    expect(dispatchFetch).toHaveBeenCalledOnce();
    expect(next).not.toHaveBeenCalled();

    dispatchFetch.mockClear();
    await middleware({ url: '/' }, res, next);
    expect(dispatchFetch).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it('matches routes with params and trailing slashes', async () => {
    const next = vi.fn();
    const res = { writableEnded: false, headersSent: false, writeHead: vi.fn(), end: vi.fn() };
    const pluginCtx = ctx({
      routes: [
        {
          route: '/api/users/:id',
          method: 'GET',
          import: '',
          importClassName: 'UserController',
          fullPath: '',
          path: '',
          params: ['id'],
        },
      ],
    });

    await configureViteDevServer(pluginCtx, {
      environments: { [VERCUBE_ENV]: { dispatchFetch, moduleGraph: { invalidateAll: vi.fn() }, hot: { send: vi.fn() } } },
      middlewares: {
        use: vi.fn((fn) => {
          middleware = fn;
        }),
      },
      httpServer: { once: vi.fn(), on: vi.fn() },
    } as any);

    await middleware({ url: '/api/users/42/' }, res, next);
    expect(dispatchFetch).toHaveBeenCalledOnce();
  });

  it('passes middleware errors to next', async () => {
    dispatchFetch.mockRejectedValueOnce(new Error('boom'));
    const next = vi.fn();
    const res = { writableEnded: false, headersSent: false };

    await middleware({ url: '/api/hello' }, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('forwards websocket upgrades except Vite HMR sockets', () => {
    const socket = {};
    const head = Buffer.from('');

    upgradeHandler({ headers: { 'sec-websocket-protocol': 'vite-hmr' } }, socket, head);
    expect(envRunnerUpgrade).not.toHaveBeenCalled();

    upgradeHandler({ headers: {} }, socket, head);
    expect(envRunnerUpgrade).toHaveBeenCalledWith({ node: { req: expect.any(Object), socket, head } });
  });

  it('re-scans on file add/remove and closes watchers with the HTTP server', async () => {
    vi.useFakeTimers();
    const reload = watchHandlers.get('all')!;

    reload('add', '/abs/src/NewController.ts');
    await vi.advanceTimersByTimeAsync(60);
    expect(scanProject).toHaveBeenCalled();

    closeHandler();
    expect(watcherClose).toHaveBeenCalled();
    expect(envRunnerClose).toHaveBeenCalled();
  });
});
