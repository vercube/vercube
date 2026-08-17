import type { BaseMiddleware } from '../Services/Middleware/BaseMiddleware';
import type { MetadataTypes } from './MetadataTypes';

export namespace RouterTypes {
  export interface Route {
    path: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD' | 'CONNECT' | 'TRACE';
    handler: RouterHandler;
  }

  export interface RouteFind {
    path: string;
    method: string;
  }

  export interface MiddlewareDefinition {
    middleware: BaseMiddleware<unknown, unknown>;
    target: string;
    priority?: number;
    args?: unknown;
  }

  export interface RouterHandler {
    instance: any;
    propertyName: string;
    args: MetadataTypes.Arg[];
    middlewares: {
      beforeMiddlewares: MiddlewareDefinition[];
      afterMiddlewares: MiddlewareDefinition[];
    };
    actions: MetadataTypes.Action[];
    /**
     * True when the route has no middlewares and no actions, so the request can
     * be served without building an intermediate response object.
     */
    simple?: boolean;
    /** True when at least one argument resolver returns a promise. */
    asyncArgs?: boolean;
    /** True when the handler receives the intermediate response object. */
    needsResponse?: boolean;
    /** True when the request body must be cloned before being consumed. */
    cloneBody?: boolean;
  }

  export interface RouteMatched<T = unknown> {
    data: T;
    params?: Record<string, string>;
  }

  export type RouterEvent = RouterTypes.RouteMatched<RouterTypes.RouterHandler> & {
    request: Request;
    response: Response;
    /**
     * Whether the request has to be cloned before its body is consumed.
     * Set by the request handler; defaults to cloning when absent.
     */
    cloneBody?: boolean;
  };
}
