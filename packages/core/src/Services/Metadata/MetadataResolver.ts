import type { MetadataTypes } from '../../Types/MetadataTypes';
import type { RouterTypes } from '../../Types/RouterTypes';
import { resolveRequestBody } from '../../Resolvers/Body';
import { getRequestHeader, getRequestHeaders } from '../../Resolvers/Headers';
import { resolveQueryParam, resolveQueryParams } from '../../Resolvers/Query';
import { resolveRouterParam } from '../../Resolvers/RouterParam';

/**
 * Class responsible for resolving metadata for route handlers.
 */
export class MetadataResolver {
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
    // sort arguments by index
    args.sort((a, b) => a.idx - b.idx);

    // resolve arguments data from event
    const resolvedArgs = args.map(async (arg) => ({
      ...arg,
      resolved: await this.resolveArg(arg, event),
    }));

    // return resolved arguments
    return await Promise.all(resolvedArgs);
  }

  /**
   * Resolves an argument for a given event.
   *
   * @param {MetadataTypes.Arg} arg - The argument to resolve.
   *
   * @return {unknown} The resolved argument.
   * @private
   */
  private resolveArg(arg: MetadataTypes.Arg, event: RouterTypes.RouterEvent): unknown {
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
