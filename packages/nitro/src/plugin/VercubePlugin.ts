import { setupHooks } from '../setup/Hooks';
import { getTransformedRoutes } from '../setup/Routes';
import { getTransformedServices } from '../setup/Services';
import type { RouteInfo } from '../build/Routes';
import type { ServiceInfo } from '../build/Services';
import type { NitroModule } from 'nitro/types';

export interface PluginOptions {
  scanDirs?: string[];
}

export function vercubeNitro(options?: PluginOptions): NitroModule {
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

      for (const service of await getTransformedServices(nitro)) {
        serviceMap.set(`${service.fullPath}:${service.importClassName}`, service);
      }

      const services = [...serviceMap.values()];

      // Deduplicate imports by class name (a class bound as a route shouldn't be imported twice)
      const routeClassNames = new Set(routes.map((r) => r.importClassName));
      const uniqueServices = services.filter((s) => !routeClassNames.has(s.importClassName));

      nitro.options.virtual['#internal/vercube-route-plugin'] = `
        import { definePlugin } from 'nitro';
        import { createNitroApp } from '@vercube/nitro';

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

          app.container.flushQueue();

        });
      `;

      nitro.options.plugins.push('#internal/vercube-route-plugin');
    },
  };
}
