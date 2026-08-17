import { getRequestSearch } from '../Utils/Url';
import type { RouterTypes } from '../Types/RouterTypes';

/**
 * Resolves a single query parameter from the URL of a router event
 * @param name - The name of the query parameter to resolve
 * @param event - The router event containing the request URL
 * @returns The value of the query parameter if found, null otherwise
 */
export function resolveQueryParam(name: string, event: RouterTypes.RouterEvent): string | null {
  const search = getRequestSearch(event.request);

  if (search === '') {
    return null;
  }

  return new URLSearchParams(search).get(name);
}

/**
 * Resolves all query parameters from the URL of a router event
 * @param event - The router event containing the request URL
 * @returns An object containing all query parameters as key-value pairs
 */
export function resolveQueryParams(event: RouterTypes.RouterEvent): Record<string, string> {
  const params: Record<string, string> = {};
  const search = getRequestSearch(event.request);

  if (search === '') {
    return params;
  }

  for (const [key, value] of new URLSearchParams(search)) {
    params[key] = value;
  }

  return params;
}
