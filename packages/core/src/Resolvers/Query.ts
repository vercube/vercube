import { RouterTypes } from '../Types/RouterTypes';

export function resolveQueryParam(name: string, event: RouterTypes.RouterEvent): string | null {
  const url = new URL(event.request.url);
  return url.searchParams.get(name);
}

export function resolveQueryParams(event: RouterTypes.RouterEvent): Record<string, string> {
  const url = new URL(event.request.url);
  const params: Record<string, string> = {};

  for (const [key, value] of url.searchParams) {
    params[key] = value;
  }
  
  return params;
}