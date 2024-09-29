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
   */
  private fRoutes: Set<RouterTypes.Route> = new Set();

  /**
   * Register route
   */
  public registerRoute(route: RouterTypes.Route): void {
    this.fRoutes.add(route);
  }

  /**
   * Initialize all registered routes
   */
  public init(): void {
    this.gHooksService.trigger(RouterBeforeInitHook);

    console.log('Initializing routes...');

    this.gHooksService.trigger(RouterAfterInitHook);

  }

}