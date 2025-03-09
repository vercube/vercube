import { createRouter, type RouterContext, addRoute, findRoute  } from 'rou3';
import { RouterTypes } from '../../Types/RouterTypes';
import { Inject } from '@vercube/di';
import { HooksService } from '../Hooks/HooksService';
import { RouterBeforeInitHook } from '../../Hooks/Router/RouterBeforeInitHook';
import { RouterAfterInitHook } from '../../Hooks/Router/RouterAfterInitHook';

export class Router {

  @Inject(HooksService)
  private gHooksService: HooksService;

  private fRouterContext!: RouterContext<RouterTypes.RouterHandler>;

  public addRoute(route: RouterTypes.Route): void {
    addRoute(this.fRouterContext, route.method.toUpperCase(), route.path, route.handler);
  }

  public init(): void {
    // trigger before init hook
    this.gHooksService.trigger(RouterBeforeInitHook);

    this.fRouterContext = createRouter<RouterTypes.RouterHandler>();

    // trigger after init hook
    this.gHooksService.trigger(RouterAfterInitHook);
  }

  public resolve(route: RouterTypes.RouteFind): RouterTypes.RouteMatched<RouterTypes.RouterHandler> | undefined {
    let url = route.path;

    try {
      url = new URL(route.path).pathname;
    } catch {
      // silent error
    }

    return findRoute(this.fRouterContext, route.method.toUpperCase(), url);
  }

}