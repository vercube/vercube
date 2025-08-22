import type { BaseMiddleware } from '../Services/Middleware/BaseMiddleware';
import type { RouterTypes } from './RouterTypes';
import type { ValidationTypes } from './ValidationTypes';

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
    __meta?: Record<string, unknown>;
  }

  export interface Method {
    req: Request | null;
    res: Response | null;
    url: string | null;
    method: string | null;
    args: Arg[];
    actions: Action[];
    meta: Record<string, unknown>;
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
    resolver?: (event: RouterTypes.RouterEvent) => Promise<unknown>;
    resolved?: unknown;
    validate?: boolean;
    validationSchema?: ValidationTypes.Schema;
  }

  export interface Action {
    handler: (req: Request, res: Response) => void | Response | ResponseInit;
  }

  export interface Middleware<T = unknown, U = unknown> {
    target: string;
    priority?: number;
    middleware: typeof BaseMiddleware<T, U>;
    args?: unknown;
  }

  export interface ResolveUrlParams {
    instance: any;
    path: string;
    propertyName: string;
  }
}
