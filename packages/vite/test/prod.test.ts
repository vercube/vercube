import { describe, expect, it, vi } from 'vitest';
import { buildEnvironments } from '../src/prod';
import { VERCUBE_ENV } from '../src/types';
import type { VercubePluginContext } from '../src/types';

function ctx(): VercubePluginContext {
  return {
    pluginConfig: {},
    root: '/abs',
    scanDirs: ['/abs/src'],
    serverEntry: '/abs/node_modules/.vercube/server-entry.mjs',
    dev: false,
    hasClient: false,
    controllers: [],
    routes: [],
    services: [],
  };
}

describe('buildEnvironments', () => {
  it('throws when the Vercube environment is missing', async () => {
    await expect(buildEnvironments(ctx(), { environments: {} } as any)).rejects.toThrow(
      `[vercube] Environment "${VERCUBE_ENV}" is not configured.`,
    );
  });

  it('builds other environments before the Vercube server environment', async () => {
    const build = vi.fn().mockResolvedValue(undefined);
    const clientEnv = {
      config: { consumer: 'client', build: { rollupOptions: { input: { main: 'index.html' } } } },
    };
    const serverEnv = { config: { consumer: 'server', build: { rollupOptions: { input: { index: 'entry.mjs' } } } } };
    const builder = {
      environments: { client: clientEnv, [VERCUBE_ENV]: serverEnv },
      build,
    };

    await buildEnvironments(ctx(), builder as any);

    expect(build).toHaveBeenCalledTimes(2);
    expect(build.mock.calls[0][0]).toBe(clientEnv);
    expect(build.mock.calls[1][0]).toBe(serverEnv);
  });
});
