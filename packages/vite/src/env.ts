import { loadRunner, RunnerManager } from 'env-runner';
import { isAbsolute, resolve } from 'pathe';
import { devWorker } from './meta';
import { VERCUBE_ENV } from './types';
import type { VercubePluginContext } from './types';
import type { RunnerName } from 'env-runner';
import type { EnvironmentOptions } from 'vite';

/**
 * The custom message event used to tell the worker which entry an environment loads.
 */
export const VITE_ENV_EVENT = 'vercube:vite-env';

/**
 * Builds the Vite environment options for the Vercube server environment.
 *
 * In dev, `createEnvironment` returns a {@link FetchableDevEnvironment} backed by
 * the env-runner worker. In build, the environment bundles the virtual server
 * entry (wired up in the production milestone).
 *
 * @param ctx - The shared plugin context.
 * @returns The environment options for the `vercube` environment.
 */
export function createVercubeEnvironment(ctx: VercubePluginContext): EnvironmentOptions {
  return {
    consumer: 'server',
    // In dev, Vercube uses class references as DI tokens, so a package loaded
    // twice (once externalized to its dist, once transformed from source) yields
    // mismatched tokens and "Unresolved dependency" errors. Routing the entire
    // server through Vite's module graph (`noExternal: true`) guarantees every
    // module — framework and app — is evaluated exactly once with identical token
    // identities. The build doesn't share a graph with anything, so bare
    // dependencies are externalized there (see rollupOptions.external) and
    // resolve to a single dist instance at runtime.
    resolve: ctx.dev ? { noExternal: true } : {},
    build: {
      outDir: resolve(ctx.root, 'dist'),
      emptyOutDir: false,
      copyPublicDir: false,
      rollupOptions: {
        input: { index: ctx.serverEntry },
        // Bundle app + framework sources; keep bare dependencies external so the
        // output imports them from node_modules at runtime (matches Vercube's
        // existing rolldown build and avoids duplicating large deps).
        external: isBareSpecifier,
        output: { entryFileNames: '[name].mjs', chunkFileNames: '[name]-[hash].mjs', format: 'es' },
      },
    },
    dev: {
      createEnvironment: async (envName, envConfig) => {
        const { createFetchableDevEnvironment } = await import('./dev');
        const env = createFetchableDevEnvironment(envName, envConfig, getEnvRunner(ctx), ctx.serverEntry);
        (ctx._viteEnvs ??= new Map()).set(envName, ctx.serverEntry);
        return env;
      },
    },
  };
}

/**
 * Initializes the env-runner manager that drives the dev worker. Idempotent and
 * concurrency-safe: repeated calls return the same manager. On unexpected worker
 * exit the runner is reloaded up to three times before giving up.
 *
 * @param ctx - The shared plugin context.
 * @returns The initialized runner manager.
 */
export async function initEnvRunner(ctx: VercubePluginContext): Promise<RunnerManager> {
  if (ctx._envRunner) {
    return ctx._envRunner;
  }
  if (!ctx._initPromise) {
    ctx._initPromise = (async () => {
      const manager = new RunnerManager();
      let retries = 0;

      manager.onClose((_runner, cause) => {
        if (retries++ < 3) {
          void loadRunnerInto(ctx, manager);
        } else {
          console.error('[vercube] env runner failed after 3 retries.', cause ? `Last cause: ${cause}` : '');
        }
      });

      manager.onReady(() => {
        retries = 0;
        if (ctx._viteEnvs) {
          for (const [name, entry] of ctx._viteEnvs) {
            manager.sendMessage({ type: 'custom', event: VITE_ENV_EVENT, data: { name, entry } });
          }
        }
      });

      await loadRunnerInto(ctx, manager);
      ctx._envRunner = manager;
      return manager;
    })();
  }
  return ctx._initPromise;
}

/**
 * Returns the initialized runner manager, throwing if {@link initEnvRunner} has not run.
 *
 * @param ctx - The shared plugin context.
 * @returns The runner manager.
 */
export function getEnvRunner(ctx: VercubePluginContext): RunnerManager {
  if (!ctx._envRunner) {
    throw new Error('[vercube] Env runner not initialized. Call initEnvRunner() first.');
  }
  return ctx._envRunner;
}

/**
 * Reloads the worker behind the runner manager, re-importing all environment entries.
 *
 * @param ctx - The shared plugin context.
 * @returns The runner manager.
 */
export async function reloadEnvRunner(ctx: VercubePluginContext): Promise<RunnerManager> {
  const manager = ctx._envRunner;
  if (!manager) {
    return initEnvRunner(ctx);
  }
  await loadRunnerInto(ctx, manager);
  return manager;
}

/**
 * Returns true for bare module specifiers (npm/workspace packages), which the
 * production build externalizes. Relative paths, absolute paths and virtual
 * (`\0`-prefixed) ids are bundled.
 *
 * @param id - The import specifier to classify.
 * @returns Whether the specifier is a bare dependency.
 */
export function isBareSpecifier(id: string): boolean {
  if (id.startsWith('\0') || id.startsWith('.') || isAbsolute(id)) {
    return false;
  }
  return true;
}

/**
 * Loads (or reloads) the configured runner into the manager.
 */
async function loadRunnerInto(ctx: VercubePluginContext, manager: RunnerManager): Promise<void> {
  const runnerName = (ctx.pluginConfig.runner || process.env.VERCUBE_DEV_RUNNER || 'node-worker') as RunnerName;
  const runner = await loadRunner(runnerName, { name: VERCUBE_ENV, data: { entry: devWorker } });
  await manager.reload(runner);
}
