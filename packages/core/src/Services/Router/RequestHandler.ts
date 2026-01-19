import { Container, Inject } from '@vercube/di';
import type { MetadataTypes } from '../../Types/MetadataTypes';
import type { RouterTypes } from '../../Types/RouterTypes';
import { FastResponse } from '../../Types/CommonTypes';
import { ErrorHandlerProvider } from '../ErrorHandler/ErrorHandlerProvider';
import { MetadataResolver } from '../Metadata/MetadataResolver';
import { GlobalMiddlewareRegistry } from '../Middleware/GlobalMiddlewareRegistry';
import { RequestContext } from './RequestContext';

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
    return this.runWithContext(async () => {
      return this.internalHandlePreflight(request);
    });
  }

  /**
   * Internal method that handles preflight request processing logic.
   *
   * @param request - The incoming HTTP request
   * @returns {Promise<Response>} The HTTP response
   * @private
   */
  private async internalHandlePreflight(request: Request): Promise<Response> {
    try {
      let fakeResponse = this.createInitialResponse(request);

      const globalMiddlewares = this.gGlobalMiddlewareRegistry.middlewares;
      const resolvedMiddlewares = this.resolveMiddlewares(globalMiddlewares);

      // Execute both onRequest and onResponse for each middleware (preflight pattern)
      const result = await this.executeMiddlewares(resolvedMiddlewares, {
        request,
        response: fakeResponse,
        methodArgs: [],
        handlerResponse: undefined,
        executeRequest: true,
        executeResponse: true,
      });

      if (result.earlyReturn) {
        return result.earlyReturn;
      }

      return this.createFinalResponse(result.response, null, 204, 'No Content');
    } catch (error) {
      return await this.handleError(error);
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
    return this.runWithContext(async () => {
      return this.internalHandleRequest(request, route);
    });
  }

  /**
   * Internal method that handles the request processing logic.
   * This is separated from handleRequest to allow running with or without request context.
   *
   * @param {Request} request - The incoming HTTP request
   * @param {RouterTypes.RouteMatched<RouterTypes.RouterHandler>} route - The matched route with handler data
   * @returns {Promise<Response>} The HTTP response
   * @private
   */
  private async internalHandleRequest(
    request: Request,
    route: RouterTypes.RouteMatched<RouterTypes.RouterHandler>,
  ): Promise<Response> {
    try {
      const {
        instance,
        propertyName,
        actions = [],
        args = [],
        middlewares = { beforeMiddlewares: [], afterMiddlewares: [] },
      } = route.data;
      let fakeResponse = this.createInitialResponse(request);

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
      const beforeResult = await this.executeMiddlewares(middlewares.beforeMiddlewares, {
        request,
        response: fakeResponse,
        methodArgs: resolvedArgs,
        handlerResponse: undefined,
        executeRequest: true,
        executeResponse: false,
      });
      if (beforeResult.earlyReturn) {
        return beforeResult.earlyReturn;
      }
      fakeResponse = beforeResult.response;

      // 3. Call every actions
      for (const action of actions) {
        const actionResponse = action.handler(request, fakeResponse);
        if (actionResponse != null) {
          fakeResponse = this.processOverrideResponse(actionResponse, fakeResponse);
        }
      }

      // 4. Call current route handler
      let handlerResponse = instance[propertyName].call(instance, ...(resolvedArgs?.map((a) => a.resolved) ?? []));
      if (handlerResponse instanceof Promise) {
        handlerResponse = await handlerResponse;
      }

      // 5. Call after route middlewares
      const afterResult = await this.executeMiddlewares(middlewares.afterMiddlewares, {
        request,
        response: fakeResponse,
        methodArgs: resolvedArgs,
        handlerResponse,
        executeRequest: false,
        executeResponse: true,
      });
      if (afterResult.earlyReturn) {
        return afterResult.earlyReturn;
      }
      fakeResponse = afterResult.response;

      // 6. If handlerResponse is already instance of Response, return it
      if (handlerResponse instanceof Response) {
        return handlerResponse;
      }

      // 7. Otherwise prepare new response
      return this.createFinalResponse(fakeResponse, handlerResponse, 200, 'OK');
    } catch (error) {
      return await this.handleError(error);
    }
  }

  /**
   * Runs a function within a request context if available, otherwise runs it directly
   *
   * @param fn - The function to run
   * @returns The result of the function
   * @private
   */
  private async runWithContext<T>(fn: () => Promise<T>): Promise<T> {
    const requestContext = this.gContainer.getOptional(RequestContext);
    if (requestContext) {
      return requestContext.run(fn);
    }
    return fn();
  }

  /**
   * Creates an initial FastResponse with Content-Type header from the request
   *
   * @param request - The incoming HTTP request
   * @returns The initial FastResponse
   * @private
   */
  private createInitialResponse(request: Request): Response {
    return new FastResponse(undefined, {
      headers: {
        'Content-Type': request.headers.get('Content-Type') ?? 'application/json',
      },
    });
  }

  /**
   * Handles errors by delegating to ErrorHandlerProvider
   *
   * @param error - The error to handle
   * @returns The error response
   * @private
   */
  private async handleError(error: unknown): Promise<Response> {
    return this.gContainer.get(ErrorHandlerProvider).handleError(error as Error);
  }

  /**
   * Resolves middleware instances from middleware definitions
   *
   * @param middlewares - Array of middleware definitions
   * @returns Array of resolved middleware definitions
   * @private
   */
  private resolveMiddlewares(middlewares: MetadataTypes.Middleware[]): RouterTypes.MiddlewareDefinition[] {
    return middlewares.map((m) => ({
      ...m,
      middleware: this.gContainer.resolve(m.middleware),
    }));
  }

  /**
   * Executes a middleware's onRequest hook
   *
   * @param hook - The middleware definition
   * @param request - The HTTP request
   * @param response - The current response
   * @param methodArgs - Resolved method arguments
   * @returns Response if middleware returns one, or updated response, or null
   * @private
   */
  private async executeMiddlewareRequest(
    hook: RouterTypes.MiddlewareDefinition,
    request: Request,
    response: Response,
    methodArgs: MetadataTypes.Arg[],
  ): Promise<Response | null> {
    const hookResponse = await hook.middleware.onRequest?.(request, response, {
      middlewareArgs: hook.args,
      methodArgs,
    });

    if (hookResponse instanceof Response) {
      return hookResponse;
    }

    if (hookResponse !== null && hookResponse !== undefined) {
      return this.processOverrideResponse(hookResponse, response);
    }

    return null;
  }

  /**
   * Executes a middleware's onResponse hook
   *
   * @param hook - The middleware definition
   * @param request - The HTTP request
   * @param response - The current response
   * @param payload - The handler response payload
   * @returns Response if middleware returns one, or updated response, or null
   * @private
   */
  private async executeMiddlewareResponse(
    hook: RouterTypes.MiddlewareDefinition,
    request: Request,
    response: Response,
    payload: unknown,
  ): Promise<Response | null> {
    const hookResponse = await hook.middleware.onResponse?.(request, response, payload);

    if (hookResponse instanceof Response) {
      return hookResponse;
    }

    if (hookResponse !== null && hookResponse !== undefined) {
      return this.processOverrideResponse(hookResponse, response);
    }

    return null;
  }

  /**
   * Executes middlewares with configurable hooks (onRequest, onResponse, or both)
   *
   * @param middlewares - Array of middleware definitions
   * @param options - Options for executing middlewares
   * @returns Object with earlyReturn if middleware returns Response, or updated response
   * @private
   */
  private async executeMiddlewares(
    middlewares: RouterTypes.MiddlewareDefinition[],
    options: {
      request: Request;
      response: Response;
      methodArgs: MetadataTypes.Arg[];
      handlerResponse: unknown;
      executeRequest: boolean;
      executeResponse: boolean;
    },
  ): Promise<{ earlyReturn?: Response; response: Response }> {
    const { request, response, methodArgs, handlerResponse, executeRequest, executeResponse } = options;
    let currentResponse = response;

    for await (const hook of middlewares) {
      try {
        // Execute onRequest hook if requested
        if (executeRequest) {
          const requestResult = await this.executeMiddlewareRequest(hook, request, currentResponse, methodArgs);
          if (requestResult instanceof Response) {
            // Middleware returned a Response for early termination
            return { earlyReturn: requestResult, response: currentResponse };
          }
          if (requestResult !== null && requestResult !== currentResponse) {
            currentResponse = requestResult;
          }
        }

        // Execute onResponse hook if requested
        if (executeResponse) {
          const responseResult = await this.executeMiddlewareResponse(hook, request, currentResponse, handlerResponse);
          if (responseResult instanceof Response) {
            // Middleware returned a Response for early termination
            return { earlyReturn: responseResult, response: currentResponse };
          }
          if (responseResult !== null && responseResult !== currentResponse) {
            currentResponse = responseResult;
          }
        }
      } catch (error) {
        return { earlyReturn: await this.handleError(error), response: currentResponse };
      }
    }

    return { response: currentResponse };
  }

  /**
   * Creates the final Response object from the processed fakeResponse and handler response
   *
   * @param fakeResponse - The processed FastResponse
   * @param handlerResponse - The handler response payload (used if fakeResponse.body is not set)
   * @param defaultStatus - Default status code if not set
   * @param defaultStatusText - Default status text if not set
   * @returns The final Response object
   * @private
   */
  private createFinalResponse(
    fakeResponse: Response,
    handlerResponse: unknown,
    defaultStatus: number,
    defaultStatusText: string,
  ): Response {
    // FastResponse has a body property, check if it exists and is not null/undefined
    const fakeResponseBody =
      'body' in fakeResponse && (fakeResponse as { body?: string | null }).body != null
        ? (fakeResponse as { body: string | null }).body
        : null;
    const body = fakeResponseBody ?? JSON.stringify(handlerResponse);
    return new Response(body, {
      status: fakeResponse.status ?? defaultStatus,
      statusText: fakeResponse.statusText ?? defaultStatusText,
      headers: fakeResponse.headers,
    });
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
