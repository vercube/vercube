import { resolveImportSource } from '@vercube/scan';
import { nitroHealthPaths } from '../_internal/health';
import { scanFiles, type FileInfo } from '../_internal/scan';
import { IMPORT_SOURCE, transformRoute, type RouteInfo } from '../build/Routes';
import type { PluginOptions } from '../plugin/VercubePlugin';
import type { HTTPMethod } from 'nitro/h3';
import type { Nitro, NitroOptions } from 'nitro/types';

/**
 * Routes every scanned controller route, and the probe endpoints of the
 * `health` option, to the Vercube handler.
 *
 * @param nitro - The nitro instance
 * @param options - The plugin options
 * @returns void
 */
export async function setupRoutes(nitro: Nitro, options?: PluginOptions): Promise<void> {
  const routes = await getTransformedRoutes(nitro);

  // clear nitro handlers
  nitro.options.handlers = clearRoutes(nitro.options.handlers);

  nitro.options.handlers.push(
    ...routes.map((route) => ({
      route: route.route,
      method: route.method as HTTPMethod,
      handler: `@vercube/nitro/runtime/handler`,
      lazy: true,
    })),
    // the probes are not files Nitro could scan, they come from the option
    ...nitroHealthPaths(options?.health).flatMap((route) =>
      (['GET', 'HEAD'] as HTTPMethod[]).map((method) => ({
        route,
        method,
        handler: `@vercube/nitro/runtime/handler`,
        lazy: true,
      })),
    ),
  );

  // ignore class files
  nitro.options.ignore = [
    ...new Set([
      ...(nitro.options.ignore ?? []),
      ...routes.map((route) =>
        route.fullPath.replace(nitro.options.rootDir, '').replace(String(nitro.options?.serverDir), '').replace('src/', ''),
      ),
    ]),
  ];

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
    import: resolveImportSource(route.import, IMPORT_SOURCE, route.fullPath),
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
 * Clears the routes from the handlers
 * @param handlers - The handlers
 * @returns void
 */
export function clearRoutes(handlers: NitroOptions['handlers']): NitroOptions['handlers'] {
  return handlers.filter((handler) => handler.handler !== '@vercube/nitro/runtime/handler');
}
