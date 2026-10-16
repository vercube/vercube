import type { RouterTypes } from '../Types/RouterTypes';

/**
 * Resolves a router parameter from the event object
 *
 * The route is matched against the raw path, so an encoded `/` (`%2F`) stays
 * inside the parameter, and only the matched value is decoded - like
 * `@QueryParam`, a malformed sequence such as `100%` is kept verbatim. Unlike
 * the query, `+` is a literal plus in a path, so it is not turned into a space.
 *
 * @param param - The parameter name to resolve from the router event
 * @param event - The router event object containing parameters
 * @returns The decoded parameter value if it exists, undefined otherwise
 * @example
 * ```typescript
 * const value = resolveRouterParam('id', routerEvent);
 * // Returns the 'id' parameter value from routerEvent.params or undefined
 * ```
 */
export function resolveRouterParam(param: string, event: RouterTypes.RouterEvent): string | undefined {
  const value = event.params?.[param];

  if (value === undefined) {
    return undefined;
  }

  if (!value.includes('%')) {
    return value;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
