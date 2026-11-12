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
    /**
     * The path the route decorator declares, without the controller path, so
     * the full path can be rebuilt for an application that moved the
     * controller with `setControllerPath()`.
     */
    path?: string;
    method: string | null;
    args: Arg[];
    actions: Action[];
    /**
     * Declarative facts about the route, for tools that describe it rather
     * than run it: `status` (`@Status`), `redirect` (`@Redirect`, as
     * `{ location, code }`), `headers` (`@SetHeader`), `sse` (`@Sse`) and `throws` (`@Throws`, read
     * it with `getThrownErrors()`, which adds the controller's own).
     */
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
    /**
     * Identifies the decorator application that added the action, so a second
     * container initializing the same class replaces it instead of adding it again.
     */
    key?: unknown;
  }

  export interface Middleware<T = unknown, U = unknown> {
    target: string;
    priority?: number;
    middleware: typeof BaseMiddleware<T, U>;
    args?: unknown;
    /**
     * Makes the entry replaceable: of all entries a route collects with the same
     * slot (app-wide, then controller, then method), only the last one runs.
     * A rate limit on a method this way replaces the controller's and the app's
     * instead of running next to them.
     */
    slot?: string;
    /**
     * With a `slot`: removes the slot from the route, so neither this entry nor
     * any earlier one in the slot runs. How a method opts out of a controller-wide
     * or app-wide middleware.
     */
    skip?: boolean;
  }

  export interface ResolveUrlParams {
    instance: any;
    path: string;
    propertyName: string;
  }
}
