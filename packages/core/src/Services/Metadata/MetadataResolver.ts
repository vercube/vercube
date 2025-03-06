import { getHeader, getHeaders, getQuery, getRouterParam, readBody, readMultipartFormData } from 'h3';
import type { MetadataTypes } from '../../Types/MetadataTypes';
import type { HttpEvent } from '../../Types/CommonTypes';

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
   * Resolves metadata for a given event.
   *
   * @param {HttpEvent} event - The event to resolve metadata for.
   * @param {MetadataTypes.Ctx} ctx - The metadata context.
   * @param {string} propertyName - The name of the property.
   * @return {Object} The resolved metadata.
   */
  public async resolve(event: HttpEvent, ctx: MetadataTypes.Metadata, propertyName: string): Promise<MetadataTypes.ResolvedData> {
    const metadata = this.resolveMethod(ctx, propertyName);
    const args = await this.resolveArgs(metadata?.args ?? [], event);

    return {
      req: event.node.req,
      res: event.node.res,
      url: metadata?.url ?? null,
      args,
      actions: metadata?.actions ?? [],
      middlewares: this.resolveMiddlewares(ctx, propertyName),
    };
  }

  /**
   * Resolves arguments for a given event.
   *
   * @param {MetadataTypes.Arg[]} args - The arguments to resolve.
   * @param {HttpEvent} event - The event to resolve arguments for.
   * @return {unknown[]} The resolved arguments.
   * @public
   */
  public async resolveArgs(args: MetadataTypes.Arg[], event: HttpEvent): Promise<MetadataTypes.Arg[]> {
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
   * @param {HttpEvent} event - The event to resolve the argument for.
   * @return {unknown} The resolved argument.
   * @private
   */
  private resolveArg(arg: MetadataTypes.Arg, event: HttpEvent): unknown {
    switch (arg.type) {
      case 'param': {
        return getRouterParam(
          event,
          arg?.data?.name,
          { decode: arg?.data?.decode ?? false },
        ) ?? null;
      }
      case 'body': {
        return readBody(event);
      }
      case 'multipart-form-data': {
        return readMultipartFormData(event);
      }
      case 'query-param': {
        const query = getQuery(event);
        return query[arg?.data?.name] ?? null;
      }
      case 'query-params': {
        return getQuery(event);
      }
      case 'header': {
        return getHeader(event, arg?.data?.name) ?? null;
      }
      case 'headers': {
        return getHeaders(event);
      }
      case 'request': {
        return event.node.req;
      }
      case 'response': {
        return event.node.res;
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
    const middlewares = ctx?.__metadata?.__middlewares?.filter((m) => m.target === '__global__' || m.target === propertyName) ?? [];

    // return middlewares sorted by global first
    return middlewares.sort((a) => (a.target === '__global__' ? -1 : 1));
  }

}
