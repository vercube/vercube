import { RouterTypes } from '../Types/RouterTypes';

export function getRequestHeader(header: string, event: RouterTypes.RouterEvent): string | null {
  return event.request.headers.get(header);
}

export function getRequestHeaders(event: RouterTypes.RouterEvent): Headers {
  return event.request.headers;
}