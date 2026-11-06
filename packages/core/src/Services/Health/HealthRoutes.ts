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
 * Registers the probe endpoints of the `health` option and reserves their
 * paths, so no application route can take one.
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

      // An application route on a probe path fails its registration, however
      // late it comes, instead of one of the two silently shadowing the other.
      this.gRouter.reserve(path, {
        owner: `the health ${endpoint} endpoint`,
        hint: `Move the route, or the probe with health.endpoints.${endpoint}.`,
        owns: (handler) => handler.instance instanceof HealthController,
      });

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
}
