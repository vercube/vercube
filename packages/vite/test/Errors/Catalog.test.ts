import { getErrorGuidance } from '@vercube/core';
import { describe, expect, it, vi } from 'vitest';
import { getEnvRunner } from '../../src/env';
import { ViteErrors } from '../../src/Errors/Catalog';
import { buildEnvironments } from '../../src/prod';
import type { VercubePluginContext } from '../../src/types';

vi.mock('env-runner/vite', () => ({ createViteTransport: vi.fn(() => ({})) }));
vi.mock('vite/module-runner', () => ({ ESModulesEvaluator: class {}, ModuleRunner: class {} }));

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

describe('the errors of the Vite plugin', () => {
  it('describes a build without the vercube environment', async () => {
    const error = await buildEnvironments(ctx(), { environments: {} } as any).then(
      () => undefined,
      (error_: Error) => error_,
    );

    expect(error!.constructor).toBe(Error);
    expect(error!.message).toBe('[vercube] Environment "vercube" is not configured.');
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_VITE_ENVIRONMENT_NOT_CONFIGURED');
    expect(getErrorGuidance(error)?.link).toBe(
      'https://vercube.dev/docs/core-features/errors#vercube_vite_environment_not_configured',
    );
    expect(Object.keys(error!)).toEqual([]);
  });

  it('describes a runner that was not started', () => {
    let error: Error | undefined;

    try {
      getEnvRunner(ctx());
    } catch (error_) {
      error = error_ as Error;
    }

    expect(error!.constructor).toBe(Error);
    expect(error!.message).toBe('[vercube] Env runner not initialized. Call initEnvRunner() first.');
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_VITE_ENV_RUNNER_NOT_INITIALIZED');
  });

  it('answers a request for an unknown environment as before', async () => {
    const { fetch } = await import('../../src/runtime/dev-worker');
    const response = await fetch(new Request('http://localhost/', { headers: { 'x-vite-env': 'ghost' } }));

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ status: 500, message: 'Unknown vite environment "ghost"' });
  });

  it('keeps the TypeError of a build that reports no routes', () => {
    const error = ViteErrors.ROUTES_NOT_REPORTED();

    expect(error).toBeInstanceOf(TypeError);
    expect(error.message).toBe('The application did not report its routes');
    expect(getErrorGuidance(error)?.code).toBe('VERCUBE_VITE_ROUTES_NOT_REPORTED');
  });
});
