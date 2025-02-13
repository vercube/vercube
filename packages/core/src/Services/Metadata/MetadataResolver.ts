
 
 
import { getHeader, getHeaders, getQuery, getRouterParam, readBody } from 'h3';
import type { MetadataTypes } from '../../Types/MetadataTypes';
import type { HttpEvent } from '../../Types/CommonTypes';

/**
 * Class responsible for resolving metadata for route handlers.
 */
export class MetadataResolver {

  /**
   * Creates a new metadata object.
   *
   * @return {MetadataTypes.Metadata} The newly created metadata object.
   */
  public create(): MetadataTypes.Method {
    return {
      req: null,
      res: null,
      url: null,
      args: [],
      actions: [],
    };
  }

  /**
   * Resolves the URL for a given instance and path.
   *
   * @param {MetadataTypes.ResolveUrlParams} params - The parameters for resolving the URL.
   * @return {string} The resolved URL.
   */
  public resolveUrl(params: MetadataTypes.ResolveUrlParams): string {
    const { instance, propertyName } = params;
    let { path }  = params;

    const metadata = instance.__metadata as MetadataTypes.Ctx;

    // get base route from controller metadata
    let baseRotue = metadata?.__controller.path ?? '';

    // remove trailing slash
    if (baseRotue.endsWith('/')) {
      baseRotue = baseRotue.slice(0, -1);
    }

    // remove leading slash
    if (path.startsWith('/')) {
      path = path.slice(1);
    }

    // construct full url
    const url = `${baseRotue}/${path}`;

    // save url to metadata
    metadata.__methods[propertyName].url = url;

    // return resolved url
    return url;
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
    const metadata = ctx.__metadata.__methods[propertyName];
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
   * @private
   */
  private async resolveArgs(args: MetadataTypes.Arg[], event: HttpEvent): Promise<unknown[]> {
    // sort arguments by index
    args.sort((a, b) => a.idx - b.idx);

    // resolve arguments
    return await Promise.all(args.map((arg) => {
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
        case 'query': {
          const query = getQuery(event);
          return query[arg?.data?.name] ?? null;
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
    }));
  }

  /**
   * Resolves middleware functions for a given context and property name.
   * 
   * @param {MetadataTypes.Ctx} ctx - The metadata context object
   * @param {string} propertyName - The name of the property to resolve middlewares for
   * @returns {MetadataTypes.Middleware[]} Array of middleware functions that apply globally or to the specific property
   * @private
   */
  private resolveMiddlewares(ctx: MetadataTypes.Metadata, propertyName: string): MetadataTypes.Middleware[] {
    const middlewares = ctx?.__metadata?.__middlewares?.filter((m) => m.target === '__global__' || m.target === propertyName) ?? [];

    // return middlewares sorted by global first
    return middlewares.sort((a) => (a.target === '__global__' ? -1 : 1));
  }

}