
 
 
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
  public create(): MetadataTypes.Metadata {
    return {
      req: null,
      res: null,
      url: null,
      args: [],
      actions: [],
      middlewares: [],
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

    // get base route from controller metadata
    let baseRotue = instance.__metadata.controller.path ?? '';

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
    instance.__metadata[propertyName].url = url;

    // return resolved url
    return url;
  }

  /**
   * Resolves metadata for a given event.
   *
   * @param {HttpEvent} event - The event to resolve metadata for.
   * @param {MetadataTypes.Metadata} metadata - The metadata to resolve.
   * @return {Object} The resolved metadata.
   */
  public resolve(event: HttpEvent, metadata: MetadataTypes.Metadata): MetadataTypes.ResolvedData {
    return {
      req: event.node.req,
      res: event.node.res,
      url: metadata?.url ?? null,
      args: this.resolveArgs(metadata?.args ?? [], event),
      actions: metadata?.actions ?? [],
      middlewares: metadata?.middlewares ?? [],
    };
  }

  /**
   * Resolves arguments for a given event.
   *
   * @param {MetadataTypes.Arg[]} args - The arguments to resolve.
   * @param {HttpEvent} event - The event to resolve arguments for.
   * @return {unknown[]} The resolved arguments.
   */
  public resolveArgs(args: MetadataTypes.Arg[], event: HttpEvent): unknown[] {
    // sort arguments by index
    args.sort((a, b) => a.idx - b.idx);

    // resolve arguments
    return args.map((arg) => {
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
    });
  }

}