import { Container, Inject } from '@vercube/di';
import { Logger } from '@vercube/logger';
import { MethodNotAllowedError } from '../../Errors/Http/MethodNotAllowedError';
import { NotFoundError } from '../../Errors/Http/NotFoundError';
import { FastResponse } from '../../Types/CommonTypes';
import { withoutStack } from '../../Utils/Errors';
import { isSameMiddleware, resolveSlots } from '../../Utils/MiddlewareUtils';
import { skipsGlobalMiddlewares } from '../../Utils/Utils';
import { DefaultErrorHandlerProvider } from '../ErrorHandler/DefaultErrorHandlerProvider';
import { ErrorHandlerProvider } from '../ErrorHandler/ErrorHandlerProvider';
import { MetadataResolver } from '../Metadata/MetadataResolver';
import { GlobalMiddlewareRegistry } from '../Middleware/GlobalMiddlewareRegistry';
import { TelemetryRegistry } from '../Telemetry/TelemetryRegistry';
import { ValidationProvider } from '../Validation/ValidationProvider';
import { RequestContext } from './RequestContext';
import type { RouteInfo } from '../../Types/CommonTypes';
import type { MetadataTypes } from '../../Types/MetadataTypes';
import type { RouterTypes } from '../../Types/RouterTypes';
import type { TelemetryTypes } from '../../Types/TelemetryTypes';
import type { ValidationTypes } from '../../Types/ValidationTypes';
import type { ArgValidator } from '../Metadata/MetadataResolver';

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
 * Shared response init for a handler that returned `undefined`: no body, so no
 * content type either. Reused across requests, see {@link JSON_RESPONSE_INIT}.
 */
const NO_CONTENT_RESPONSE_INIT: ResponseInit = Object.freeze({
  status: 204,
  statusText: 'No Content',
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

  /** Cached validation provider (`null` when the app does not bind one). */
  private fValidationProvider: ValidationProvider | null | undefined;

  /**
   * Validates a resolved argument against its schema, compiled into the
   * argument resolvers of every route.
   *
   * The provider is looked up on the first validated request rather than when
   * the route is prepared, so one bound during setup is still picked up.
   */
  private readonly fValidator: ArgValidator = (schema: ValidationTypes.Schema, data: unknown) => {
    if (this.fValidationProvider === undefined) {
      this.fValidationProvider = this.gContainer.getOptional(ValidationProvider);
    }

    if (!this.fValidationProvider) {
      this.gContainer.getOptional(Logger)?.warn('RequestHandler::ValidationProvider', 'Validation provider is not registered');

      return undefined;
    }

    return this.fValidationProvider.validate(schema, data);
  };

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
    const { beforeMiddlewares, afterMiddlewares } = this.buildMiddlewareChain([...globalMiddlewares, ...middlewares], {
      controller: instance?.constructor?.name ?? 'Unknown',
      handler: propertyName,
    });

    const args = method.args.length <= 1 ? method.args : [...method.args].sort((a, b) => a.idx - b.idx);
    // a copy, so actions another application registers later never reach this route
    const actions = [...method.actions];

    // `@Res()` hands the intermediate response to the handler and a custom
    // resolver receives the whole event, so both can mutate the response and
    // expect the mutation to survive into the final one.
    const observesResponse = args.some((arg) => arg.type === 'response' || arg.type === 'custom');

    // `@Status`, `@SetHeader` and `@Redirect` do the same for every request,
    // so what they make of the response is worked out here, once.
    const staticActions = actions.every((action) => action.static === true);

    // Routes without middlewares and without actions that depend on the request
    // never observe the intermediate response, so they can skip building one.
    const simple = beforeMiddlewares.length === 0 && afterMiddlewares.length === 0 && staticActions && !observesResponse;

    const asyncArgs = args.some((arg) => MetadataResolver.isAsyncArg(arg));

    return {
      instance,
      propertyName,
      controller: instance?.constructor?.name,
      args,
      argResolvers: MetadataResolver.compileArgs(args, this.fValidator),
      middlewares: {
        beforeMiddlewares,
        afterMiddlewares,
      },
      actions,
      simple,
      observesResponse,
      staticResponse: staticActions && actions.length > 0 && !observesResponse ? this.foldActions(actions) : undefined,
      asyncArgs,
      maybeAsyncArgs: !asyncArgs && args.some((arg) => MetadataResolver.isValidatedArg(arg)),
      // The body can only be read once. Where something may read it after the
      // handler's argument did - a middleware answering the response, a second
      // body argument, an action that is handed the request, a handler or
      // resolver holding the raw request
      // - it is read once and shared, see `Utils/SharedBody`. Everywhere else
      // it is read straight off the request, which is cheaper still. Before
      // middlewares do not count: they are done by the time arguments resolve.
      cloneBody:
        !staticActions ||
        afterMiddlewares.some((definition) => readsBody(definition.middleware)) ||
        args.some((arg) => arg.type === 'request' || arg.type === 'custom') ||
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
   * Answers a request that no route matched and no file can answer: a 405 when
   * the path is routed for other methods, a 404 otherwise.
   *
   * Without global middlewares nothing can observe such a request, so the
   * error response is built on the spot, synchronously when the error handler
   * is. With them it goes through {@link RequestHandler.handleUnmatched}, so
   * CORS and security headers reach it.
   *
   * @param {Request} request - The incoming HTTP request
   * @param {string[]} allowed - The methods the path is routed for, empty for a 404
   * @returns {Response | Promise<Response>} The HTTP response
   */
  public handleMiss(request: Request, allowed: string[]): Response | Promise<Response> {
    const context = this.requestContext;

    return context ? context.run(() => this.internalHandleMiss(request, allowed)) : this.internalHandleMiss(request, allowed);
  }

  /**
   * Internal method behind {@link RequestHandler.handleMiss}.
   *
   * @param {Request} request - The incoming HTTP request
   * @param {string[]} allowed - The methods the path is routed for, empty for a 404
   * @returns {Response | Promise<Response>} The HTTP response
   * @private
   */
  private internalHandleMiss(request: Request, allowed: string[]): Response | Promise<Response> {
    const { beforeMiddlewares, afterMiddlewares } = this.globalChain();
    const error = this.createMissError(allowed.length > 0);

    if (beforeMiddlewares.length > 0 || afterMiddlewares.length > 0) {
      return this.internalHandleUnmatched(request, (response) => {
        if (allowed.length > 0) {
          response.headers.set('allow', allowed.join(', '));
        }

        return Promise.reject(error);
      });
    }

    const response = this.handleError(error);

    if (allowed.length === 0) {
      return response;
    }

    const allow = allowed.join(', ');

    return response instanceof Promise ? response.then((settled) => withAllow(settled, allow)) : withAllow(response, allow);
  }

  /**
   * The error a request no route matched is answered with.
   *
   * The default error handler serializes the error and lets go of it, so it is
   * handed the same two instances for every miss: creating an error is most of
   * what a 404 costs otherwise. Any other handler gets one of its own.
   *
   * @param {boolean} routed - Whether the path is routed for other methods
   * @returns {Error} A `MethodNotAllowedError` when it is, a `NotFoundError` otherwise
   * @private
   */
  private createMissError(routed: boolean): Error {
    this.fErrorHandler ??= this.gContainer.get(ErrorHandlerProvider);

    if (this.fErrorHandler?.constructor === DefaultErrorHandlerProvider) {
      return routed ? METHOD_NOT_ALLOWED : NOT_FOUND;
    }

    return withoutStack(() => (routed ? new MethodNotAllowedError('Method not allowed') : new NotFoundError('Route not found')));
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
    const { instance, propertyName, args, argResolvers, asyncArgs, maybeAsyncArgs, cloneBody, staticResponse } = route.data;

    if (staticResponse !== undefined) {
      return this.handleStaticRequest(request, route, staticResponse);
    }

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
          (values) => this.callSimple(route.data, values),
          (error: unknown) => this.handleError(error),
        );
      }

      if (maybeAsyncArgs) {
        const resolved = this.gMetadataResolver.resolveCompiledArgValuesMaybeAsync(plan, event);

        if (resolved instanceof Promise) {
          return resolved.then(
            (values) => this.callSimple(route.data, values),
            (error: unknown) => this.handleError(error),
          );
        }

        return this.finalize(instance[propertyName](...resolved));
      }

      const values = this.gMetadataResolver.resolveCompiledArgValues(plan, event);
      return this.finalize(instance[propertyName](...values));
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Calls the handler of a simple route once its arguments settled.
   *
   * By then the request left the frame that catches a handler's error, so one
   * thrown here would reject the response instead of reaching the error handler.
   *
   * @param {RouterTypes.RouterHandler} data - The route handler
   * @param {unknown[]} values - The resolved handler arguments
   * @returns {Response | Promise<Response>} The HTTP response
   * @private
   */
  private callSimple(data: RouterTypes.RouterHandler, values: unknown[]): Response | Promise<Response> {
    try {
      return this.finalize(data.instance[data.propertyName](...values));
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Handles a simple route decorated with static actions: `@Status`,
   * `@SetHeader`, `@Redirect`.
   *
   * What the actions do to the response was folded when the route was
   * registered, so the request is served like any simple route, with another
   * response init. An error of the handler gets the headers the actions set,
   * as it does in the full pipeline, where actions run before the handler; an
   * error resolving the arguments does not, as they resolve before the actions.
   *
   * @param {Request} request - The incoming HTTP request
   * @param {RouterTypes.RouteMatched<RouterTypes.RouterHandler>} route - The matched route
   * @param {RouterTypes.StaticResponse} fixed - The folded actions
   * @returns {Response | Promise<Response>} The HTTP response
   * @private
   */
  private handleStaticRequest(
    request: Request,
    route: RouterTypes.RouteMatched<RouterTypes.RouterHandler>,
    fixed: RouterTypes.StaticResponse,
  ): Response | Promise<Response> {
    const { args, argResolvers, asyncArgs, cloneBody } = route.data;

    if (args.length === 0) {
      return this.callStatic(route.data, EMPTY_VALUES, fixed);
    }

    try {
      const plan = argResolvers ?? MetadataResolver.compileArgs(args);
      const event: RouterTypes.RouterEvent = {
        data: route.data,
        params: route.params,
        request,
        response: undefined as unknown as Response,
        cloneBody,
        bodyLimit: this.fBodyLimit,
      };

      const values = asyncArgs
        ? this.gMetadataResolver.resolveCompiledArgValuesAsync(plan, event)
        : this.gMetadataResolver.resolveCompiledArgValuesMaybeAsync(plan, event);

      if (values instanceof Promise) {
        return values.then(
          (resolved) => this.callStatic(route.data, resolved, fixed),
          (error: unknown) => this.handleError(error),
        );
      }

      return this.callStatic(route.data, values, fixed);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Calls the handler of a route with static actions and builds its response.
   *
   * @param {RouterTypes.RouterHandler} data - The route handler
   * @param {unknown[]} values - The resolved handler arguments
   * @param {RouterTypes.StaticResponse} fixed - The folded actions
   * @returns {Response | Promise<Response>} The HTTP response
   * @private
   */
  private callStatic(
    data: RouterTypes.RouterHandler,
    values: readonly unknown[],
    fixed: RouterTypes.StaticResponse,
  ): Response | Promise<Response> {
    let result: unknown;

    try {
      result = data.instance[data.propertyName](...values);
    } catch (error) {
      return this.handleStaticError(error, fixed);
    }

    if (result instanceof Promise) {
      return result.then(
        (value: unknown) => this.createSimpleResponse(value, fixed),
        (error: unknown) => this.handleStaticError(error, fixed),
      );
    }

    return this.createSimpleResponse(result, fixed);
  }

  /**
   * Turns an error of a handler with static actions into a response carrying
   * the headers the actions set.
   *
   * @param {unknown} error - The error
   * @param {RouterTypes.StaticResponse} fixed - The folded actions
   * @returns {Response | Promise<Response>} The error response
   * @private
   */
  private handleStaticError(error: unknown, fixed: RouterTypes.StaticResponse): Response | Promise<Response> {
    const response = this.handleError(error);

    return response instanceof Promise
      ? response.then((settled) => mergeResponseHeaders(settled, fixed.source, false))
      : mergeResponseHeaders(response, fixed.source, false);
  }

  /**
   * Runs static actions once and keeps what they make of a response.
   *
   * @param {MetadataTypes.Action[]} actions - The actions of a route, all of them static
   * @returns {RouterTypes.StaticResponse} The folded actions
   * @private
   */
  private foldActions(actions: MetadataTypes.Action[]): RouterTypes.StaticResponse {
    let source = this.createInitialResponse();

    for (const action of actions) {
      // a static action does not read the request, so there is none to hand it
      const override = action.handler(undefined as unknown as Request, source);

      if (override != null) {
        source = this.processOverrideResponse(override, source);
      }
    }

    // The same rules as `createFinalResponse`: a handler without a result
    // answers 204 unless an action picked a status, and never claims to be JSON.
    const noContent = source.status === 200;
    const emptyHeaders = new Headers(source.headers);

    if (emptyHeaders.get('content-type') === DEFAULT_CONTENT_TYPE) {
      emptyHeaders.delete('content-type');
    }

    return {
      source,
      json: Object.freeze({
        status: source.status,
        statusText: source.statusText,
        headers: toHeadersInit(source.headers),
      }),
      empty: Object.freeze({
        status: noContent ? 204 : source.status,
        statusText: noContent ? 'No Content' : source.statusText,
        headers: toHeadersInit(emptyHeaders),
      }),
    };
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
   * Runs a route through its middlewares, actions and handler.
   *
   * Nothing here is asynchronous by itself: every hook, the argument resolvers
   * and the handler are called directly, and the request only leaves this frame
   * when one of them returns a promise. A route whose middlewares and handler
   * are synchronous is therefore answered with a `Response`, not a promise.
   *
   * @param {Request} request - The incoming HTTP request
   * @param {RouterTypes.RouteMatched<RouterTypes.RouterHandler>} route - The matched route with handler data
   * @returns {Response | Promise<Response>} The HTTP response
   * @private
   */
  private internalHandleRequest(
    request: Request,
    route: RouterTypes.RouteMatched<RouterTypes.RouterHandler>,
  ): Response | Promise<Response> {
    return this.advance({
      request,
      route,
      // Only `@Response()` and a custom resolver hand the intermediate response
      // to code that may expect a real one. Everything else gets by with a
      // stand-in that costs nothing until a header is set on it.
      response: route.data.observesResponse === false ? createPendingResponse() : this.createInitialResponse(),
      stage: STAGE_BEFORE,
      index: 0,
      values: EMPTY_VALUES,
      result: undefined,
    });
  }

  /**
   * Moves a request forward until it is answered or something has to be
   * awaited, in which case it is picked up again by {@link RequestHandler.resume}.
   *
   * The order is the one a route always had: before middlewares (so auth and
   * CORS run before the body is read), arguments, actions, the handler, after
   * middlewares.
   *
   * @param {Pipeline} state - The request and how far it got
   * @returns {Response | Promise<Response>} The HTTP response
   * @private
   */
  private advance(state: Pipeline): Response | Promise<Response> {
    const data = state.route.data;

    try {
      if (state.stage === STAGE_BEFORE) {
        const chain = data.middlewares?.beforeMiddlewares ?? EMPTY_CHAIN;

        while (state.index < chain.length) {
          const hook = chain[state.index++];
          const result = hook.middleware.onRequest?.(state.request, state.response, {
            middlewareArgs: hook.args,
            methodArgs: undefined,
            route: hook.route,
          });

          if (result != null) {
            if (isThenable(result)) {
              return this.suspend(state, result, PENDING_HOOK);
            }

            const ended = this.applyHookResult(state, result);

            if (ended !== undefined) {
              return ended;
            }
          }
        }

        state.stage = STAGE_ARGS;
      }

      if (state.stage === STAGE_ARGS) {
        state.stage = STAGE_HANDLER;

        const args = data.args ?? EMPTY_ARGS;

        if (args.length > 0) {
          // Absent only for a handler assembled without `prepareHandler`.
          const plan = data.argResolvers ?? MetadataResolver.compileArgs(args);
          const event: RouterTypes.RouterEvent = {
            data,
            params: state.route.params,
            request: state.request,
            response: state.response,
            cloneBody: data.cloneBody ?? true,
            bodyLimit: this.fBodyLimit,
          };

          if (plan.length === 1) {
            // The common case, a single `@Body()`: waiting for the value itself
            // saves the promise that would wrap it into a list.
            const value = plan[0](event);

            if (value instanceof Promise) {
              return this.suspend(state, value, PENDING_VALUE);
            }

            state.values = [value];
          } else {
            const values =
              data.asyncArgs === false
                ? this.gMetadataResolver.resolveCompiledArgValuesMaybeAsync(plan, event)
                : this.gMetadataResolver.resolveCompiledArgValuesAsync(plan, event);

            if (values instanceof Promise) {
              return this.suspend(state, values, PENDING_VALUES);
            }

            state.values = values;
          }
        }
      }

      if (state.stage === STAGE_HANDLER) {
        state.stage = STAGE_AFTER;
        state.index = 0;

        this.applyActions(state);

        const result = data.instance[data.propertyName](...state.values);

        if (result instanceof Promise) {
          return this.suspend(state, result, PENDING_RESULT);
        }

        state.result = result;
      }

      const chain = data.middlewares?.afterMiddlewares ?? EMPTY_CHAIN;

      while (state.index < chain.length) {
        const hook = chain[state.index++];
        const result = hook.middleware.onResponse?.(state.request, state.response, state.result);

        if (result != null) {
          if (isThenable(result)) {
            return this.suspend(state, result, PENDING_HOOK);
          }

          const ended = this.applyHookResult(state, result);

          if (ended !== undefined) {
            return ended;
          }
        }
      }

      return this.complete(state);
    } catch (error) {
      return this.fail(state, error);
    }
  }

  /**
   * Waits for a hook, the arguments or the handler, then goes on with the request.
   *
   * @param {Pipeline} state - The request and how far it got
   * @param {PromiseLike<unknown>} pending - What is being waited for
   * @param {number} kind - What the settled value is: a hook result, the argument values, a single one, or the handler result
   * @returns {Promise<Response>} The HTTP response
   * @private
   */
  private suspend(state: Pipeline, pending: PromiseLike<unknown>, kind: number): Promise<Response> {
    return Promise.resolve(pending).then(
      (value) => this.resume(state, value, kind),
      (error: unknown) => this.fail(state, error),
    );
  }

  /**
   * Picks a request up where {@link RequestHandler.suspend} left it.
   *
   * @param {Pipeline} state - The request and how far it got
   * @param {unknown} value - The settled value
   * @param {number} kind - What the value is
   * @returns {Response | Promise<Response>} The HTTP response
   * @private
   */
  private resume(state: Pipeline, value: unknown, kind: number): Response | Promise<Response> {
    if (kind === PENDING_VALUE) {
      state.values = [value];
    } else if (kind === PENDING_VALUES) {
      state.values = value as unknown[];
    } else if (kind === PENDING_RESULT) {
      state.result = value;
    } else if (value != null) {
      let ended: Response | undefined;

      try {
        ended = this.applyHookResult(state, value as Response | ResponseInit);
      } catch (error) {
        return this.fail(state, error);
      }

      if (ended !== undefined) {
        return ended;
      }
    }

    return this.advance(state);
  }

  /**
   * Applies what a middleware hook returned: a `Response` ends the request, a
   * `ResponseInit` is merged into the intermediate response and the request
   * goes on.
   *
   * @param {Pipeline} state - The request and how far it got
   * @param {Response | ResponseInit} result - The value the hook returned
   * @returns {Response | undefined} The response the request ends with, if it does
   * @private
   */
  private applyHookResult(state: Pipeline, result: Response | ResponseInit): Response | undefined {
    if (result instanceof PendingResponse) {
      // a hook that returned the intermediate response it was handed
      return result.toResponse();
    }

    if (result instanceof Response) {
      return mergeResponseHeaders(result, state.response, false);
    }

    state.response = this.processOverrideResponse(result, state.response);

    return undefined;
  }

  /**
   * Runs the actions of a route on the intermediate response.
   *
   * Static actions were folded when the route was registered. As long as no
   * middleware changed the response before them, what they make of it is known,
   * and the response is replaced by one that starts from there.
   *
   * @param {Pipeline} state - The request and how far it got
   * @returns {void}
   * @private
   */
  private applyActions(state: Pipeline): void {
    const actions = state.route.data.actions ?? EMPTY_ACTIONS;

    if (actions.length === 0) {
      return;
    }

    const fixed = state.route.data.staticResponse;

    if (fixed !== undefined && isUntouched(state.response)) {
      state.response = createPendingResponse(fixed);

      return;
    }

    for (const action of actions) {
      const override = action.handler(state.request, state.response);

      if (override != null) {
        state.response = this.processOverrideResponse(override, state.response);
      }
    }
  }

  /**
   * Builds the response of a request that went through the whole pipeline.
   *
   * @param {Pipeline} state - The request, with the handler result
   * @returns {Response} The HTTP response
   * @private
   */
  private complete(state: Pipeline): Response {
    const { response, result } = state;

    // A response of the handler's own gets the headers middlewares and actions
    // set on the intermediate one.
    if (result instanceof Response) {
      return mergeResponseHeaders(result, response);
    }

    // No middleware set a header or a status, so the response is the one a
    // route without middlewares answers with, built from a shared init.
    if (isUntouched(response)) {
      return this.createSimpleResponse(result, response.fixed);
    }

    return this.createFinalResponse(response, result, 200, 'OK');
  }

  /**
   * Answers a request the pipeline failed on with the response of the error
   * handler, carrying the headers set on the intermediate response so far.
   *
   * @param {Pipeline} state - The request and how far it got
   * @param {unknown} error - The error
   * @returns {Response | Promise<Response>} The error response
   * @private
   */
  private fail(state: Pipeline, error: unknown): Response | Promise<Response> {
    const response = this.handleError(error);

    return response instanceof Promise
      ? response.then((settled) => mergeResponseHeaders(settled, state.response, false))
      : mergeResponseHeaders(response, state.response, false);
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
   * @param fixed - The folded static actions of the route, when it has any
   * @returns The final Response object
   * @private
   */
  private createSimpleResponse(handlerResponse: unknown, fixed?: RouterTypes.StaticResponse): Response {
    if (fixed !== undefined) {
      if (handlerResponse instanceof Response) {
        return mergeResponseHeaders(handlerResponse, fixed.source);
      }

      return handlerResponse === undefined
        ? new FastResponse(null, fixed.empty)
        : new FastResponse(JSON.stringify(handlerResponse), fixed.json);
    }

    if (handlerResponse instanceof Response) {
      return handlerResponse;
    }

    // `JSON.stringify(undefined)` is not JSON, so a void handler answers 204
    if (handlerResponse === undefined) {
      return new FastResponse(null, NO_CONTENT_RESPONSE_INIT);
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
   * @param {RouteInfo} [route] - The route the chain belongs to, handed to every middleware
   * @returns The before and after chains
   * @private
   */
  private buildMiddlewareChain(
    middlewares: MetadataTypes.Middleware[],
    route?: RouteInfo,
  ): {
    beforeMiddlewares: RouterTypes.MiddlewareDefinition[];
    afterMiddlewares: RouterTypes.MiddlewareDefinition[];
  } {
    const uniqueMiddlewares: MetadataTypes.Middleware[] = [];
    for (const m of resolveSlots(middlewares)) {
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
      ...(route ? { route } : {}),
    }));

    // get middleware types
    const beforeMiddlewares = resolvedMiddlewares.filter((m) => !!m.middleware.onRequest);
    const afterMiddlewares = resolvedMiddlewares.filter((m) => !!m.middleware.onResponse);

    // sort middlewares by priority
    beforeMiddlewares.sort((a, b) => (a?.priority ?? 999) - (b?.priority ?? 999));
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
      route: hook.route,
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

    // A void handler has no body: `JSON.stringify(undefined)` is not JSON. It
    // answers 204 unless an action or middleware picked another status, and
    // drops the default JSON content type, which would describe nothing.
    if (fakeResponseBody === null && handlerResponse === undefined) {
      const headers = fakeResponse.headers;
      if (headers.get('content-type') === DEFAULT_CONTENT_TYPE) {
        headers.delete('content-type');
      }

      const noContent = fakeResponse.status === 200;

      return new FastResponse(null, {
        status: noContent ? 204 : fakeResponse.status,
        statusText: noContent ? 'No Content' : fakeResponse.statusText,
        headers,
      });
    }

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

/** The errors of a miss, shared by every request the default error handler answers. */
const NOT_FOUND = withoutStack(() => new NotFoundError('Route not found'));
const METHOD_NOT_ALLOWED = withoutStack(() => new MethodNotAllowedError('Method not allowed'));

/**
 * Sets the `Allow` header of a 405 response.
 *
 * @param {Response} response - The response
 * @param {string} allow - The methods the path is routed for
 * @returns {Response} The response, or a copy of it when its headers are immutable
 */
function withAllow(response: Response, allow: string): Response {
  try {
    response.headers.set('allow', allow);

    return response;
  } catch {
    return mergeResponseHeaders(response, new FastResponse(undefined, { headers: { allow } }), false);
  }
}

/** Arguments of a handler that takes none. */
const EMPTY_VALUES: readonly unknown[] = Object.freeze([]);

/** Fallbacks for a handler assembled without `prepareHandler`. */
const EMPTY_CHAIN: readonly RouterTypes.MiddlewareDefinition[] = Object.freeze([]);
const EMPTY_ARGS: MetadataTypes.Arg[] = [];
const EMPTY_ACTIONS: readonly MetadataTypes.Action[] = Object.freeze([]);

/** Where a request is in the pipeline. */
const STAGE_BEFORE = 0;
const STAGE_ARGS = 1;
const STAGE_HANDLER = 2;
const STAGE_AFTER = 3;

/** What a suspended request is waiting for. */
const PENDING_HOOK = 0;
const PENDING_VALUES = 1;
const PENDING_RESULT = 2;
const PENDING_VALUE = 3;

/**
 * One request on its way through the pipeline: what
 * {@link RequestHandler.advance} needs to go on after waiting for a promise.
 */
interface Pipeline {
  request: Request;
  route: RouterTypes.RouteMatched<RouterTypes.RouterHandler>;
  /** The intermediate response middlewares and actions work on. */
  response: Response;
  stage: number;
  /** Position in the middleware chain of the current stage. */
  index: number;
  values: readonly unknown[];
  result: unknown;
}

/**
 * The intermediate response of a route nothing takes a real one from.
 *
 * Middlewares and actions read its status and set headers on it, and that is
 * all they do with it, so it holds a status and creates its `Headers` the first
 * time something asks for them. Until then the final response can be built from
 * a shared init, which is what makes a middleware that only looks at the
 * request nearly free. Creating a `Response` per request for this costs more
 * than everything else the pipeline does on Bun.
 *
 * It answers `instanceof Response`, but has no body to read or clone.
 */
class PendingResponse {
  /** The folded static actions this response starts from, if any. */
  public readonly fixed: RouterTypes.StaticResponse | undefined;

  private fHeaders: Headers | undefined = undefined;

  constructor(fixed: RouterTypes.StaticResponse | undefined) {
    this.fixed = fixed;
  }

  /** Whether anything asked for the headers, and so may have changed them. */
  public get touched(): boolean {
    return this.fHeaders !== undefined;
  }

  public get headers(): Headers {
    return (this.fHeaders ??= new Headers(this.fixed === undefined ? INITIAL_RESPONSE_HEADERS : this.fixed.json.headers));
  }

  public get status(): number {
    return this.fixed === undefined ? 200 : this.fixed.source.status;
  }

  public get statusText(): string {
    return this.fixed === undefined ? 'OK' : this.fixed.source.statusText;
  }

  public get ok(): boolean {
    return this.status >= 200 && this.status < 300;
  }

  public get body(): null {
    return null;
  }

  public get bodyUsed(): boolean {
    return false;
  }

  public get type(): ResponseType {
    return 'default';
  }

  public get url(): string {
    return '';
  }

  public get redirected(): boolean {
    return false;
  }

  /**
   * @returns {Response} A real response with this status and these headers
   */
  public toResponse(): Response {
    return new FastResponse(null, { status: this.status, statusText: this.statusText, headers: this.headers });
  }
}

// So a middleware that checks what it was handed still recognises a response.
Object.setPrototypeOf(PendingResponse.prototype, Response.prototype);

/**
 * Creates the intermediate response of a route nothing takes a real one from.
 *
 * @param {RouterTypes.StaticResponse} [fixed] - The folded static actions to start from
 * @returns {Response} The stand-in
 */
function createPendingResponse(fixed?: RouterTypes.StaticResponse): Response {
  return new PendingResponse(fixed) as unknown as Response;
}

/**
 * Whether an intermediate response is still what the pipeline created: no
 * middleware or action replaced it, and nothing asked for its headers.
 *
 * @param {Response} response - The intermediate response
 * @returns {boolean} True when nothing can have changed it
 */
function isUntouched(response: Response): response is Response & PendingResponse {
  return response instanceof PendingResponse && !response.touched;
}

/**
 * Whether a middleware hook returned something to wait for.
 *
 * @param {object} value - What the hook returned
 * @returns {boolean} True for a promise or any other thenable
 */
function isThenable(value: object): value is PromiseLike<Response | ResponseInit | void> {
  return typeof (value as { then?: unknown }).then === 'function';
}

/**
 * Turns headers into a response init that can be reused across requests: a
 * plain record, which a response is built from fastest, or pairs when a header
 * is set more than once.
 *
 * @param {Headers} headers - The headers
 * @returns {HeadersInit} A frozen record or list of pairs
 */
function toHeadersInit(headers: Headers): HeadersInit {
  const pairs = [...headers];
  const record = Object.fromEntries(pairs);

  return Object.freeze(Object.keys(record).length === pairs.length ? record : pairs) as HeadersInit;
}

/**
 * Whether a middleware may read the request body. It may, unless its class
 * says otherwise with `static readsBody = false`.
 *
 * @param {object} middleware - The middleware instance
 * @returns {boolean} False only for a middleware that declared it never reads the body
 */
function readsBody(middleware: object): boolean {
  return (middleware.constructor as { readsBody?: boolean } | undefined)?.readsBody !== false;
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
