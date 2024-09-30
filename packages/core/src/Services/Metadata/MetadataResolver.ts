/* eslint-disable complexity */
/* eslint-disable no-case-declarations */
import { getHeader, getHeaders, getQuery, getRouterParam, H3Event, readBody } from 'h3';
import type { MetadataTypes } from '../../Types/MetadataTypes';

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
      args: [],
      actions: [],
    };
  }

  /**
   * Resolves metadata for a given event.
   *
   * @param {H3Event} event - The event to resolve metadata for.
   * @param {MetadataTypes.Metadata} metadata - The metadata to resolve.
   * @return {Object} The resolved metadata.
   */
  public resolve(event: H3Event, metadata: MetadataTypes.Metadata): MetadataTypes.ResolvedData {
    return {
      req: event.node.req,
      res: event.node.res,
      args: this.resolveArgs(metadata?.args ?? [], event),
      actions: metadata?.actions ?? [],
    };
  }

  /**
   * Resolves arguments for a given event.
   *
   * @param {MetadataTypes.Arg[]} args - The arguments to resolve.
   * @param {H3Event} event - The event to resolve arguments for.
   * @return {unknown[]} The resolved arguments.
   */
  public resolveArgs(args: MetadataTypes.Arg[], event: H3Event): unknown[] {
    // sort arguments by index
    args.sort((a, b) => a.idx - b.idx);

    // resolve arguments
    return args.map((arg) => {
      switch (arg.type) {
        case 'param':
          return getRouterParam(
            event,
            arg?.data?.name,
            { decode: arg?.data?.decode ?? false },
          ) ?? null;
        case 'body':
          return readBody(event);
        case 'query':
          const query = getQuery(event);
          return query[arg?.data?.name] ?? null;
        case 'header':
          return getHeader(event, arg?.data?.name) ?? null;
        case 'headers':
          return getHeaders(event);
        case 'request':
          return event.node.req;
        case 'response':
          return event.node.res;
        default:
          throw new Error(`Unknown argument type: ${arg.type}`);
      }
    });
  }

}