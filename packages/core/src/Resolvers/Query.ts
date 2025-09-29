import type { RouterTypes } from '../Types/RouterTypes';

type QueryParamValue = string | number | boolean | null;

/**
 * Resolves a single query parameter from the URL of a router event
 * @param name - The name of the query parameter to resolve
 * @param event - The router event containing the request URL
 * @returns The value of the query parameter if found, null otherwise
 */
export function resolveQueryParam(name: string, event: RouterTypes.RouterEvent): QueryParamValue {
  const url = new URL(event.request.url);
  const value = url.searchParams.get(name);
  return castValue(value);
}

/**
 * Resolves all query parameters from the URL of a router event
 * @param event - The router event containing the request URL
 * @returns An object containing all query parameters as key-value pairs
 */
export function resolveQueryParams(event: RouterTypes.RouterEvent): Record<string, QueryParamValue> {
  const url = new URL(event.request.url);
  const params: Record<string, QueryParamValue> = {};

  for (const [key, value] of url.searchParams) {
    params[key] = castValue(value);
  }

  return params;
}

/**
 * Function to cast a string value to its appropriate type (string, number, or boolean)
 * @param value - The string value to be cast
 * @returns The casted value as string, number, or boolean
 */
function castValue(value: string | null): QueryParamValue {
  if (value === null || value === '') {
    return value;
  }

  if (!Number.isNaN(Number(value))) {
    return Number(value);
  }

  if (value === 'true' || value === 'false') {
    return value === 'true';
  }

  return value;
}
