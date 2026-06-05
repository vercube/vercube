import { defu } from 'defu';
import { resolve } from 'pathe';
import { CLIENT_OUT_DIR, createContext, setupContext } from './context';
import { createVercubeEnvironment, initEnvRunner } from './env';
import { VERCUBE_ENV } from './types';
import type { VercubePluginConfig, VercubePluginContext } from './types';
import type { Plugin } from 'vite';

/**
 * The Vercube Vite plugin.
 *
 * Runs a Vercube server inside a dedicated Vite environment via the Environment
 * API: controllers and services are auto-discovered from the project source,
 * assembled into a generated virtual entry, and executed in an isolated
 * env-runner worker with HMR. HTTP requests hitting the Vite dev server are
 * forwarded into that worker.
 *
 * @param pluginConfig - Optional plugin configuration.
 * @returns The array of Vite plugins composing the integration.
 */
export function vercube(pluginConfig: VercubePluginConfig = {}): Plugin[] {
  const ctx = createContext(pluginConfig);
  return [vercubeMain(ctx)];
}

/**
 * The primary sub-plugin: defines the Vercube environment, warms the dev worker,
 * and forwards requests to it.
 */
function vercubeMain(ctx: VercubePluginContext): Plugin {
  let initialized = false;

  return {
    name: 'vercube:main',
    sharedDuringBuild: true,

    async config(userConfig, configEnv) {
      if (!initialized) {
        initialized = true;
        ctx.pluginConfig = defu(userConfig.vercube, ctx.pluginConfig);
        await setupContext(ctx, {
          root: userConfig.root ?? process.cwd(),
          dev: configEnv.command === 'serve',
        });
        if (ctx.dev) {
          await initEnvRunner(ctx);
        }
      }

      // Vercube only claims its own routes (see the dev middleware), so Vite keeps
      // its default app type and continues to serve the frontend, assets and HMR.
      // The frontend build is sent to `dist/public` (separate from the server's
      // `dist/index.mjs`) so the built server can serve it as static files.
      return {
        builder: { sharedConfigBuild: true },
        environments: {
          client: { build: { outDir: resolve(ctx.root, CLIENT_OUT_DIR) } },
          [VERCUBE_ENV]: createVercubeEnvironment(ctx),
        },
      };
    },

    buildApp: {
      order: 'post',
      async handler(builder) {
        const { buildEnvironments } = await import('./prod');
        await buildEnvironments(ctx, builder);
      },
    },

    configureServer: async (server) => {
      const { configureViteDevServer } = await import('./dev');
      return configureViteDevServer(ctx, server);
    },

    // Server code has no browser HMR boundary: when a module in the Vercube
    // environment changes, reload the worker so the next request re-imports the
    // updated graph (new route methods register on re-instantiation).
    hotUpdate() {
      if (this.environment.name !== VERCUBE_ENV) {
        return;
      }
      this.environment.moduleGraph.invalidateAll();
      this.environment.hot.send({ type: 'full-reload' });
    },
  };
}
