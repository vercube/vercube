import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadRunner = vi.hoisted(() => vi.fn().mockResolvedValue({ name: 'node-worker' }));
const runnerCallbacks = vi.hoisted(() => ({
  onClose: undefined as ((runner: unknown, cause?: unknown) => void) | undefined,
  onReady: undefined as (() => void) | undefined,
}));

vi.mock('../src/dev', () => ({
  createFetchableDevEnvironment: vi.fn(() => ({ name: 'vercube' })),
}));
vi.mock('env-runner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('env-runner')>();
  return {
    ...actual,
    loadRunner,
    RunnerManager: class {
      reload = vi.fn().mockResolvedValue(undefined);
      sendMessage = vi.fn();
      onClose(cb: (runner: unknown, cause?: unknown) => void) {
        runnerCallbacks.onClose = cb;
      }
      onReady(cb: () => void) {
        runnerCallbacks.onReady = cb;
      }
    },
  };
});

import {
  createVercubeEnvironment,
  DEV_NO_EXTERNAL,
  getEnvRunner,
  initEnvRunner,
  reloadEnvRunner,
  isBareSpecifier,
} from '../src/env';
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
    routes: [],
    services: [],
    ...overrides,
  };
}

describe('isBareSpecifier', () => {
  it('classifies bare npm imports as external', () => {
    expect(isBareSpecifier('@vercube/core')).toBe(true);
    expect(isBareSpecifier('vite')).toBe(true);
  });

  it('keeps relative, absolute and virtual ids bundled', () => {
    expect(isBareSpecifier('./entry.ts')).toBe(false);
    expect(isBareSpecifier('/abs/entry.ts')).toBe(false);
    expect(isBareSpecifier('\0virtual:entry')).toBe(false);
  });
});

describe('createVercubeEnvironment', () => {
  it('externalizes bare deps in build and keeps the full graph in dev', () => {
    const devEnv = createVercubeEnvironment(ctx({ dev: true }));
    const prodEnv = createVercubeEnvironment(ctx({ dev: false }));

    expect(devEnv.resolve).toEqual({ noExternal: DEV_NO_EXTERNAL });
    expect(prodEnv.resolve).toEqual({});
    expect(devEnv.build?.outDir).toBe('/abs/dist');
    expect(devEnv.build?.rollupOptions?.input).toEqual({ index: '/abs/node_modules/.vercube/server-entry.mjs' });
    expect(devEnv.build?.rollupOptions?.external).toBe(isBareSpecifier);
  });

  it('registers fetchable environments and tracks their entries', async () => {
    const pluginCtx = ctx({
      _envRunner: { fetch: vi.fn(), init: vi.fn(), sendMessage: vi.fn() } as any,
    });
    const options = createVercubeEnvironment(pluginCtx);
    const env = await options.dev!.createEnvironment!('vercube', {} as any, {} as any);

    expect(env).toBeDefined();
    expect(pluginCtx._viteEnvs?.get('vercube')).toBe(pluginCtx.serverEntry);
  });
});

describe('initEnvRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.VERCUBE_DEV_RUNNER;
  });

  it('loads the worker runner and is idempotent', async () => {
    const pluginCtx = ctx();
    const first = await initEnvRunner(pluginCtx);
    const second = await initEnvRunner(pluginCtx);

    expect(first).toBe(second);
    expect(pluginCtx._envRunner).toBe(first);
    expect(loadRunner).toHaveBeenCalledOnce();
  });

  it('retries worker reloads and replays environment registrations on ready', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const pluginCtx = ctx({ _viteEnvs: new Map([['vercube', '/entry.mjs']]) });
    const manager = await initEnvRunner(pluginCtx);

    runnerCallbacks.onReady?.();
    expect(manager.sendMessage).toHaveBeenCalledWith({
      type: 'custom',
      event: 'vercube:vite-env',
      data: { name: 'vercube', entry: '/entry.mjs' },
    });

    runnerCallbacks.onClose?.({}, new Error('crash'));
    runnerCallbacks.onClose?.({}, new Error('crash'));
    runnerCallbacks.onClose?.({}, new Error('crash'));
    runnerCallbacks.onClose?.({}, new Error('crash'));
    expect(loadRunner.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('env runner failed after 3 retries'), expect.any(String));
    errorSpy.mockRestore();
  });

  it('allows re-initialization after a failed attempt', async () => {
    const pluginCtx = ctx();
    loadRunner.mockRejectedValueOnce(new Error('boom'));

    await expect(initEnvRunner(pluginCtx)).rejects.toThrow('boom');
    expect(pluginCtx._envRunner).toBeUndefined();

    const manager = await initEnvRunner(pluginCtx);
    expect(manager).toBeDefined();
    expect(pluginCtx._envRunner).toBe(manager);
  });
});

describe('reloadEnvRunner', () => {
  it('initializes the runner when it is missing', async () => {
    const pluginCtx = ctx();
    await reloadEnvRunner(pluginCtx);
    expect(pluginCtx._envRunner).toBeDefined();
  });

  it('reloads an already initialized runner', async () => {
    const pluginCtx = ctx();
    await initEnvRunner(pluginCtx);
    const reload = vi.mocked(pluginCtx._envRunner!.reload);
    const callsBefore = reload.mock.calls.length;

    await reloadEnvRunner(pluginCtx);

    expect(reload.mock.calls.length).toBe(callsBefore + 1);
  });
});

describe('getEnvRunner', () => {
  it('throws when the runner has not been initialized', () => {
    expect(() => getEnvRunner(ctx())).toThrow('[vercube] Env runner not initialized');
  });

  it('returns the initialized runner manager', () => {
    const runner = { close: () => {} } as NonNullable<VercubePluginContext['_envRunner']>;
    expect(getEnvRunner(ctx({ _envRunner: runner }))).toBe(runner);
  });
});

describe('VERCUBE_ENV', () => {
  it('uses the dedicated environment name', () => {
    expect(VERCUBE_ENV).toBe('vercube');
  });
});
