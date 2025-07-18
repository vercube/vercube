import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import type { DeepPartial, MetadataTypes } from '@vercube/core';
import defu from 'defu';

/**
 * Resolves the body schema for a given method.
 * @param metadata - The metadata of the method.
 * @param schema - The schema to resolve the body for.
 * @returns void
 */
export function SchemaBodyResolver(metadata: MetadataTypes.Method, schema: DeepPartial<RouteConfig>): void {
  
  // check if method has body
  const body = metadata.args.find((arg) => arg.type === 'body');

  if (!body || !body.validationSchema) {
    return;
  }

  schema.request = defu(schema?.request ?? {}, {
    body: {
      content: {
        'application/json': {
          schema: body.validationSchema as any,
        },
      },
    },
  });

}