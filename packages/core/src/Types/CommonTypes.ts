import type { MetadataTypes } from './MetadataTypes';

export { FastResponse } from 'srvx';

export type MaybePromise<T> = T | Promise<T>;

export interface MiddlewareOptions<T = any> {
  middlewareArgs?: T;
  /**
   * Resolved handler arguments. Only passed to validation middlewares: the
   * arguments (and the body) are resolved after every other before middleware.
   */
  methodArgs?: MetadataTypes.Arg[];
  /**
   * The route the middleware runs on. Missing for requests that match no
   * route (a 404, a static file), which only run app-wide middlewares.
   */
  route?: RouteInfo;
}

/** Identifies the route a middleware runs on. */
export interface RouteInfo {
  /** Name of the controller class the route belongs to, a subclass's own name when it inherits the route. */
  controller: string;
  /** Name of the handler method. */
  handler: string;
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequestHandler = (request: Request) => Promise<Response>;
