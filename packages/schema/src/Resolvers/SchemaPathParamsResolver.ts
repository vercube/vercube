import { z } from 'zod';
import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import type { DeepPartial, MetadataTypes } from '@vercube/core';

/**
 * Declares path parameters for the given route schema.
 *
 * OpenAPI requires every `{name}` in the path to have a matching `in: path`
 * parameter. A parameter read by `@Param({ name, validationSchema })` with a
 * zod schema is documented with that schema. Anything else is documented as a
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

  const validated = new Map(
    metadata.args
      .filter((arg) => arg.type === 'param' && arg.validationSchema instanceof z.ZodType)
      // a path param is always required in OpenAPI, even when the schema
      // is optional or has a default, which zod-to-openapi documents as optional
      .map((arg) => [arg.data?.name, (arg.validationSchema as z.ZodType).openapi({ param: { required: true } })]),
  );

  schema.request = {
    ...schema.request,
    params: z.object(Object.fromEntries(params.map((name) => [name, validated.get(name) ?? z.string()]))) as any,
  };
}
