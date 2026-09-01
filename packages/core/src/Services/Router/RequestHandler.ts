import { Container, Inject } from '@vercube/di';
import { FastResponse } from '../../Types/CommonTypes';
import { skipsGlobalMiddlewares } from '../../Utils/Utils';
import { ErrorHandlerProvider } from '../ErrorHandler/ErrorHandlerProvider';
import { MetadataResolver } from '../Metadata/MetadataResolver';
import { GlobalMiddlewareRegistry } from '../Middleware/GlobalMiddlewareRegistry';
import { TelemetryRegistry } from '../Telemetry/TelemetryRegistry';
import { RequestContext } from './RequestContext';
import type { MetadataTypes } from '../../Types/MetadataTypes';
import type { RouterTypes } from '../../Types/RouterTypes';
import type { TelemetryTypes } from '../../Types/TelemetryTypes';

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

/** Default response `Content-Type` used when the request does not carry one. */
const DEFAULT_CONTENT_TYPE = 'application/json';

/**
 * Shared response init for JSON-serialized handler results.
 *
 * Reused across requests: `Response` copies the init when it is constructed and
 * never mutates the object handed to it.
 */
const JSON_RESPONSE_INIT: ResponseInit = Object.freeze({
  status: 200,
  statusText: 'OK',
  headers: Object.freeze({ 'Content-Type': DEFAULT_CONTENT_TYPE }) as Record<string, string>,
});

/**
 * Dispatch modes, resolved once on the first request and cached.
 *
 * Reading two lazily-resolved services per request measurably cost throughput
 * on a path where the whole request takes ~70ns, so the combination is
 * collapsed into one integer and branched on directly.
 */
const MODE_UNRESOLVED = -1;
const MODE_PLAIN = 0;
const MODE_CONTEXT = 1;
const MODE_TELEMETRY = 2;

/**
 * Handles HTTP requests by preparing and executing route handlers with their associated middlewares
 *
 * The RequestHandler is responsible for:
 * - Preparing route handlers with their metadata
 * - Executing middleware chains (before and after)
 * - Processing request/response lifecycle
 * - Error handling during request processing
 *
 * Everything that can be decided once - which middlewares run, whether any
 * argument resolver is asynchronous, whether the route needs a mutable response
 * object at all - is computed in {@link RequestHandler.prepareHandler} and
 * cached on the route, so the per-request path stays as small as possible.
 */
export class RequestHandler {
  /** Resolver for extracting metadata from controller classes and methods */
  @Inject(MetadataResolver)
  private gMetadataResolver!: MetadataResolver;

  /** DI container for resolving dependencies */
  @Inject(Container)
  private gContainer!: Container;

  @Inject(GlobalMiddlewareRegistry)
  private gGlobalMiddlewareRegistry!: GlobalMiddlewareRegistry;

  /** Cached error handler; resolving it per request shows up under load. */
  private fErrorHandler: ErrorHandlerProvider | undefined;

  /** Cached request context provider (`null` when the app does not bind one). */
  private fRequestContext: RequestContext | null | undefined;

  /** Lazily resolved global middlewares used for CORS preflight responses. */
  private fPreflightMiddlewares: RouterTypes.MiddlewareDefinition[] | undefined;

  /** Cached telemetry hooks (`null` when no telemetry package is installed). */
  private fTelemetry: TelemetryTypes.Hooks | null | undefined;

  /** Which of the three dispatch shapes this application needs. */
  private fMode: number = MODE_UNRESOLVED;

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

    // Infrastructure controllers - an inspector, a health check - opt out of
    // application-wide middlewares entirely.
    const globalMiddlewares = skipsGlobalMiddlewares(prototype) ? [] : this.gGlobalMiddlewareRegistry.middlewares;

    const combined = [...middlewares, ...globalMiddlewares];
    const seen = new Set<MetadataTypes.Middleware['middleware']>();
    const uniqueMiddlewares: MetadataTypes.Middleware[] = [];
    for (const m of combined) {
      if (seen.has(m.middleware)) {
        continue;
      }
      seen.add(m.middleware);
      uniqueMiddlewares.push(m);
    }

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

    const args = method.args.length <= 1 ? method.args : [...method.args].sort((a, b) => a.idx - b.idx);
    const actions = method.actions;

    // `@Res()` hands the intermediate response to the handler and a custom
    // resolver receives the whole event, so both can mutate the response and
    // expect the mutation to survive into the final one.
    const observesResponse = args.some((arg) => arg.type === 'response' || arg.type === 'custom');

    // Routes without middlewares and without response-mutating actions never
    // observe the intermediate response, so they can skip building one.
    const simple = beforeMiddlewares.length === 0 && afterMiddlewares.length === 0 && actions.length === 0 && !observesResponse;

    return {
      instance,
      propertyName,
      controller: instance?.constructor?.name,
      args,
      middlewares: {
        beforeMiddlewares,
        afterMiddlewares,
      },
      actions,
      simple,
      asyncArgs: args.some((arg) => MetadataResolver.isAsyncArg(arg)),
      // The body can only be read once, and cloning is what makes it readable
      // twice - at the cost of materializing a full native request per call.
      // It is only skipped where nothing else can possibly read the body: a
      // route with no middlewares that reads the body exactly once and does not
      // receive the raw request.
      cloneBody: !simple || args.some((arg) => arg.type === 'request') || args.filter((arg) => arg.type === 'body').length > 1,
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
    const context = this.requestContext;
    const telemetry = this.telemetry;

    if (telemetry !== null) {
      const traced = (): Promise<Response> =>
        telemetry.server({ request, name: request.method }, () => this.internalHandlePreflight(request)) as Promise<Response>;

      return context ? context.run(traced) : traced();
    }

    return context ? context.run(() => this.internalHandlePreflight(request)) : this.internalHandlePreflight(request);
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
      const fakeResponse = this.createInitialResponse();

      this.fPreflightMiddlewares ??= this.resolveMiddlewares(this.gGlobalMiddlewareRegistry.middlewares);

      // Execute both onRequest and onResponse for each middleware (preflight pattern)
      const result = await this.executeMiddlewares(this.fPreflightMiddlewares, {
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
   * @returns {Response | Promise<Response>} The HTTP response, returned synchronously when the route allows it
   */
  public handleRequest(
    request: Request,
    route: RouterTypes.RouteMatched<RouterTypes.RouterHandler>,
  ): Response | Promise<Response> {
    const mode = this.fMode;

    if (mode === MODE_PLAIN) {
      return this.dispatch(request, route);
    }

    if (mode === MODE_CONTEXT) {
      return (this.fRequestContext as RequestContext).run(() => this.dispatch(request, route));
    }

    if (mode === MODE_TELEMETRY) {
      return this.tracedDispatch(request, route);
    }

    this.resolveMode();

    return this.handleRequest(request, route);
  }

  /**
   * Resolves which dispatch shape the application needs.
   *
   * Runs once, on the first request. A telemetry package therefore has to
   * install itself during setup - by the time the first request is served this
   * decision is frozen.
   *
   * @returns {void}
   * @private
   */
  private resolveMode(): void {
    const context = this.requestContext;
    const telemetry = this.telemetry;

    this.fMode = telemetry === null ? (context ? MODE_CONTEXT : MODE_PLAIN) : MODE_TELEMETRY;
  }

  /**
   * Runs the request inside a server span, and inside the request context frame
   * when one is bound.
   *
   * @param {Request} request - The incoming HTTP request
   * @param {RouterTypes.RouteMatched<RouterTypes.RouterHandler>} route - The matched route
   * @returns {Response | Promise<Response>} The HTTP response
   * @private
   */
  private tracedDispatch(
    request: Request,
    route: RouterTypes.RouteMatched<RouterTypes.RouterHandler>,
  ): Response | Promise<Response> {
    const telemetry = this.fTelemetry as TelemetryTypes.Hooks;
    const traced = (): Response | Promise<Response> =>
      telemetry.server(toServerSpanContext(request, route.data), () => this.dispatch(request, route));

    return this.fRequestContext ? this.fRequestContext.run(traced) : traced();
  }

  /**
   * Picks between the allocation-free path and the full middleware pipeline.
   *
   * @param {Request} request - The incoming HTTP request
   * @param {RouterTypes.RouteMatched<RouterTypes.RouterHandler>} route - The matched route
   * @returns {Response | Promise<Response>} The HTTP response
   * @private
   */
  private dispatch(request: Request, route: RouterTypes.RouteMatched<RouterTypes.RouterHandler>): Response | Promise<Response> {
    return route.data?.simple ? this.handleSimpleRequest(request, route) : this.internalHandleRequest(request, route);
  }

  /**
   * Handles a route that has no middlewares and no response-mutating actions.
   *
   * Such a route never observes the intermediate response object, so nothing
   * besides the handler arguments and the final response has to be allocated.
   * When every argument resolver and the handler itself are synchronous, the
   * response is produced without creating a single promise.
   *
   * @param {Request} request - The incoming HTTP request
   * @param {RouterTypes.RouteMatched<RouterTypes.RouterHandler>} route - The matched route
   * @returns {Response | Promise<Response>} The HTTP response
   * @private
   */
  private handleSimpleRequest(
    request: Request,
    route: RouterTypes.RouteMatched<RouterTypes.RouterHandler>,
  ): Response | Promise<Response> {
    const { instance, propertyName, args, asyncArgs, cloneBody } = route.data;

    try {
      if (args.length === 0) {
        return this.finalize(instance[propertyName]());
      }

      const event: RouterTypes.RouterEvent = {
        data: route.data,
        params: route.params,
        request,
        // A simple route has no argument that can observe the response, so the
        // intermediate one never has to be allocated - see prepareHandler.
        response: undefined as unknown as Response,
        cloneBody,
      };

      if (asyncArgs) {
        return this.gMetadataResolver.resolveArgValuesAsync(args, event).then(
          (values) => this.finalize(instance[propertyName](...values)),
          (error: unknown) => this.handleError(error),
        );
      }

      const values = this.gMetadataResolver.resolveArgValues(args, event);
      return this.finalize(instance[propertyName](...values));
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Turns a handler result - which may still be a promise - into a response.
   *
   * @param {unknown} handlerResponse - The value returned by the route handler
   * @returns {Response | Promise<Response>} The HTTP response
   * @private
   */
  private finalize(handlerResponse: unknown): Response | Promise<Response> {
    if (handlerResponse instanceof Promise) {
      return handlerResponse.then(
        (value: unknown) => this.createSimpleResponse(value),
        (error: unknown) => this.handleError(error),
      );
    }

    return this.createSimpleResponse(handlerResponse);
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
        cloneBody = true,
      } = route.data;
      let fakeResponse = this.createInitialResponse();

      // 1. Resolve all args
      const resolvedArgs =
        args.length > 0
          ? await this.gMetadataResolver.resolveArgs(args, {
              data: route.data,
              params: route.params,
              request,
              response: fakeResponse,
              cloneBody,
            })
          : [];

      // 2. Call before route middlewares
      if (middlewares.beforeMiddlewares.length > 0) {
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
      }

      // 3. Call every actions
      for (const action of actions) {
        const actionResponse = action.handler(request, fakeResponse);
        if (actionResponse != null) {
          fakeResponse = this.processOverrideResponse(actionResponse, fakeResponse);
        }
      }

      // 4. Call current route handler
      let handlerResponse = instance[propertyName].call(instance, ...toValues(resolvedArgs));
      if (handlerResponse instanceof Promise) {
        handlerResponse = await handlerResponse;
      }

      // 5. Call after route middlewares
      if (middlewares.afterMiddlewares.length > 0) {
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
      }

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
   * Returns the request context provider, or `null` when none is bound.
   *
   * @returns {RequestContext | null} The request context provider
   * @private
   */
  private get requestContext(): RequestContext | null {
    // `getOptional` returns `null` when unbound, which `??=` would treat as
    // "not cached yet" and look up again on every single request.
    if (this.fRequestContext === undefined) {
      this.fRequestContext = this.gContainer.getOptional(RequestContext);
    }

    return this.fRequestContext;
  }

  /**
   * Returns the installed telemetry hooks, or `null` when telemetry is off.
   *
   * Resolved once and cached, so a telemetry package has to install itself
   * during application setup - by the time the first request is served this
   * value is frozen.
   *
   * @returns {TelemetryTypes.Hooks | null} The telemetry hooks
   * @private
   */
  private get telemetry(): TelemetryTypes.Hooks | null {
    if (this.fTelemetry === undefined) {
      this.fTelemetry = this.gContainer.getOptional(TelemetryRegistry)?.hooks ?? null;
    }

    return this.fTelemetry;
  }

  /**
   * Creates the intermediate response that middlewares and actions mutate.
   *
   * @returns The initial FastResponse
   * @private
   */
  private createInitialResponse(): Response {
    return new FastResponse(undefined, { headers: { 'Content-Type': DEFAULT_CONTENT_TYPE } });
  }

  /**
   * Serializes a handler result into the final response of a simple route.
   *
   * @param handlerResponse - The value returned by the route handler
   * @returns The final Response object
   * @private
   */
  private createSimpleResponse(handlerResponse: unknown): Response {
    if (handlerResponse instanceof Response) {
      return handlerResponse;
    }

    return new FastResponse(JSON.stringify(handlerResponse), JSON_RESPONSE_INIT);
  }

  /**
   * Handles errors by delegating to ErrorHandlerProvider
   *
   * @param error - The error to handle
   * @returns The error response
   * @private
   */
  private handleError(error: unknown): Response | Promise<Response> {
    // Errors never escape the pipeline - they are turned into responses here -
    // so this is the only place the active span can learn what actually failed.
    this.telemetry?.recordError(error);

    this.fErrorHandler ??= this.gContainer.get(ErrorHandlerProvider);
    return this.fErrorHandler.handleError(error as Error);
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

    for (const hook of middlewares) {
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

    // FastResponse leaves the body untouched until it is written to the socket,
    // while the global Response would immediately wrap it in a ReadableStream.
    return new FastResponse(body, {
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

/**
 * Builds the span context for a matched route.
 *
 * Every field but the request itself was resolved at registration time, so this
 * is a property copy rather than any real work.
 *
 * @param {Request} request - The incoming HTTP request
 * @param {RouterTypes.RouterHandler} handler - The matched route handler
 * @returns {TelemetryTypes.ServerSpanContext} The span context
 */
function toServerSpanContext(request: Request, handler: RouterTypes.RouterHandler): TelemetryTypes.ServerSpanContext {
  return {
    request,
    name: handler.spanName ?? request.method,
    route: handler.path,
    controller: handler.controller,
    handler: handler.propertyName,
  };
}

/**
 * Extracts the resolved values of already resolved arguments.
 *
 * @param {MetadataTypes.Arg[]} args - Resolved arguments
 * @returns {unknown[]} The values in handler parameter order
 */
function toValues(args: MetadataTypes.Arg[]): unknown[] {
  const values: unknown[] = Array.from({ length: args.length });

  for (let i = 0; i < args.length; i++) {
    values[i] = args[i].resolved;
  }

  return values;
}
