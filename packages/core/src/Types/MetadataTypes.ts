 
import type { NodeEventContext } from 'h3';
import type { BaseMiddleware } from '../Services/Middleware/BaseMiddleware';
export namespace MetadataTypes {

  export type Request = NodeEventContext['req'];

  export type Response = NodeEventContext['res'];

  export interface Metadata {
    req: Request | null;
    res: Response | null;
    url: string | null;
    args: Arg[];
    actions: Action[];
    middlewares: Middleware[];
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
    type?: 'before' | 'after';
    priority?: number;
    middleware: BaseMiddleware;
  }

  export interface ResolveUrlParams {
    instance: any;
    path: string;
    propertyName: string;
  }

}