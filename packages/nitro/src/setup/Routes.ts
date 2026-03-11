import { scanFiles, type FileInfo } from '../_internal/scan';
import { IMPORT_SOURCE, transformRoute, type RouteInfo } from '../build/Routes';
import type { HTTPMethod } from 'nitro/h3';
import type { Nitro, NitroOptions } from 'nitro/types';

export async function setupRoutes(nitro: Nitro): Promise<void> {
  /**
   * Scan files in the api and routes directories
   * @param nitro - The nitro instance
   * @returns void
   */
  const perfStart = performance.now();
  const routes = await getTransformedRoutes(nitro);

  nitro.logger.success(`Vercube routes transformed in ${Math.round(performance.now() - perfStart)}ms`);

  nitro.options.routes = {
    ...clearRoutes(nitro.options?.routes ?? {}),
    // oxlint-disable-next-line unicorn/no-array-reduce
    ...routes.reduce(
      (acc, route) => {
        acc[route.route] = {
          handler: '@vercube/nitro/runtime/handler',
          method: route.method as HTTPMethod,
          lazy: false,
          format: 'web',
          env: ['dev', 'prod'],
          meta: {},
        };
        return acc;
      },
      {} as NitroOptions['routes'],
    ),
  };

  // sync nitro routes
  nitro.routing.sync();
}

/**
 * Gets the transformed routes from the routes directory
 * @param nitro - The nitro instance
 * @returns The transformed routes
 */
export async function getTransformedRoutes(nitro: Nitro): Promise<RouteInfo[]> {
  const routes = await scanRoutes(nitro);
  return (await Promise.all(routes.map(async (route) => await transformRoute(route))).then((r) => r.flat())).map((route) => ({
    ...route,
    import: route.import.replace(IMPORT_SOURCE, route.fullPath),
  }));
}

/**
 * Scans the routes directory and returns the file info of the routes
 * @param nitro - The nitro instance
 * @returns The file info of the routes
 */
export async function scanRoutes(nitro: Nitro): Promise<FileInfo[]> {
  return Promise.all([
    scanFiles(nitro, nitro.options.apiDir || 'api'),
    scanFiles(nitro, nitro.options.routesDir || 'routes'),
  ]).then((r) => r.flat());
}

/**
 * Clears routes that are not defined in the routes directory
 * @param routes - The routes to clear
 * @returns The cleared routes
 */
function clearRoutes(routes: NitroOptions['routes']): NitroOptions['routes'] {
  return Object.fromEntries(
    Object.entries(routes).filter(
      ([_, value]) => typeof value === 'object' && 'handler' in value && value.handler !== '@vercube/nitro/runtime/handler',
    ),
  );
}
