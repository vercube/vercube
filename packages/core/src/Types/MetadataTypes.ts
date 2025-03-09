
import type { BaseMiddleware } from '../Services/Middleware/BaseMiddleware';
import { ValidationTypes } from './ValidationTypes';
export namespace MetadataTypes {

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
    handler: (req: Request, res: Response) => void | Response | ResponseInit;
  }

  export interface Middleware {
    target: string;
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
