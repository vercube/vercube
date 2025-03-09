import { MetadataTypes } from './MetadataTypes';
import { BaseMiddleware } from '../Services/Middleware/BaseMiddleware';

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

  export interface X {
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
      beforeMiddlewares: X[];
      afterMiddlewares: X[];
    };
    actions: MetadataTypes.Action[];
  }

  export interface RouteMatched<T = unknown> {
    data: T;
    params?: Record<string, string>;
  }

  export type RouterEvent = RouterTypes.RouteMatched<RouterTypes.RouterHandler> & {
    request: Request;
    response: Response;
  }

}