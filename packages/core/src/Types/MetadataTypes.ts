
import type { NodeEventContext } from 'h3';
import { ValidationTypes } from './ValidationTypes';
import { BeforeMiddleware } from '../Services/Middleware/BeforeMiddleware';
import { AfterMiddleware } from '../Services/Middleware/AfterMiddleware';
import { IOC } from '@vercube/di';

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
    args: Arg[];
    actions: Action[];
    middlewares: Middleware[];
  }

  export interface Arg {
    idx: number;
    type: string;
    data?: Record<string, any>;
    resolved?: unknown;
    validate?: boolean;
    validationSchema?: ValidationTypes.Schema;
  }

  export interface Action {
    handler: (req: Request, res: Response) => void | Response;
  }

  export interface Middleware {
    target: string;
    type?: 'before' | 'after';
    priority?: number;
    middleware: IOC.Newable<BeforeMiddleware | AfterMiddleware>;
    args?: unknown;
  }

  export interface ResolveUrlParams {
    instance: any;
    path: string;
    propertyName: string;
  }

}
