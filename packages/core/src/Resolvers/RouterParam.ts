import { RouterTypes } from '../Types/RouterTypes';

export function resolveRouterParam(param: string, event: RouterTypes.RouterEvent): string | null {
  return event.params?.[param] ?? null;
}