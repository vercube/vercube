 
import type { NodeEventContext } from 'h3';
import type { BaseMiddleware } from '../Services/Middleware/BaseMiddleware';
export namespace MetadataTypes {

  export type Request = NodeEventContext['req'];

  export type Response = NodeEventContext['res'];

  export interface Metadata {
    __metadata: Ctx;
  }

  export interface Ctx {
    __controller: {
      path: string;
    };
    __middlewares: Middleware[];
    __methods: Record<string, Method>;
  }

  export interface Method {
    req: Request | null;
    res: Response | null;
    url: string | null;
    args: Arg[];
    actions: Action[];
  }

  export interface ResolvedData {
    req: Request | null;
    res: Response | null;
    url: string | null;
    args: unknown[];
    actions: Action[];
    middlewares: Middleware[];
  }

  export interface Arg {
    idx: number;
    type: string;
    data?: Record<string, any>;
  }

  export interface Action {
    handler: (req: Request, res: Response) => void;
  }

  export interface Middleware {
    target: string;
    type?: 'before' | 'after';
    priority?: number;
    middleware: typeof BaseMiddleware;
    args?: unknown;
  }

  export interface ResolveUrlParams {
    instance: any;
    path: string;
    propertyName: string;
  }

}