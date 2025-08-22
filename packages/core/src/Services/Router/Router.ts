import { createRouter, type RouterContext, addRoute, findRoute } from 'rou3';
import { RouterTypes } from '../../Types/RouterTypes';
import { Inject } from '@vercube/di';
import { HooksService } from '../Hooks/HooksService';
import { RouterBeforeInitHook } from '../../Hooks/Router/RouterBeforeInitHook';
import { RouterAfterInitHook } from '../../Hooks/Router/RouterAfterInitHook';

/**
 * Router service responsible for managing application routes
 *
 * This class provides functionality to initialize the router,
 * register routes, and resolve incoming requests to their
 * appropriate handlers.
 */
export class Router {
  /**
   * Service for triggering application hooks
   */
  @Inject(HooksService)
  private gHooksService: HooksService;

  /**
   * Internal router context that stores all registered routes
   * @private
   */
  private fRouterContext!: RouterContext<RouterTypes.RouterHandler>;

  /**
   * Registers a new route in the router
   *
   * @param {RouterTypes.Route} route - The route configuration to add
   * @throws {Error} If router is not initialized
   */
  public addRoute(route: RouterTypes.Route): void {
    if (!this.fRouterContext) {
      throw new Error(
        'Router not initialized. Please call init() before adding routes.',
      );
    }

    addRoute(
      this.fRouterContext,
      route.method.toUpperCase(),
      route.path,
      route.handler,
    );
  }

  /**
   * Initializes the router and triggers related hooks
   *
   * This method creates a new router context and triggers
   * the before and after initialization hooks.
   */
  public initialize(): void {
    // trigger before init hook
    this.gHooksService.trigger(RouterBeforeInitHook);

    this.fRouterContext = createRouter<RouterTypes.RouterHandler>();

    // trigger after init hook
    this.gHooksService.trigger(RouterAfterInitHook);
  }

  /**
   * Resolves a route based on the HTTP method and path
   *
   * @param {RouterTypes.RouteFind} route - The route to resolve
   * @returns {RouterTypes.RouteMatched<RouterTypes.RouterHandler> | undefined} The matched route or undefined if no match found
   */
  public resolve(
    route: RouterTypes.RouteFind,
  ): RouterTypes.RouteMatched<RouterTypes.RouterHandler> | undefined {
    let url = route.path;

    try {
      url = new URL(route.path).pathname;
    } catch {
      // silent error
    }

    return findRoute(this.fRouterContext, route.method.toUpperCase(), url);
  }
}
