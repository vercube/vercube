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
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequestHandler = (request: Request) => Promise<Response>;
