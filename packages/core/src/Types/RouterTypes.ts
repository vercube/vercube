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
     * True when the route has no middlewares, no actions and no argument that
     * observes the intermediate response, so the request can be served without
     * building one.
     */
    simple?: boolean;
    /** True when at least one argument resolver returns a promise. */
    asyncArgs?: boolean;
    /** True when the request body must be cloned before being consumed. */
    cloneBody?: boolean;
    /** Controller class name, resolved once in `RequestHandler.prepareHandler`. */
    controller?: string;
    /** Route template this handler was registered under, set by `Router.addRoute`. */
    path?: string;
    /** Precomputed `${method} ${path}` telemetry span name, set by `Router.addRoute`. */
    spanName?: string;
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
