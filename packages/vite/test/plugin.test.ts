import { beforeEach, describe, expect, it, vi } from 'vitest';

const setupContext = vi.hoisted(() =>
  vi.fn(async (ctx: { dev: boolean; root: string }, options: { root: string; dev: boolean }) => {
    ctx.root = options.root;
    ctx.dev = options.dev;
  }),
);
const initEnvRunner = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const buildEnvironments = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const configureViteDevServer = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('../src/context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/context')>();
  return { ...actual, setupContext };
});
vi.mock('../src/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/env')>();
  return { ...actual, initEnvRunner };
});
vi.mock('../src/prod', () => ({ buildEnvironments }));
vi.mock('../src/dev', () => ({ configureViteDevServer }));

import { vercube } from '../src/plugin';
import { VERCUBE_ENV } from '../src/types';

function hook<T extends (...args: never[]) => unknown>(value: T | { handler: T } | undefined): T {
  if (!value) {
    throw new Error('Expected plugin hook to be defined');
  }
  return typeof value === 'function' ? value : value.handler;
}

describe('vercube plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns main and resolve-dedupe sub-plugins', () => {
    const plugins = vercube();
    expect(plugins).toHaveLength(2);
    expect(plugins[0].name).toBe('vercube:main');
    expect(plugins[1].name).toBe('vercube:resolve-dedupe');
  });

  it('configures environments on first config call and warms the runner in dev', async () => {
    const [plugin] = vercube({ scanDirs: ['src'] });
    const result = await hook(plugin.config).call({} as any, { root: '/proj', vercube: { runner: 'node-worker' } }, {
      command: 'serve',
    } as any);

    expect(setupContext).toHaveBeenCalledWith(expect.any(Object), { root: '/proj', dev: true });
    expect(initEnvRunner).toHaveBeenCalledOnce();
    expect(result?.environments?.[VERCUBE_ENV]).toBeDefined();
    expect(result?.environments?.client?.build?.outDir).toContain('dist/public');
    expect(result?.builder).toEqual({ sharedConfigBuild: true });
  });

  it('skips the env runner during build and initializes only once', async () => {
    const [plugin] = vercube();

    await hook(plugin.config).call({} as any, { root: '/proj' }, { command: 'build' } as any);
    await hook(plugin.config).call({} as any, { root: '/proj' }, { command: 'build' } as any);

    expect(initEnvRunner).not.toHaveBeenCalled();
    expect(setupContext).toHaveBeenCalledOnce();
  });

  it('delegates production builds to buildEnvironments', async () => {
    const [plugin] = vercube();
    const builder = { environments: {} };

    await hook(plugin.buildApp).call({} as any, builder as any);

    expect(buildEnvironments).toHaveBeenCalledWith(expect.any(Object), builder);
  });

  it('wires the dev server middleware', async () => {
    const [plugin] = vercube();
    const server = { environments: {} };

    await hook(plugin.configureServer).call({} as any, server as any);

    expect(configureViteDevServer).toHaveBeenCalledWith(expect.any(Object), server);
  });

  it('forces a full reload for the Vercube environment on hot updates', () => {
    const [plugin] = vercube();
    const invalidateAll = vi.fn();
    const send = vi.fn();

    hook(plugin.hotUpdate).call(
      { environment: { name: VERCUBE_ENV, moduleGraph: { invalidateAll }, hot: { send } } } as any,
      {} as any,
    );

    expect(invalidateAll).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith({ type: 'full-reload' });
  });

  it('ignores hot updates from other environments', () => {
    const [plugin] = vercube();
    const invalidateAll = vi.fn();

    hook(plugin.hotUpdate).call(
      { environment: { name: 'client', moduleGraph: { invalidateAll }, hot: { send: vi.fn() } } } as any,
      {} as any,
    );

    expect(invalidateAll).not.toHaveBeenCalled();
  });
});
