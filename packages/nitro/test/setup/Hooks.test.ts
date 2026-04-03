import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/validators/BundlerValidator', () => ({ validateBundler: vi.fn() }));
vi.mock('../../src/validators/TypescriptValidator', () => ({ validateTypescript: vi.fn() }));
vi.mock('../../src/setup/Routes', () => ({ setupRoutes: vi.fn() }));
vi.mock('../../src/helpers/helpers', () => ({ useVercubeApp: vi.fn() }));
vi.mock('@vercube/di', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vercube/di')>();
  return { ...actual, destroyContainer: vi.fn() };
});
vi.mock('chokidar', () => ({
  watch: vi.fn(() => ({ on: vi.fn().mockReturnThis(), close: vi.fn() })),
}));

import { destroyContainer } from '@vercube/di';
import { watch } from 'chokidar';
import { useVercubeApp } from '../../src/helpers/helpers';
import { setupHooks } from '../../src/setup/Hooks';
import { setupRoutes } from '../../src/setup/Routes';
import { validateBundler } from '../../src/validators/BundlerValidator';
import { validateTypescript } from '../../src/validators/TypescriptValidator';

function makeMockNitro(dev = false) {
  const hooks: Record<string, Function> = {};
  return {
    hooks: {
      hook: vi.fn((name: string, cb: Function) => {
        hooks[name] = cb;
      }),
      _hooks: hooks,
    },
    options: {
      dev,
      scanDirs: ['/tmp/test'],
      apiDir: 'api',
      routesDir: 'routes',
    },
    routing: { sync: vi.fn() },
  } as any;
}

describe('setupHooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should register build:before, compiled and close hooks', () => {
    const nitro = makeMockNitro();
    setupHooks(nitro);
    expect(nitro.hooks.hook).toHaveBeenCalledWith('build:before', expect.any(Function));
    expect(nitro.hooks.hook).toHaveBeenCalledWith('compiled', expect.any(Function));
    expect(nitro.hooks.hook).toHaveBeenCalledWith('close', expect.any(Function));
  });

  it('build:before hook should validate and setup routes', async () => {
    const nitro = makeMockNitro();
    setupHooks(nitro);
    await nitro.hooks._hooks['build:before']();
    expect(validateBundler).toHaveBeenCalledWith(nitro);
    expect(validateTypescript).toHaveBeenCalledWith(nitro);
    expect(setupRoutes).toHaveBeenCalledWith(nitro);
  });

  it('compiled hook should setup routes and sync routing', async () => {
    const nitro = makeMockNitro();
    setupHooks(nitro);
    await nitro.hooks._hooks['compiled']();
    expect(setupRoutes).toHaveBeenCalledWith(nitro);
    expect(nitro.routing.sync).toHaveBeenCalled();
  });

  it('close hook should destroy container when app is initialized', async () => {
    const mockApp = { container: {} };
    vi.mocked(useVercubeApp).mockReturnValue(mockApp as any);

    const nitro = makeMockNitro();
    setupHooks(nitro);
    await nitro.hooks._hooks['close']();
    expect(destroyContainer).toHaveBeenCalledWith(mockApp.container);
  });

  it('close hook should do nothing when app is not initialized', async () => {
    vi.mocked(useVercubeApp).mockReturnValue(undefined);

    const nitro = makeMockNitro();
    setupHooks(nitro);
    await nitro.hooks._hooks['close']();
    expect(destroyContainer).not.toHaveBeenCalled();
  });

  describe('dev mode watcher', () => {
    it('should set up file watcher in dev mode', () => {
      const nitro = makeMockNitro(true);
      setupHooks(nitro);
      expect(watch).toHaveBeenCalled();
    });

    it('should fall back to api/routes dir names when apiDir/routesDir are not set', () => {
      const nitro = makeMockNitro(true);
      nitro.options.apiDir = undefined;
      nitro.options.routesDir = undefined;
      setupHooks(nitro);
      const watchedDirs = vi.mocked(watch).mock.calls[0][0] as string[];
      expect(watchedDirs.some((d: string) => d.endsWith('api'))).toBe(true);
      expect(watchedDirs.some((d: string) => d.endsWith('routes'))).toBe(true);
    });

    it('should not set up file watcher in production mode', () => {
      const nitro = makeMockNitro(false);
      setupHooks(nitro);
      expect(watch).not.toHaveBeenCalled();
    });

    it('watcher change event should call compiled hook', async () => {
      const mockWatcher = { on: vi.fn().mockReturnThis(), close: vi.fn() };
      vi.mocked(watch).mockReturnValue(mockWatcher as any);

      const nitro = makeMockNitro(true);
      nitro.hooks.callHook = vi.fn();
      setupHooks(nitro);

      const onChangeCb = mockWatcher.on.mock.calls[0][1];
      await onChangeCb();
      expect(nitro.hooks.callHook).toHaveBeenCalledWith('compiled', nitro);
    });

    it('close hook should stop the watcher in dev mode', async () => {
      const mockWatcher = { on: vi.fn().mockReturnThis(), close: vi.fn() };
      vi.mocked(watch).mockReturnValue(mockWatcher as any);
      vi.mocked(useVercubeApp).mockReturnValue(undefined);

      const nitro = makeMockNitro(true);
      setupHooks(nitro);

      const closeCallbacks = nitro.hooks.hook.mock.calls
        .filter(([name]: [string]) => name === 'close')
        .map(([, cb]: [string, Function]) => cb);

      for (const cb of closeCallbacks) await cb();
      expect(mockWatcher.close).toHaveBeenCalled();
    });
  });
});
