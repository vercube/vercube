import { setupHooks } from './setup/Hooks';
import { getTransformedRoutes } from './setup/Routes';
import type { RouteInfo } from './build/Routes';
import type { NitroModule } from 'nitro/types';

export default function vercubeNitro(): NitroModule {
  return {
    name: '@vercube/nitro',
    setup: async (nitro) => {
      // setup hooks
      setupHooks(nitro);

      const routeMap = new Map<string, RouteInfo>();

      for (const route of await getTransformedRoutes(nitro)) {
        routeMap.set(route.path, route);
      }

      const routes = [...routeMap.values()];

      console.log(routes);

      nitro.options.virtual['#internal/vercube-route-plugin'] = `
        import { definePlugin } from 'nitro';
        import { useNitroApp } from 'nitro/app';
        import { Container } from '@vercube/di';
        ${routes.map((route) => route.import).join('\n')}

        export default definePlugin(async (nitroApp) => {
          let container = nitroApp.__vercubeContainer__;

          if (!container) {
            container = new Container();
            nitroApp.__vercubeContainer__ = container;
          }

          // bind routes to container
          ${routes.map((route) => `container.bind(${route.importClassName});`).join('\n')}
        })
      `;

      nitro.options.plugins.push('#internal/vercube-route-plugin');
    },
  };
}
