import { z } from 'zod';
import { isOpenApiZod, toOpenApiSchema } from '../Utils/StandardSchema';
import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import type { DeepPartial, MetadataTypes } from '@vercube/core';

/**
 * Declares path parameters for the given route schema.
 *
 * OpenAPI requires every `{name}` in the path to have a matching `in: path`
 * parameter. A parameter read by `@Param({ name, validationSchema })` is
 * documented with that schema, converted through its JSON Schema converter
 * when it is not classic zod. Anything else is documented as a
 * string, which is what the router passes to `@Param`. A `request.params`
 * schema set explicitly in `@Schema` takes precedence and is left untouched.
 *
 * @param params - Names of the path parameters.
 * @param metadata - The metadata of the method.
 * @param schema - The schema to resolve the path params for.
 * @returns void
 */
export function SchemaPathParamsResolver(
  params: string[],
  metadata: MetadataTypes.Method,
  schema: DeepPartial<RouteConfig>,
): void {
  if (params.length === 0 || schema.request?.params) {
    return;
  }

  const validated = new Map<unknown, z.ZodType>();

  for (const arg of metadata.args) {
    if (arg.type !== 'param' || !arg.validationSchema) {
      continue;
    }

    const documented = isOpenApiZod(arg.validationSchema) ? arg.validationSchema : toOpenApiSchema(arg.validationSchema);

    if (documented) {
      // a path param is always required in OpenAPI, even when the schema
      // is optional or has a default, which zod-to-openapi documents as optional
      validated.set(arg.data?.name, documented.openapi({ param: { required: true } }));
    }
  }

  schema.request = {
    ...schema.request,
    params: z.object(Object.fromEntries(params.map((name) => [name, validated.get(name) ?? z.string()]))) as any,
  };
}
