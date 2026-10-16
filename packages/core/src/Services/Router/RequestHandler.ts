import { Container, Inject } from '@vercube/di';
import { ValidationMiddleware } from '../../Middleware/ValidationMiddleware';
import { FastResponse } from '../../Types/CommonTypes';
import { isSameMiddleware } from '../../Utils/MiddlewareUtils';
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
 * Default maximum request body size read by `@Body()`: 1 MiB.
 */
const DEFAULT_BODY_LIMIT = 1024 * 1024;

/**
 * Headers every intermediate response starts with.
 *
 * The single source for both {@link RequestHandler.createInitialResponse} and
 * `mergeResponseHeaders`, which skips a header while it still holds its initial
 * value - nobody set it on purpose. Keys are lowercase, as `Headers` yields them.
 */
const INITIAL_RESPONSE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-type': DEFAULT_CONTENT_TYPE,
});

/**
 * Headers describing a response body rather than the response.
 *
 * Not copied onto an error response or one a middleware ended the request with:
 * those carry their own body, which a `Content-Type` set for the handler's one
 * would mislabel.
 */
const REPRESENTATION_HEADERS: ReadonlySet<string> = new Set([
  'content-type',
  'content-encoding',
  'content-length',
  'content-range',
  'content-disposition',
]);

/**
 * Headers that only describe a successful response: caching, validators and
 * the redirect target. An error response, or one a middleware ends the request
 * with, must not inherit them, or a CDN would cache a 404 for as long as the
 * page it replaced.
 */
const SUCCESS_ONLY_HEADERS: ReadonlySet<string> = new Set(['cache-control', 'etag', 'last-modified', 'expires', 'location']);

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

  /**
   * Global middlewares for requests no route handles (preflight, static files,
   * 404, 405), rebuilt when the registry hands out a new list.
   */
  private fGlobalChain: { source: MetadataTypes.Middleware[]; chain: RouterTypes.RouterHandler['middlewares'] } | undefined;

  /** Cached telemetry hooks (`null` when no telemetry package is installed). */
  private fTelemetry: TelemetryTypes.Hooks | null | undefined;

  /** Maximum request body size in bytes, `undefined` when unlimited. */
  private fBodyLimit: number | undefined = DEFAULT_BODY_LIMIT;

  /** Which of the three dispatch shapes this application needs. */
  private fMode: number = MODE_UNRESOLVED;

  /**
   * Sets the maximum request body size read by `@Body()`.
   *
   * @param {number | false | undefined} limit - The limit in bytes, `false` to disable it, `undefined` for the default
   */
  public setBodyLimit(limit: number | false | undefined): void {
    this.fBodyLimit = limit === false ? undefined : (limit ?? DEFAULT_BODY_LIMIT);
  }

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

    // app-wide first, then the controller's, then the method's: sorting by
    // priority is stable, so this is the order at equal priority
    const { beforeMiddlewares, afterMiddlewares } = this.buildMiddlewareChain([...globalMiddlewares, ...middlewares]);

    const args = method.args.length <= 1 ? method.args : [...method.args].sort((a, b) => a.idx - b.idx);
    // a copy, so actions another application registers later never reach this route
    const actions = [...method.actions];

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
      argResolvers: MetadataResolver.compileArgs(args),
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
      cloneBody:
        !simple ||
        args.some((arg) => arg.type === 'request') ||
        args.filter((arg) => arg.type === 'body' || arg.type === 'multipart-form-data').length > 1,
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
      const { beforeMiddlewares, afterMiddlewares } = this.globalChain();

      // the same order a route runs them in: every onRequest, then every onResponse
      const before = await this.executeMiddlewares(beforeMiddlewares, {
        request,
        response: new FastResponse(undefined, { status: 204, statusText: 'No Content' }),
        methodArgs: undefined,
        handlerResponse: undefined,
        executeRequest: true,
        executeResponse: false,
      });

      if (before.earlyReturn) {
        return mergeResponseHeaders(before.earlyReturn, before.response, false);
      }

      const after = await this.executeMiddlewares(afterMiddlewares, {
        request,
        response: before.response,
        methodArgs: undefined,
        handlerResponse: undefined,
        executeRequest: false,
        executeResponse: true,
      });

      if (after.earlyReturn) {
        return mergeResponseHeaders(after.earlyReturn, after.response, false);
      }

      // no body, so no content type either
      return new FastResponse(null, {
        status: after.response.status,
        statusText: after.response.statusText,
        headers: after.response.headers,
      });
    } catch (error) {
      return await this.handleError(error);
    }
  }

  /**
   * Handles a request no route matched - a static file, the SPA fallback, a
   * 404 or a 405 - through the global middlewares, so CORS and security
   * headers reach it like any routed response.
   *
   * @param {Request} request - The incoming HTTP request
   * @param {(response: Response) => Promise<Response>} produce - Builds the response; may set headers
   *   on the intermediate response it receives, and throws for an error response
   * @returns {Promise<Response>} The HTTP response
   */
  public handleUnmatched(request: Request, produce: (response: Response) => Promise<Response>): Promise<Response> {
    const context = this.requestContext;

    return context
      ? context.run(() => this.internalHandleUnmatched(request, produce))
      : this.internalHandleUnmatched(request, produce);
  }

  /**
   * Internal method behind {@link RequestHandler.handleUnmatched}.
   *
   * @param {Request} request - The incoming HTTP request
   * @param {(response: Response) => Promise<Response>} produce - Builds the response
   * @returns {Promise<Response>} The HTTP response
   * @private
   */
  private async internalHandleUnmatched(request: Request, produce: (response: Response) => Promise<Response>): Promise<Response> {
    let fakeResponse = this.createInitialResponse();

    try {
      const { beforeMiddlewares, afterMiddlewares } = this.globalChain();

      if (beforeMiddlewares.length > 0) {
        const before = await this.executeMiddlewares(beforeMiddlewares, {
          request,
          response: fakeResponse,
          methodArgs: undefined,
          handlerResponse: undefined,
          executeRequest: true,
          executeResponse: false,
        });

        if (before.earlyReturn) {
          return mergeResponseHeaders(before.earlyReturn, before.response, false);
        }

        fakeResponse = before.response;
      }

      let response: Response;
      let ownsBody = true;

      try {
        response = await produce(fakeResponse);
      } catch (error) {
        response = await this.handleError(error);
        ownsBody = false;
      }

      if (afterMiddlewares.length > 0) {
        const after = await this.executeMiddlewares(afterMiddlewares, {
          request,
          response: fakeResponse,
          methodArgs: undefined,
          handlerResponse: undefined,
          executeRequest: false,
          executeResponse: true,
        });

        if (after.earlyReturn) {
          return mergeResponseHeaders(after.earlyReturn, after.response, false);
        }

        fakeResponse = after.response;
      }

      return mergeResponseHeaders(response, fakeResponse, ownsBody);
    } catch (error) {
      return mergeResponseHeaders(await this.handleError(error), fakeResponse, false);
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
    const { instance, propertyName, args, argResolvers, asyncArgs, cloneBody } = route.data;

    try {
      if (args.length === 0) {
        return this.finalize(instance[propertyName]());
      }

      // Absent only for a handler assembled without `prepareHandler`, which the
      // resolver still serves from the raw metadata.
      const plan = argResolvers ?? MetadataResolver.compileArgs(args);

      const event: RouterTypes.RouterEvent = {
        data: route.data,
        params: route.params,
        request,
        // A simple route has no argument that can observe the response, so the
        // intermediate one never has to be allocated - see prepareHandler.
        response: undefined as unknown as Response,
        cloneBody,
        bodyLimit: this.fBodyLimit,
      };

      if (asyncArgs) {
        return this.gMetadataResolver.resolveCompiledArgValuesAsync(plan, event).then(
          (values) => this.finalize(instance[propertyName](...values)),
          (error: unknown) => this.handleError(error),
        );
      }

      const values = this.gMetadataResolver.resolveCompiledArgValues(plan, event);
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
    // Outside the try, so an error response still gets the headers set so far.
    let fakeResponse = this.createInitialResponse();

    try {
      const {
        instance,
        propertyName,
        actions = [],
        args = [],
        middlewares = { beforeMiddlewares: [], afterMiddlewares: [] },
        cloneBody = true,
      } = route.data;

      // Validation middlewares are sorted last, see prepareHandler.
      const before = middlewares.beforeMiddlewares;
      let validationStart = before.findIndex((m) => m.middleware instanceof ValidationMiddleware);
      if (validationStart === -1) {
        validationStart = before.length;
      }

      // 1. Call before route middlewares, so auth and CORS run before the body is read
      if (validationStart > 0) {
        const beforeResult = await this.executeMiddlewares(
          validationStart === before.length ? before : before.slice(0, validationStart),
          {
            request,
            response: fakeResponse,
            methodArgs: undefined,
            handlerResponse: undefined,
            executeRequest: true,
            executeResponse: false,
          },
        );
        if (beforeResult.earlyReturn) {
          return mergeResponseHeaders(beforeResult.earlyReturn, beforeResult.response, false);
        }
        fakeResponse = beforeResult.response;
      }

      // 2. Resolve all args
      const resolvedArgs =
        args.length > 0
          ? await this.gMetadataResolver.resolveArgs(args, {
              data: route.data,
              params: route.params,
              request,
              response: fakeResponse,
              cloneBody,
              bodyLimit: this.fBodyLimit,
            })
          : [];

      // 2b. Validate the resolved args
      if (validationStart < before.length) {
        const validationResult = await this.executeMiddlewares(before.slice(validationStart), {
          request,
          response: fakeResponse,
          methodArgs: resolvedArgs,
          handlerResponse: undefined,
          executeRequest: true,
          executeResponse: false,
        });
        if (validationResult.earlyReturn) {
          return mergeResponseHeaders(validationResult.earlyReturn, validationResult.response, false);
        }
        fakeResponse = validationResult.response;
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
          return mergeResponseHeaders(afterResult.earlyReturn, afterResult.response, false);
        }
        fakeResponse = afterResult.response;
      }

      // 6. If handlerResponse is already instance of Response, return it with
      //    the headers middlewares and actions set on the intermediate response
      if (handlerResponse instanceof Response) {
        return mergeResponseHeaders(handlerResponse, fakeResponse);
      }

      // 7. Otherwise prepare new response
      return this.createFinalResponse(fakeResponse, handlerResponse, 200, 'OK');
    } catch (error) {
      return mergeResponseHeaders(await this.handleError(error), fakeResponse, false);
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
    return new FastResponse(undefined, { headers: INITIAL_RESPONSE_HEADERS });
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
   * Dedupes, resolves and sorts middlewares into a before and an after chain.
   *
   * The same middleware with different arguments - `@Auth()` on the controller
   * and `@Auth({ roles: ['admin'] })` on the method - runs once per set of
   * arguments, so a stricter requirement is never dropped in favour of a looser one.
   *
   * @param {MetadataTypes.Middleware[]} middlewares - Middleware definitions, route ones first
   * @returns The before and after chains
   * @private
   */
  private buildMiddlewareChain(middlewares: MetadataTypes.Middleware[]): {
    beforeMiddlewares: RouterTypes.MiddlewareDefinition[];
    afterMiddlewares: RouterTypes.MiddlewareDefinition[];
  } {
    const uniqueMiddlewares: MetadataTypes.Middleware[] = [];
    for (const m of middlewares) {
      const index = uniqueMiddlewares.findIndex((unique) => isSameMiddleware(unique, m));

      if (index === -1) {
        uniqueMiddlewares.push(m);
        continue;
      }

      // registered twice - globally at priority 1 and by `@Middleware()` at the
      // default - it runs once, at the earliest priority it was asked for
      if ((m.priority ?? 999) < (uniqueMiddlewares[index].priority ?? 999)) {
        uniqueMiddlewares[index] = { ...uniqueMiddlewares[index], priority: m.priority };
      }
    }

    // resolve middlewares
    const resolvedMiddlewares = uniqueMiddlewares.map((m) => ({
      ...m,
      middleware: this.gContainer.resolve(m.middleware),
    }));

    // get middleware types
    const beforeMiddlewares = resolvedMiddlewares.filter((m) => !!m.middleware.onRequest);
    const afterMiddlewares = resolvedMiddlewares.filter((m) => !!m.middleware.onResponse);

    // sort middlewares by priority, validation always runs last: it needs the
    // resolved arguments, and they are only resolved once auth, CORS and the
    // rest of the before middlewares let the request through
    beforeMiddlewares.sort(
      (a, b) =>
        Number(a.middleware instanceof ValidationMiddleware) - Number(b.middleware instanceof ValidationMiddleware) ||
        (a?.priority ?? 999) - (b?.priority ?? 999),
    );
    afterMiddlewares.sort((a, b) => (a?.priority ?? 999) - (b?.priority ?? 999));

    return { beforeMiddlewares, afterMiddlewares };
  }

  /**
   * The global middleware chain, rebuilt whenever a global middleware is
   * registered: the registry hands out a new list then.
   *
   * @returns The before and after chains of the global middlewares
   * @private
   */
  private globalChain(): RouterTypes.RouterHandler['middlewares'] {
    const source = this.gGlobalMiddlewareRegistry.middlewares;

    if (this.fGlobalChain?.source !== source) {
      this.fGlobalChain = { source, chain: this.buildMiddlewareChain(source) };
    }

    return this.fGlobalChain.chain;
  }

  /**
   * Executes a middleware's onRequest hook
   *
   * @param hook - The middleware definition
   * @param request - The HTTP request
   * @param response - The current response
   * @param methodArgs - Resolved method arguments
   * @returns The value returned by the hook, or null
   * @private
   */
  private async executeMiddlewareRequest(
    hook: RouterTypes.MiddlewareDefinition,
    request: Request,
    response: Response,
    methodArgs: MetadataTypes.Arg[] | undefined,
  ): Promise<Response | ResponseInit | null> {
    const hookResponse = await hook.middleware.onRequest?.(request, response, {
      middlewareArgs: hook.args,
      methodArgs,
    });

    return hookResponse ?? null;
  }

  /**
   * Executes a middleware's onResponse hook
   *
   * @param hook - The middleware definition
   * @param request - The HTTP request
   * @param response - The current response
   * @param payload - The handler response payload
   * @returns The value returned by the hook, or null
   * @private
   */
  private async executeMiddlewareResponse(
    hook: RouterTypes.MiddlewareDefinition,
    request: Request,
    response: Response,
    payload: unknown,
  ): Promise<Response | ResponseInit | null> {
    const hookResponse = await hook.middleware.onResponse?.(request, response, payload);

    return hookResponse ?? null;
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
      methodArgs: MetadataTypes.Arg[] | undefined;
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
          if (requestResult !== null) {
            // A ResponseInit only tweaks the current response, the pipeline goes on
            currentResponse = this.processOverrideResponse(requestResult, currentResponse);
          }
        }

        // Execute onResponse hook if requested
        if (executeResponse) {
          const responseResult = await this.executeMiddlewareResponse(hook, request, currentResponse, handlerResponse);
          if (responseResult instanceof Response) {
            // Middleware returned a Response for early termination
            return { earlyReturn: responseResult, response: currentResponse };
          }
          if (responseResult !== null) {
            // A ResponseInit only tweaks the current response, the pipeline goes on
            currentResponse = this.processOverrideResponse(responseResult, currentResponse);
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

      // Merge the init headers into the ones set so far instead of replacing them
      const headers = new Headers(fakeResponse.headers);
      if (responseInit?.headers) {
        for (const [key, value] of new Headers(responseInit.headers)) {
          if (key === 'set-cookie') {
            headers.append(key, value);
          } else if (key === 'vary') {
            headers.set(key, mergeVary(headers.get(key) ?? '', value));
          } else {
            headers.set(key, value);
          }
        }
      }

      // override fake response before pass it to the args
      fakeResponse = new FastResponse(undefined, {
        status: responseInit?.status ?? fakeResponse.status,
        headers,
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
  const values: unknown[] = [];

  for (let i = 0; i < args.length; i++) {
    values.push(args[i].resolved);
  }

  return values;
}

/**
 * Whether a `Location` header means something on a response with this status.
 *
 * @param {number} status - The response status
 * @returns {boolean} True for a redirect or `201 Created`
 */
function isRedirectOrCreated(status: number): boolean {
  return status === 201 || (status >= 300 && status < 400);
}

/**
 * Copies headers set by middlewares and actions on the intermediate response
 * onto a response built elsewhere - by the handler (a stream, a file, a proxied
 * response), by a middleware that ended the request early, or by the error
 * handler - which would otherwise lose them, CORS headers included.
 *
 * Only headers something actually set are copied: the initial headers every
 * intermediate response starts with (`INITIAL_RESPONSE_HEADERS`) are skipped,
 * so a file or a stream returned without a type does not turn into
 * `application/json`.
 *
 * The target wins: a header it already set is kept. Two headers are merged
 * instead, as both sides contribute independent values to them: `Set-Cookie`
 * per cookie (except those the target set under the same name) and `Vary` per
 * token, so a CORS `Vary: Origin` survives a handler that varies on something else.
 *
 * @param {Response} target - The response that is going to be sent
 * @param {Response} source - The intermediate response
 * @param {boolean} [ownsBody] - Whether the headers describing the body of the intermediate response
 *   (`REPRESENTATION_HEADERS`) apply to the target; false for responses the framework did not ask for,
 *   such as an error response, so a `@SetHeader('Content-Type', ...)` meant for the handler does not mislabel them.
 *   Those responses do not get `SUCCESS_ONLY_HEADERS` either
 * @returns {Response} The target with merged headers, or a copy of it when its headers are immutable
 */
function mergeResponseHeaders(target: Response, source: Response, ownsBody: boolean = true): Response {
  // `Response.error()` is a network error - it has no headers to merge into.
  if (target.type === 'error') {
    return target;
  }

  const additions: [string, string][] = [];

  for (const [key, value] of source.headers) {
    if (key === 'set-cookie' || INITIAL_RESPONSE_HEADERS[key] === value) {
      continue;
    }

    if (!ownsBody && (REPRESENTATION_HEADERS.has(key) || SUCCESS_ONLY_HEADERS.has(key))) {
      continue;
    }

    // `@Redirect` on a handler that returns its own non-redirect response
    if (key === 'location' && !isRedirectOrCreated(target.status)) {
      continue;
    }

    const current = target.headers.get(key);

    if (current === null) {
      additions.push([key, value]);
    } else if (key === 'vary') {
      const merged = mergeVary(current, value);

      if (merged !== current) {
        additions.push([key, merged]);
      }
    }
  }

  // A cookie the target set itself wins over a middleware cookie of the same name.
  const targetCookies = new Set(target.headers.getSetCookie().map(toCookieName));
  const cookies = source.headers.getSetCookie().filter((cookie) => !targetCookies.has(toCookieName(cookie)));

  // A response from `fetch()` carries an already decoded body, but still the
  // encoding and length of the original one - sent as is, the client would
  // try to decode it again.
  const fetched = target.type === 'basic' || target.type === 'cors';
  const decoded = fetched && target.headers.has('content-encoding');

  if (additions.length === 0 && cookies.length === 0 && !decoded) {
    return target;
  }

  const apply = (response: Response): Response => {
    for (const [key, value] of additions) {
      response.headers.set(key, value);
    }

    for (const cookie of cookies) {
      response.headers.append('set-cookie', cookie);
    }

    return response;
  };

  // Headers of a fetched response are always immutable, so only try to write
  // to the others.
  if (!fetched) {
    try {
      return apply(target);
    } catch (error) {
      // Immutable headers (e.g. `Response.redirect()`) throw a TypeError on the
      // first write, so nothing was applied yet - anything else is a real error.
      if (!(error instanceof TypeError)) {
        throw error;
      }
    }
  }

  // Re-wrap the same body in a new response, whose headers are writable.
  const headers = new Headers(target.headers);

  if (fetched) {
    headers.delete('content-encoding');
    headers.delete('content-length');
  }

  return apply(
    new FastResponse(target.body, {
      status: target.status,
      statusText: target.statusText,
      headers,
    }),
  );
}

/**
 * Merges two `Vary` header values, keeping each token once.
 *
 * @param {string} target - The value of the response being sent
 * @param {string} source - The value set on the intermediate response
 * @returns {string} The merged value, `*` when either side varies on everything
 */
function mergeVary(target: string, source: string): string {
  const tokens = target
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
  const seen = new Set(tokens.map((token) => token.toLowerCase()));

  for (const raw of source.split(',')) {
    const token = raw.trim();

    if (token && !seen.has(token.toLowerCase())) {
      seen.add(token.toLowerCase());
      tokens.push(token);
    }
  }

  return seen.has('*') ? '*' : tokens.join(', ');
}

/**
 * Extracts the name from a `Set-Cookie` header value.
 *
 * @param {string} cookie - The header value, e.g. `session=abc; HttpOnly`
 * @returns {string} The cookie name, e.g. `session`
 */
function toCookieName(cookie: string): string {
  const index = cookie.indexOf('=');
  return (index === -1 ? cookie : cookie.slice(0, index)).trim();
}
