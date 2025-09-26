import { Container, Inject } from '@vercube/di';
import { FastResponse } from '../../Types/CommonTypes';
import { ErrorHandlerProvider } from '../ErrorHandler/ErrorHandlerProvider';
import { MetadataResolver } from '../Metadata/MetadataResolver';
import { GlobalMiddlewareRegistry } from '../Middleware/GlobalMiddlewareRegistry';
import type { RouterTypes } from '../../Types/RouterTypes';

/**
 * Options for configuring a request handler
 * @interface RequestHandlerOptions
 */
export interface RequestHandlerOptions {
  /** The controller instance that contains the handler method */
  instance: any;
  /** The name of the method to be used as the handler */
  propertyName: string;
}

/**
 * Handles HTTP requests by preparing and executing route handlers with their associated middlewares
 *
 * The RequestHandler is responsible for:
 * - Preparing route handlers with their metadata
 * - Executing middleware chains (before and after)
 * - Processing request/response lifecycle
 * - Error handling during request processing
 */
export class RequestHandler {
  /** Resolver for extracting metadata from controller classes and methods */
  @Inject(MetadataResolver)
  private gMetadataResolver!: MetadataResolver;

  /** DI container for resolving dependencies */
  @Inject(Container)
  private gContainer!: Container;

  @Inject(GlobalMiddlewareRegistry)
  private gGlobalMiddlewareRegistry: GlobalMiddlewareRegistry;

  /**
   * Prepares a route handler by resolving its metadata and middlewares
   *
   * @param {RequestHandlerOptions} params - Configuration options for the handler
   * @returns {RouterTypes.RouterHandler} A prepared handler with resolved metadata and middlewares
   */
  public prepareHandler(params: RequestHandlerOptions): RouterTypes.RouterHandler {
    const { instance, propertyName } = params;

    // get the prototype of the instance to access the metadata
    const prototype = Object.getPrototypeOf(instance);

    // get method metadata
    const method = this.gMetadataResolver.resolveMethod(prototype, propertyName);

    // get middlewares
    const middlewares = this.gMetadataResolver.resolveMiddlewares(prototype, propertyName);

    // get global middlewares
    const globalMiddlewares = this.gGlobalMiddlewareRegistry.middlewares;

    // get unique middlewares;
    const uniqueMiddlewares = [...middlewares, ...globalMiddlewares].filter(
      (m, index, self) => self.findIndex((t) => t.middleware === m.middleware) === index,
    );

    // resolve middlewares
    const resolvedMiddlewares = uniqueMiddlewares.map((m) => ({
      ...m,
      middleware: this.gContainer.resolve(m.middleware),
    }));

    // get middleware types
    const beforeMiddlewares = resolvedMiddlewares.filter((m) => !!m.middleware.onRequest);
    const afterMiddlewares = resolvedMiddlewares.filter((m) => !!m.middleware.onResponse);

    // sort middlewares by priority
    beforeMiddlewares.sort((a, b) => (a?.priority ?? 999) - (b?.priority ?? 999));
    afterMiddlewares.sort((a, b) => (a?.priority ?? 999) - (b?.priority ?? 999));

    return {
      instance,
      propertyName,
      args: method.args,
      middlewares: {
        beforeMiddlewares,
        afterMiddlewares,
      },
      actions: method.actions,
    };
  }

  /**
   * This method processes preflight requests by executing global middlewares
   * and returning an appropriate response. It's typically used for handling CORS.
   *
   * The request handling lifecycle:
   * 1. Execute "before" global middlewares
   * 2. Execute "after" global middlewares
   * 3. Format and return the final response
   *
   * @param request - The incoming HTTP request
   * @returns {Promise<Response>} The HTTP response
   */
  public async handlePreflight(request: Request): Promise<Response> {
    try {
      let fakeResponse = new FastResponse(undefined, {
        headers: {
          'Content-Type': request.headers.get('Content-Type') ?? 'application/json',
        },
      });

      const globalMiddlewares = this.gGlobalMiddlewareRegistry.middlewares;

      const middlewares = globalMiddlewares.map((m) => ({
        ...m,
        middleware: this.gContainer.resolve(m.middleware),
      }));

      for await (const hook of middlewares) {
        try {
          let hookResponse = await hook.middleware.onRequest?.(request, fakeResponse, {
            middlewareArgs: hook.args,
            methodArgs: [],
          });

          if (hookResponse instanceof Response) {
            return hookResponse;
          } else if (hookResponse !== null) {
            fakeResponse = this.processOverrideResponse(hookResponse!, fakeResponse);
          }

          hookResponse = await hook.middleware.onResponse?.(request, fakeResponse, {
            middlewareArgs: hook.args,
            methodArgs: [],
          });

          if (hookResponse instanceof Response) {
            return hookResponse;
          } else if (hookResponse !== null) {
            fakeResponse = this.processOverrideResponse(hookResponse!, fakeResponse);
          }
        } catch (error) {
          const internalError = this.gContainer.get(ErrorHandlerProvider).handleError(error);

          if (internalError instanceof Response) {
            return internalError;
          }
        }
      }

      const response = new Response(null, {
        status: fakeResponse.status ?? 204,
        statusText: fakeResponse.statusText ?? 'No Content',
        headers: fakeResponse.headers,
      });

      return response;
    } catch (error) {
      return this.gContainer.get(ErrorHandlerProvider).handleError(error);
    }
  }

  /**
   * Processes an HTTP request through the middleware chain and route handler
   *
   * The request handling lifecycle:
   * 1. Execute "before" middlewares
   * 2. Apply route actions (status codes, redirects, etc.)
   * 3. Resolve handler arguments
   * 4. Execute the route handler
   * 5. Execute "after" middlewares
   * 6. Format and return the final response
   *
   * @param {Request} request - The incoming HTTP request
   * @param {RouterTypes.RouteMatched<RouterTypes.RouterHandler>} route - The matched route with handler data
   * @returns {Promise<Response>} The HTTP response
   */
  public async handleRequest(request: Request, route: RouterTypes.RouteMatched<RouterTypes.RouterHandler>): Promise<Response> {
    try {
      const {
        instance,
        propertyName,
        actions = [],
        args = [],
        middlewares = { beforeMiddlewares: [], afterMiddlewares: [] },
      } = route.data;
      let fakeResponse = new FastResponse(undefined, {
        headers: {
          'Content-Type': request.headers.get('Content-Type') ?? 'application/json',
        },
      });

      // 1. Resolve all args
      const resolvedArgs =
        args.length > 0
          ? await this.gMetadataResolver.resolveArgs(args, {
              ...route,
              request,
              response: fakeResponse,
            })
          : [];

      // 2. Call before route middlewares
      if (middlewares.beforeMiddlewares.length > 0) {
        for await (const hook of middlewares.beforeMiddlewares) {
          try {
            const hookResponse = await hook.middleware.onRequest?.(request, fakeResponse, {
              middlewareArgs: hook.args,
              methodArgs: resolvedArgs,
            });

            if (hookResponse instanceof Response) {
              return hookResponse;
            }
          } catch (error) {
            const internalError = this.gContainer.get(ErrorHandlerProvider).handleError(error);

            if (internalError instanceof Response) {
              return internalError;
            }
          }
        }
      }

      // 3. Call every actions
      for (const action of actions) {
        const actionResponse = action.handler(request, fakeResponse);

        if (actionResponse !== null) {
          fakeResponse = this.processOverrideResponse(actionResponse!, fakeResponse);
        }
      }

      // 4. Call current route handler
      let handlerResponse = instance[propertyName].call(instance, ...(resolvedArgs?.map((a) => a.resolved) ?? []));

      if (handlerResponse instanceof Promise) {
        handlerResponse = await handlerResponse;
      }

      // 5. Call after route middlewares
      if (middlewares.afterMiddlewares.length > 0) {
        for await (const hook of middlewares.afterMiddlewares) {
          try {
            const hookResponse = await hook.middleware.onResponse?.(request, fakeResponse, handlerResponse);

            if (hookResponse !== null) {
              fakeResponse = this.processOverrideResponse(hookResponse!, fakeResponse);
            }
          } catch (error) {
            const internalError = this.gContainer.get(ErrorHandlerProvider).handleError(error);

            if (internalError instanceof Response) {
              return internalError;
            }
          }
        }
      }

      // 6. Set response
      const body = fakeResponse?.body ?? JSON.stringify(handlerResponse);

      const response = new Response(body, {
        status: fakeResponse.status ?? 200,
        statusText: fakeResponse.statusText ?? 'OK',
        headers: fakeResponse.headers,
      });

      return response;
    } catch (error) {
      return this.gContainer.get(ErrorHandlerProvider).handleError(error);
    }
  }

  /**
   * Processes and merges response overrides from middlewares or actions
   *
   * This method handles different response formats:
   * - If a full Response object is provided, it's used directly
   * - If ResponseInit is provided, it's merged with the base response
   *
   * @param {Response | ResponseInit} response - The response or response options to apply
   * @param {Response} [base] - The base response to extend (optional)
   * @returns {Response} The processed response with applied overrides
   * @private
   */
  private processOverrideResponse(response: Response | ResponseInit, base?: Response): Response {
    let fakeResponse = base ?? new FastResponse();

    if (response != null && response instanceof FastResponse) {
      return response as Response;
    } else if (response !== null) {
      const responseInit = response as ResponseInit;

      // override fake response before pass it to the args
      fakeResponse = new FastResponse(undefined, {
        status: responseInit?.status ?? fakeResponse.status,
        headers: responseInit?.headers ?? fakeResponse.headers,
        statusText: responseInit?.statusText ?? fakeResponse.statusText,
      });
    }

    return fakeResponse;
  }
}
