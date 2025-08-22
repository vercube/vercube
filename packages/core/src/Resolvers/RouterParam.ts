import { RouterTypes } from '../Types/RouterTypes';

/**
 * Resolves a router parameter from the event object
 * @param param - The parameter name to resolve from the router event
 * @param event - The router event object containing parameters
 * @returns The resolved parameter value if it exists, null otherwise
 * @example
 * ```typescript
 * const value = resolveRouterParam('id', routerEvent);
 * // Returns the 'id' parameter value from routerEvent.params or null
 * ```
 */
export function resolveRouterParam(param: string, event: RouterTypes.RouterEvent): string | null {
  return event.params?.[param] ?? null;
}
