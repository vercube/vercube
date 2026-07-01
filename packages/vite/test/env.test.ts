import { resolve } from 'pathe';
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
  createProdExternal,
  createVercubeEnvironment,
  createVercubeResolveAliases,
  DEFAULT_NO_EXTERNAL,
  DEV_NO_EXTERNAL,
  extractPackageName,
  getEnvRunner,
  initEnvRunner,
  reloadEnvRunner,
  isBareSpecifier,
  isFromBundledPackage,
  matchesNoExternal,
  resolveDevNoExternal,
  resolveNoExternalPatterns,
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

  it('bundles Vite path aliases and transform helper runtimes', () => {
    expect(isBareSpecifier('@/api/config/ApiContainer')).toBe(false);
    expect(isBareSpecifier('@oxc-project/runtime/helpers/decorate')).toBe(false);
  });
});

describe('resolveNoExternalPatterns', () => {
  it('returns defaults when no extra patterns are configured', () => {
    expect(resolveNoExternalPatterns()).toBe(DEFAULT_NO_EXTERNAL);
    expect(resolveNoExternalPatterns([])).toBe(DEFAULT_NO_EXTERNAL);
    expect(resolveDevNoExternal()).toBe(DEV_NO_EXTERNAL);
  });

  it('appends plugin patterns after the built-in defaults', () => {
    const extra = [/^@org\//, '@my-org/shared'];
    expect(resolveNoExternalPatterns(extra)).toEqual([...DEFAULT_NO_EXTERNAL, ...extra]);
  });
});

describe('matchesNoExternal', () => {
  it('matches string and RegExp patterns', () => {
    const patterns = [/^@vercube\//, '@enp/common'];
    expect(matchesNoExternal('@vercube/core', patterns)).toBe(true);
    expect(matchesNoExternal('@enp/common', patterns)).toBe(true);
    expect(matchesNoExternal('@enp/common/foo', patterns)).toBe(true);
    expect(matchesNoExternal('zod', patterns)).toBe(false);
  });
});

describe('extractPackageName', () => {
  it('parses scoped and unscoped package paths', () => {
    expect(extractPackageName('/app/node_modules/@vercube/core/dist/index.mjs')).toBe('@vercube/core');
    expect(extractPackageName('/app/node_modules/srvx/dist/index.mjs')).toBe('srvx');
    expect(extractPackageName('/app/src/api/Foo.ts')).toBeNull();
  });
});

describe('isFromBundledPackage', () => {
  it('detects imports originating from bundled packages', () => {
    const patterns = resolveNoExternalPatterns([/^@enp\//]);
    const importer = '/app/node_modules/@vercube/core/dist/index.mjs';

    expect(isFromBundledPackage(importer, patterns)).toBe(true);
    expect(isFromBundledPackage('/app/node_modules/zod/index.js', patterns)).toBe(false);
    expect(isFromBundledPackage('/app/src/api/Foo.ts', patterns)).toBe(false);
  });
});

describe('createProdExternal', () => {
  it('bundles framework, plugin packages, and their transitive dependencies', () => {
    const external = createProdExternal([/^@enp\//]);
    const vercubeImporter = '/app/node_modules/@vercube/core/dist/index.mjs';
    const enpImporter = '/app/node_modules/@enp/auth/dist/Plugins/Vercube.mjs';
    const appImporter = '/app/src/api/service/Foo.ts';

    expect(external('@vercube/core')).toBe(false);
    expect(external('@enp/auth/plugins/vercube')).toBe(false);
    expect(external('@/api/service/Foo')).toBe(false);
    expect(external('srvx', vercubeImporter)).toBe(false);
    expect(external('srvx')).toBe(false);
    expect(external('rou3')).toBe(false);
    expect(external('jose', enpImporter)).toBe(false);
    expect(external('zod', appImporter)).toBe(true);
    expect(external('mysql2/promise', appImporter)).toBe(true);
  });
});

describe('resolveDevNoExternal', () => {
  it('is an alias for resolveNoExternalPatterns', () => {
    const extra = [/^@org\//];
    expect(resolveDevNoExternal(extra)).toEqual(resolveNoExternalPatterns(extra));
  });
});

describe('createVercubeResolveAliases', () => {
  it('resolves installed @vercube packages from the app root', () => {
    const aliases = createVercubeResolveAliases(resolve(process.cwd(), '../..'));

    expect(aliases['@vercube/core']).toContain('packages/core');
    expect(aliases['@vercube/di']).toContain('packages/di');
  });
});

describe('createVercubeEnvironment', () => {
  it('externalizes bare deps in build and keeps the full graph in dev', () => {
    const devEnv = createVercubeEnvironment(ctx({ dev: true }));
    const prodEnv = createVercubeEnvironment(ctx({ dev: false }));

    expect(devEnv.resolve).toEqual({ noExternal: DEFAULT_NO_EXTERNAL });
    expect(prodEnv.resolve).toEqual({});
    expect(devEnv.build?.rollupOptions?.external).toBe(isBareSpecifier);
    expect(prodEnv.build?.rollupOptions?.external).toBe(isBareSpecifier);
  });

  it('merges plugin noExternal patterns in dev', () => {
    const extra = [/^@org\//];
    const devEnv = createVercubeEnvironment(
      ctx({
        dev: true,
        pluginConfig: { noExternal: extra },
      }),
    );

    expect(devEnv.resolve).toEqual({ noExternal: [...DEFAULT_NO_EXTERNAL, ...extra] });
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
