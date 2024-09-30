import { createRouter, type Router } from 'h3';
import { Inject } from '@cube/di';
import type { RouterTypes } from '../../Types/RouterTypes';
import { RouterBeforeInitHook } from '../../Hooks/Router/RouterBeforeInitHook';
import { RouterAfterInitHook } from '../../Hooks/Router/RouterAfterInitHook';
import { HooksService } from '../Hooks/HooksService';

/**
 * This class is responsible for managing routes registered in the application.
 */
export class RouterRegistry {

  @Inject(HooksService)
  private gHooksService!: HooksService;

  /**
   * Registered routes
   * @type {Set<RouterTypes.Route>}
   */
  private fRoutes: Set<RouterTypes.Route> = new Set();

  /**
   * The router instance
   * @type {Router}
   */
  private fRouter!: Router;

  /**
   * Get router instance
   *
   * @return {Router} The router instance.
   */
  public get router(): Router {
    return this.fRouter;
  }

  /**
   * Register a route
   *
   * @param {RouterTypes.Route} route - The route to register.
   * @throws {Error} If the router is locked.
   */
  public registerRoute(route: RouterTypes.Route): void {
    this.fRoutes.add(route);
  }

  /**
   * Initialize all registered routes
   *
   * This method triggers the RouterBeforeInitHook, creates the router instance,
   * collects all registered routes, and then triggers the RouterAfterInitHook.
   * It also locks the router to prevent further route registration.
   */
  public init(): void {
    // trigger before init hook
    this.gHooksService.trigger(RouterBeforeInitHook);

    this.fRouter = createRouter();
    this.collectRoutes();

    // trigger after init hook
    this.gHooksService.trigger(RouterAfterInitHook);
  }

  /**
   * Collect all registered routes and add them to the router
   *
   * This method iterates over all registered routes and adds them to the router instance.
   *
   * @private
   */
  private collectRoutes(): void {
    for (const route of this.fRoutes) {
      this.fRouter.add(route.path, route.handler, route.method);
    }
  }

}