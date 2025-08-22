import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import type { DeepPartial, MetadataTypes } from '@vercube/core';
import defu from 'defu';

/**
 * Resolves the query params schema for a given method.
 * @param metadata - The metadata of the method.
 * @param schema - The schema to resolve the query params for.
 * @returns void
 */
export function SchemaQueryParamsResolver(metadata: MetadataTypes.Method, schema: DeepPartial<RouteConfig>): void {
  // check if method has query
  const query = metadata.args.find((arg) => arg.type === 'query-params');

  if (!query || !query.validationSchema) {
    return;
  }

  schema.request = defu(schema?.request ?? {}, {
    query: query.validationSchema as any,
  });
}
