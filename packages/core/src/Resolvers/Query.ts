import type { RouterTypes } from '../Types/RouterTypes';

/**
 * Resolves a single query parameter from the URL of a router event
 * @param name - The name of the query parameter to resolve
 * @param event - The router event containing the request URL
 * @returns The value of the query parameter if found, null otherwise
 */
export function resolveQueryParam(name: string, event: RouterTypes.RouterEvent): string | null {
  const url = new URL(event.request.url);
  return url.searchParams.get(name);
}

/**
 * Resolves all query parameters from the URL of a router event
 * @param event - The router event containing the request URL
 * @returns An object containing all query parameters as key-value pairs
 */
export function resolveQueryParams(event: RouterTypes.RouterEvent): Record<string, string> {
  const url = new URL(event.request.url);
  const params: Record<string, string> = {};

  for (const [key, value] of url.searchParams) {
    params[key] = value;
  }

  return params;
}
