import { describe, expect, it } from 'vitest';
import { createVercubeEnvironment, getEnvRunner, isBareSpecifier } from '../src/env';
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

    expect(devEnv.resolve).toEqual({ noExternal: true });
    expect(prodEnv.resolve).toEqual({});
    expect(devEnv.build?.outDir).toBe('/abs/dist');
    expect(devEnv.build?.rollupOptions?.input).toEqual({ index: '/abs/node_modules/.vercube/server-entry.mjs' });
    expect(devEnv.build?.rollupOptions?.external?.('@vercube/core')).toBe(true);
    expect(devEnv.build?.rollupOptions?.external?.('./local.ts')).toBe(false);
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
