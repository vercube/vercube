import defu from 'defu';
import { isOpenApiZod, rejectsUndefined, toJsonSchema } from '../Utils/StandardSchema';
import type { SchemaWarn } from '../Utils/StandardSchema';
import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import type { DeepPartial, MetadataTypes } from '@vercube/core';

/**
 * Resolves the body schema for a given method.
 *
 * A classic zod schema goes to zod-to-openapi as is. Any other Standard Schema
 * is converted with its JSON Schema converter, and skipped with a warning when
 * it has none.
 *
 * @param metadata - The metadata of the method.
 * @param schema - The schema to resolve the body for.
 * @param warn - Reports a schema that cannot be documented.
 * @returns void
 */
export function SchemaBodyResolver(metadata: MetadataTypes.Method, schema: DeepPartial<RouteConfig>, warn?: SchemaWarn): void {
  // check if method has body
  const body = metadata.args.find((arg) => arg.type === 'body');

  if (!body || !body.validationSchema) {
    return;
  }

  const bodySchema = isOpenApiZod(body.validationSchema) ? body.validationSchema : toJsonSchema(body.validationSchema);

  if (!bodySchema) {
    warn?.('the @Body() validation schema has no JSON Schema converter, the request body is not documented');
    return;
  }

  schema.request = defu(schema?.request ?? {}, {
    body: {
      // a request without a body fails validation, unless the schema accepts `undefined`
      required: rejectsUndefined(body.validationSchema),
      content: {
        'application/json': {
          schema: bodySchema as any,
        },
      },
    },
  });
}
