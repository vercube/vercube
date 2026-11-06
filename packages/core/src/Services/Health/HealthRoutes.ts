import { Container, Inject } from '@vercube/di';
import { HEALTH_ENDPOINTS } from '../../Utils/Health';
import { initializeMetadata, initializeMetadataMethod, setMetadataArg, skipGlobalMiddlewares } from '../../Utils/Utils';
import { RequestHandler } from '../Router/RequestHandler';
import { Router } from '../Router/Router';
import { HealthController } from './HealthController';
import { HealthRegistry } from './HealthRegistry';
import type { HealthTypes } from '../../Types/HealthTypes';

/** The methods every probe endpoint answers. */
const METHODS = ['GET', 'HEAD'] as const;

/**
 * Registers the probe endpoints of the `health` option and checks, once
 * every route is known, that no application route shares their paths.
 */
export class HealthRoutes {
  @Inject(Container)
  private readonly gContainer!: Container;

  @Inject(Router)
  private readonly gRouter!: Router;

  @Inject(RequestHandler)
  private readonly gRequestHandler!: RequestHandler;

  @Inject(HealthRegistry)
  private readonly gRegistry!: HealthRegistry;

  /** The resolved option, set once mounted. */
  private fOptions: HealthTypes.ResolvedOptions | null = null;

  /**
   * The resolved `health` option, `null` until mounted.
   */
  public get options(): HealthTypes.ResolvedOptions | null {
    return this.fOptions;
  }

  /**
   * Applies the registry settings, registers the application checks and the
   * probe routes. Called right after the router is initialized, before any
   * controller registers its routes.
   *
   * @param {HealthTypes.ResolvedOptions} options - The resolved `health` option
   * @returns {void}
   */
  public mount(options: HealthTypes.ResolvedOptions): void {
    this.fOptions = options;

    this.gRegistry.configure({ timeout: options.timeout, cacheTtl: options.cacheTtl });

    for (const check of options.checks) {
      this.gRegistry.register(check);
    }

    if (!this.gContainer.getOptional(HealthController)) {
      this.gContainer.bind(HealthController);
    }

    const controller = this.gContainer.get(HealthController);
    const prototype = HealthController.prototype;

    controller.configure(options);

    // Probes are infrastructure: an application-wide auth or tenancy
    // middleware must never guard them, and request logging would only fill
    // the logs with a line every few seconds.
    skipGlobalMiddlewares(prototype);

    initializeMetadata(prototype);
    setMetadataArg(initializeMetadataMethod(prototype, 'ready'), { idx: 0, type: 'header', data: { name: 'authorization' } });

    for (const endpoint of HEALTH_ENDPOINTS) {
      const path = options.endpoints[endpoint];

      if (path === null) {
        continue;
      }

      initializeMetadataMethod(prototype, endpoint);

      for (const method of METHODS) {
        this.gRouter.addRoute({
          path,
          method,
          handler: this.gRequestHandler.prepareHandler({ instance: controller, propertyName: endpoint }),
        });
      }
    }
  }

  /**
   * Fails when an application route was registered on a probe path. The
   * router keeps the later registration, so one of the two would otherwise be
   * unreachable without a word.
   *
   * @returns {void}
   * @throws {Error} Naming the probe and the route that collide
   */
  public assertNoCollisions(): void {
    const options = this.fOptions;

    if (!options) {
      return;
    }

    for (const endpoint of HEALTH_ENDPOINTS) {
      const path = options.endpoints[endpoint];

      if (path === null) {
        continue;
      }

      const route = this.gRouter.routes.find(
        (entry) =>
          (entry.method === 'GET' || entry.method === 'HEAD') &&
          !(entry.handler.instance instanceof HealthController) &&
          normalize(entry.path) === path,
      );

      if (route) {
        const handler = `${route.handler.controller ?? 'Controller'}.${route.handler.propertyName}`;

        throw new Error(
          `health: the ${endpoint} endpoint ${path} collides with the route ${route.method} ${route.path} (${handler}). Move the route or set health.endpoints.${endpoint}.`,
        );
      }
    }
  }
}

/**
 * Normalizes a route path the way the router matches it.
 *
 * @param {string} path - The route path
 * @returns {string} With a leading and without a trailing slash
 */
function normalize(path: string): string {
  const withLeading = path.startsWith('/') ? path : `/${path}`;

  return withLeading.length > 1 ? withLeading.replace(/\/+$/, '') || '/' : withLeading;
}
