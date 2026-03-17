import { defu } from 'defu';
import { resolve } from 'pathe';
import { setupHooks } from '../setup/Hooks';
import { getTransformedMiddlewares } from '../setup/Middleware';
import { getTransformedRoutes } from '../setup/Routes';
import { getTransformedServices } from '../setup/Services';
import type { RouteInfo } from '../build/Routes';
import type { ServiceInfo } from '../build/Services';
import type { NitroModule } from 'nitro/types';

export interface PluginOptions {
  scanDirs?: string[];
  /**
   * Path to a file that exports a default function for customizing the Vercube app
   * before the DI container is flushed. Use this to bind tokens, override services,
   * or perform any setup that auto-discovery cannot handle.
   *
   * The file must export a default function matching: `(app: App) => void | Promise<void>`
   *
   * @example
   * // nitro.config.ts
   * vercubeNitro({ setupFile: './src/container.ts' })
   *
   * // src/container.ts
   * import type { App } from '@vercube/core'
   * export default async (app: App) => {
   *   app.container.bind(DatabaseToken, PostgresDatabase)
   * }
   */
  setupFile?: string;
}

const defaultOptions: PluginOptions = {
  scanDirs: ['api', 'routes', 'services', 'repositories'],
};

export function vercubeNitro(options?: PluginOptions): NitroModule {
  options = defu(options, defaultOptions);

  return {
    name: '@vercube/nitro',
    setup: async (nitro) => {
      // setup hooks
      setupHooks(nitro, options);

      const routeMap = new Map<string, RouteInfo>();

      for (const route of await getTransformedRoutes(nitro)) {
        routeMap.set(route.path, route);
      }

      const routes = [...routeMap.values()];

      const serviceMap = new Map<string, ServiceInfo>();

      for (const service of await getTransformedServices(nitro, options?.scanDirs)) {
        serviceMap.set(`${service.fullPath}:${service.importClassName}`, service);
      }

      const services = [...serviceMap.values()];

      // Scan middleware dir to exclude BaseMiddleware subclasses from Nitro's native handling
      await getTransformedMiddlewares(nitro);

      // Deduplicate imports by class name (a class bound as a route shouldn't be imported twice as a service)
      const routeClassNames = new Set(routes.map((r) => r.importClassName));
      const uniqueServices = services.filter((s) => !routeClassNames.has(s.importClassName));

      const setupFilePath = options?.setupFile ? resolve(nitro.options.rootDir, options.setupFile) : null;

      nitro.options.virtual['#internal/vercube-route-plugin'] = `
        import { definePlugin } from 'nitro';
        import { createNitroApp } from '@vercube/nitro';
        ${setupFilePath ? `import __vercubeSetup__ from '${setupFilePath}';` : ''}

        ${routes.map((route) => route.import).join('\n')}
        ${uniqueServices.map((service) => service.import).join('\n')}

        export default definePlugin(async (nitroApp) => {
          const app = await createNitroApp(${JSON.stringify(nitro.options)});
          nitroApp.__vercubeApp__ = app;
          globalThis.__vercubeApp__ = app;

          // bind routes to container
          ${routes.map((route) => `app.container.bind(${route.importClassName});`).join('\n')}

          // bind services to container
          ${uniqueServices.map((service) => `app.container.bind(${service.importClassName});`).join('\n')}

          ${setupFilePath ? `await __vercubeSetup__(app);` : ''}

          app.container.flushQueue();

        });
      `;

      nitro.options.plugins.push('#internal/vercube-route-plugin');
    },
  };
}
