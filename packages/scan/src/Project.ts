import { readFileSync } from 'node:fs';
import {
  extractControllers,
  extractMiddlewares,
  extractRoutes,
  extractServices,
  IMPORT_SOURCE,
  MIDDLEWARE_IMPORT_SOURCE,
  SERVICE_IMPORT_SOURCE,
} from './Extract';
import { scanFiles } from './Scan';
import { resolveImports, transformMiddleware, transformRoute, transformService } from './Transform';
import type { MiddlewareInfo, RouteInfo, ScanLogger, ServiceInfo } from './Types';

/**
 * Options describing where to scan for controllers, services and middleware.
 *
 * `baseDirs` are the project source roots (e.g. `src/`). The remaining options
 * name the subdirectories scanned within each base root.
 */
export interface ScanProjectOptions {
  /** Project source roots to scan within. */
  baseDirs: string[];
  /** Subdirectory holding API controllers. Defaults to `api`. */
  apiDir?: string;
  /** Subdirectory holding route controllers. Defaults to `routes`. */
  routesDir?: string;
  /** Subdirectories scanned for `@Injectable` services. Defaults to `['api', 'routes', 'services', 'repositories']`. */
  serviceDirs?: string[];
  /** Subdirectory holding middleware classes. Defaults to `middleware`. */
  middlewareDir?: string;
  /** Optional logger forwarded to the underlying scanner. */
  logger?: ScanLogger;
}

const DEFAULT_API_DIR = 'api';
const DEFAULT_ROUTES_DIR = 'routes';
const DEFAULT_SERVICE_DIRS = ['api', 'routes', 'services', 'repositories'];
const DEFAULT_MIDDLEWARE_DIR = 'middleware';

/**
 * Scans the API and routes directories for controllers and returns every route
 * with its `import` resolved to the controller's real file path.
 *
 * @param options - Where to scan. See {@link ScanProjectOptions}.
 * @returns The discovered routes with resolved imports.
 */
export async function getRoutes(options: ScanProjectOptions): Promise<RouteInfo[]> {
  const { baseDirs, apiDir = DEFAULT_API_DIR, routesDir = DEFAULT_ROUTES_DIR, logger } = options;

  const files = await Promise.all([scanFiles(baseDirs, apiDir, logger), scanFiles(baseDirs, routesDir, logger)]).then((r) =>
    r.flat(),
  );

  const routes = await Promise.all(files.map((file) => transformRoute(file))).then((r) => r.flat());
  return resolveImports(routes, IMPORT_SOURCE);
}

/**
 * Scans the configured service directories for `@Injectable` classes and returns
 * every service with its `import` resolved to the class's real file path.
 *
 * @param options - Where to scan. See {@link ScanProjectOptions}.
 * @returns The discovered services with resolved imports.
 */
export async function getServices(options: ScanProjectOptions): Promise<ServiceInfo[]> {
  const { baseDirs, serviceDirs = DEFAULT_SERVICE_DIRS, logger } = options;

  const files = await Promise.all(serviceDirs.map((dir) => scanFiles(baseDirs, dir, logger))).then((r) => r.flat());

  const services = await Promise.all(files.map((file) => transformService(file))).then((r) => r.flat());
  return resolveImports(services, SERVICE_IMPORT_SOURCE);
}

/**
 * Scans the middleware directory for `BaseMiddleware` subclasses and returns
 * every middleware with its `import` resolved to the class's real file path.
 *
 * @param options - Where to scan. See {@link ScanProjectOptions}.
 * @returns The discovered middleware with resolved imports.
 */
export async function getMiddlewares(options: ScanProjectOptions): Promise<MiddlewareInfo[]> {
  const { baseDirs, middlewareDir = DEFAULT_MIDDLEWARE_DIR, logger } = options;

  const files = await scanFiles(baseDirs, middlewareDir, logger);
  const middlewares = await Promise.all(files.map((file) => transformMiddleware(file))).then((r) => r.flat());
  return resolveImports(middlewares, MIDDLEWARE_IMPORT_SOURCE);
}

/**
 * Convenience wrapper that scans routes, services and middleware in one call.
 *
 * Services whose class name is already registered as a route are filtered out
 * so a controller is never imported twice.
 *
 * @param options - Where to scan. See {@link ScanProjectOptions}.
 * @returns The discovered routes, deduplicated services, and middleware.
 */
export async function scanProject(options: ScanProjectOptions): Promise<{
  routes: RouteInfo[];
  services: ServiceInfo[];
  middlewares: MiddlewareInfo[];
}> {
  const [routes, services, middlewares] = await Promise.all([getRoutes(options), getServices(options), getMiddlewares(options)]);

  const routeClassNames = new Set(routes.map((r) => r.importClassName));
  const uniqueServices = services.filter((s) => !routeClassNames.has(s.importClassName));

  return { routes, services: uniqueServices, middlewares };
}

/**
 * Options for {@link scanSource}.
 */
export interface ScanSourceOptions {
  /** Directories whose entire file tree is scanned for decorated classes. */
  dirs: string[];
  /** Optional logger forwarded to the underlying scanner. */
  logger?: ScanLogger;
}

/**
 * Recursively scans the given directories for `@Controller` classes,
 * `@Injectable` services and `BaseMiddleware` subclasses, reading each file only
 * once.
 *
 * Unlike {@link scanProject}, this does not assume the Nitro convention of
 * dedicated `api`/`routes`/`services` subdirectories — decorated classes are
 * discovered wherever they live in the tree, which matches how Vercube apps are
 * typically organised. **Every** `@Controller` class is returned for binding
 * (not just those with HTTP routes), so WebSocket-only controllers are bound
 * too, while `routes` carries the concrete HTTP routes (method + path) for
 * request matching. Services already discovered as controllers are filtered out
 * so a class is never imported twice.
 *
 * @param options - Directories to scan. See {@link ScanSourceOptions}.
 * @returns The discovered controllers, HTTP routes, deduplicated services, and middleware, all with resolved imports.
 */
export async function scanSource(options: ScanSourceOptions): Promise<{
  controllers: ServiceInfo[];
  routes: RouteInfo[];
  services: ServiceInfo[];
  middlewares: MiddlewareInfo[];
}> {
  const files = await scanFiles(options.dirs, '.', options.logger);

  const controllers: ServiceInfo[] = [];
  const routes: RouteInfo[] = [];
  const services: ServiceInfo[] = [];
  const middlewares: MiddlewareInfo[] = [];

  for (const file of files) {
    const code = readFileSync(file.fullPath, 'utf8');

    for (const controller of extractControllers(code)) {
      controllers.push({ ...controller, ...file, import: controller.import.replace(IMPORT_SOURCE, file.fullPath) });
    }
    for (const route of extractRoutes(code)) {
      routes.push({ ...route, ...file, import: route.import.replace(IMPORT_SOURCE, file.fullPath) });
    }
    for (const service of extractServices(code)) {
      services.push({ ...service, ...file, import: service.import.replace(SERVICE_IMPORT_SOURCE, file.fullPath) });
    }
    for (const middleware of extractMiddlewares(code)) {
      middlewares.push({ ...middleware, ...file, import: middleware.import.replace(MIDDLEWARE_IMPORT_SOURCE, file.fullPath) });
    }
  }

  const controllerClassNames = new Set(controllers.map((c) => c.importClassName));
  const uniqueServices = services.filter((s) => !controllerClassNames.has(s.importClassName));

  return { controllers, routes, services: uniqueServices, middlewares };
}
