import { resolveRequestBody } from '../../Resolvers/Body';
import { getRequestHeader, getRequestHeaders } from '../../Resolvers/Headers';
import { resolveQueryParam, resolveQueryParams } from '../../Resolvers/Query';
import { resolveRouterParam } from '../../Resolvers/RouterParam';
import type { MetadataTypes } from '../../Types/MetadataTypes';
import type { RouterTypes } from '../../Types/RouterTypes';

/**
 * Argument types whose resolver may return a promise. Everything else is
 * resolved synchronously, which lets a route skip promises entirely.
 */
const ASYNC_ARG_TYPES: ReadonlySet<string> = new Set(['body', 'multipart-form-data', 'session', 'custom']);

/**
 * Class responsible for resolving metadata for route handlers.
 */
export class MetadataResolver {
  /**
   * Tells whether resolving an argument may require awaiting.
   *
   * @param {MetadataTypes.Arg} arg - The argument definition to inspect.
   * @returns {boolean} True when the argument has to be awaited.
   */
  public static isAsyncArg(arg: MetadataTypes.Arg): boolean {
    return ASYNC_ARG_TYPES.has(arg.type);
  }

  /**
   * Resolves the URL for a given instance and path.
   *
   * @param {MetadataTypes.ResolveUrlParams} params - The parameters for resolving the URL.
   * @return {string} The resolved URL.
   */
  public resolveUrl(params: MetadataTypes.ResolveUrlParams): string {
    const { instance, propertyName, path: rawPath } = params;
    const metadata = instance.__metadata as MetadataTypes.Ctx;
    const basePath = (metadata?.__controller?.path ?? '').replace(/\/$/, '');
    const cleanPath = rawPath.replace(/^\//, '');
    const url = `${basePath}/${cleanPath}`;

    metadata.__methods[propertyName].url = url;
    return url;
  }

  public resolveMethod(ctx: MetadataTypes.Metadata, propertyName: string): MetadataTypes.Method {
    return ctx.__metadata.__methods[propertyName];
  }

  /**
   * Resolves arguments for a given event.
   *
   * @param {MetadataTypes.Arg[]} args - The arguments to resolve.
   * @param {RouterTypes.RouterEvent} event - The event to resolve arguments for.
   * @return {unknown[]} The resolved arguments.
   * @public
   */
  public async resolveArgs(args: MetadataTypes.Arg[], event: RouterTypes.RouterEvent): Promise<MetadataTypes.Arg[]> {
    const list = sortArgs(args);

    const resolvedArgs: MetadataTypes.Arg[] = [];
    for (let i = 0; i < list.length; i++) {
      const arg = list[i];
      let resolved: unknown = this.resolveArg(arg, event);
      if (resolved instanceof Promise) {
        resolved = await resolved;
      }
      resolvedArgs.push({ ...arg, resolved });
    }
    return resolvedArgs;
  }

  /**
   * Resolves handler arguments to plain values, skipping the per-argument
   * metadata copies that {@link MetadataResolver.resolveArgs} produces.
   *
   * Only valid for argument lists where {@link MetadataResolver.isAsyncArg}
   * is false for every entry.
   *
   * @param {MetadataTypes.Arg[]} args - The arguments to resolve, sorted by index.
   * @param {RouterTypes.RouterEvent} event - The event to resolve arguments for.
   * @returns {unknown[]} The resolved values in handler parameter order.
   */
  public resolveArgValues(args: MetadataTypes.Arg[], event: RouterTypes.RouterEvent): unknown[] {
    const values: unknown[] = Array.from({ length: args.length });

    for (let i = 0; i < args.length; i++) {
      values[i] = this.resolveArg(args[i], event);
    }

    return values;
  }

  /**
   * Asynchronous counterpart of {@link MetadataResolver.resolveArgValues}, used
   * when at least one argument resolver returns a promise.
   *
   * @param {MetadataTypes.Arg[]} args - The arguments to resolve, sorted by index.
   * @param {RouterTypes.RouterEvent} event - The event to resolve arguments for.
   * @returns {Promise<unknown[]>} The resolved values in handler parameter order.
   */
  public async resolveArgValuesAsync(args: MetadataTypes.Arg[], event: RouterTypes.RouterEvent): Promise<unknown[]> {
    const values: unknown[] = Array.from({ length: args.length });

    for (let i = 0; i < args.length; i++) {
      const resolved = this.resolveArg(args[i], event);
      values[i] = resolved instanceof Promise ? await resolved : resolved;
    }

    return values;
  }

  /**
   * Resolves an argument for a given event.
   *
   * @param {MetadataTypes.Arg} arg - The argument to resolve.
   *
   * @return {unknown} The resolved argument.
   * @private
   */
  private resolveArg(arg: MetadataTypes.Arg, event: RouterTypes.RouterEvent): unknown | Promise<unknown> {
    switch (arg.type) {
      case 'param': {
        return resolveRouterParam(arg?.data?.name ?? '', event);
      }
      case 'body': {
        return resolveRequestBody(event);
      }
      case 'multipart-form-data': {
        // TODO: add support for multipart/form-data
        return null;
        // return readMultipartFormData(event);
      }
      case 'query-param': {
        return resolveQueryParam(arg?.data?.name ?? '', event);
      }
      case 'query-params': {
        return resolveQueryParams(event);
      }
      case 'header': {
        return getRequestHeader(arg.data?.name ?? '', event);
      }
      case 'headers': {
        return getRequestHeaders(event);
      }
      case 'request': {
        return event.request;
      }
      case 'response': {
        return event.response;
      }
      case 'custom': {
        return arg.resolver?.(event);
      }
      case 'session': {
        // TODO: add support for session
        return null;
        // return useSession(event, {
        //   name: arg?.data?.name,
        //   password: arg?.data?.secret,
        //   cookie: {
        //     httpOnly: true,
        //     secure: true,
        //   },
        //   maxAge: arg?.data?.duration,
        // });
      }
      default: {
        throw new Error(`Unknown argument type: ${arg.type}`);
      }
    }
  }

  /**
   * Resolves middleware functions for a given context and property name.
   *
   * @param {MetadataTypes.Ctx} ctx - The metadata context object
   * @param {string} propertyName - The name of the property to resolve middlewares for
   * @returns {MetadataTypes.Middleware[]} Array of middleware functions that apply globally or to the specific property
   * @public
   */
  public resolveMiddlewares(ctx: MetadataTypes.Metadata, propertyName: string): MetadataTypes.Middleware[] {
    const middlewares =
      ctx?.__metadata?.__middlewares?.filter((m) => m.target === '__global__' || m.target === propertyName) ?? [];

    // return middlewares sorted by global first
    return middlewares.sort((a) => (a.target === '__global__' ? -1 : 1));
  }
}

/**
 * Returns the arguments ordered by parameter index.
 *
 * Prepared routes already pass them sorted, so unsorted callers are supported
 * with a cheap O(n) check that allocates nothing in the common case.
 *
 * @param {MetadataTypes.Arg[]} args - Arguments to order.
 * @returns {MetadataTypes.Arg[]} The arguments sorted by `idx`.
 */
function sortArgs(args: MetadataTypes.Arg[]): MetadataTypes.Arg[] {
  if (args.length < 2) {
    return args;
  }

  for (let i = 1; i < args.length; i++) {
    if (args[i - 1].idx > args[i].idx) {
      return [...args].sort((a, b) => a.idx - b.idx);
    }
  }

  return args;
}
