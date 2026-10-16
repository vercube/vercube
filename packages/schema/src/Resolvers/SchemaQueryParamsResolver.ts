import defu from 'defu';
import { toOpenApiObject } from '../Utils/StandardSchema';
import type { SchemaWarn } from '../Utils/StandardSchema';
import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import type { DeepPartial, MetadataTypes } from '@vercube/core';

/**
 * Resolves the query params schema for a given method.
 *
 * zod-to-openapi lays query parameters out from a zod object, so a schema of
 * any other kind is converted to one through its JSON Schema converter, and
 * skipped with a warning when that is not possible.
 *
 * @param metadata - The metadata of the method.
 * @param schema - The schema to resolve the query params for.
 * @param warn - Reports a schema that cannot be documented.
 * @returns void
 */
export function SchemaQueryParamsResolver(
  metadata: MetadataTypes.Method,
  schema: DeepPartial<RouteConfig>,
  warn?: SchemaWarn,
): void {
  // check if method has query
  const query = metadata.args.find((arg) => arg.type === 'query-params');

  if (!query || !query.validationSchema) {
    return;
  }

  const querySchema = toOpenApiObject(query.validationSchema);

  if (!querySchema) {
    warn?.('the @QueryParams() validation schema cannot be converted to an object schema, the query is not documented');
    return;
  }

  schema.request = defu(schema?.request ?? {}, {
    query: querySchema as any,
  });
}
