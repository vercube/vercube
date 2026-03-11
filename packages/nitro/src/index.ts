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

      nitro.options.virtual['#internal/vercube-route-plugin'] = `
        import { definePlugin } from 'nitro';
        import { createApp } from '@vercube/core';
        import { initializeContainer } from '@vercube/di';

        ${routes.map((route) => route.import).join('\n')}

        export default definePlugin(async (nitroApp) => {
          const app = await createApp();
          nitroApp.__vercubeApp__ = app;
          globalThis.__vercubeApp__ = app;

          // bind routes to container
          ${routes.map((route) => `app.container.bind(${route.importClassName});`).join('\n')}

          initializeContainer(app.container);
        });
      `;

      nitro.options.plugins.push('#internal/vercube-route-plugin');
    },
  };
}
