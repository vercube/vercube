import { z } from 'zod';
import { isOpenApiZod, toOpenApiSchema } from '../Utils/StandardSchema';
import type { SchemaWarn } from '../Utils/StandardSchema';
import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import type { DeepPartial, MetadataTypes } from '@vercube/core';

type RequestKey = 'query' | 'headers';

/**
 * Builds a zod object shape out of method arguments that read a single named
 * value, such as `@QueryParam({ name })` or `@Header(name)`.
 *
 * An argument with a `validationSchema` is documented with that schema, so its
 * required/optional state follows the validation. A Standard Schema that is
 * not classic zod goes through its JSON Schema converter. Anything else is
 * documented as an optional string, since nothing validates it.
 *
 * @param metadata - The metadata of the method.
 * @param type - The argument type to collect.
 * @param warn - Reports a schema that cannot be documented.
 * @returns The shape, or undefined when the method has no such arguments.
 */
function collectShape(metadata: MetadataTypes.Method, type: string, warn?: SchemaWarn): Record<string, z.ZodType> | undefined {
  // param decorators run right to left, so restore the signature order
  const args = metadata.args.filter((arg) => arg.type === type && arg.data?.name).toSorted((a, b) => a.idx - b.idx);

  if (args.length === 0) {
    return undefined;
  }

  return Object.fromEntries(args.map((arg) => [arg.data!.name as string, documentArg(arg, warn)]));
}

/**
 * Picks the schema a single named argument is documented with.
 *
 * @param arg - The argument.
 * @param warn - Reports a schema that cannot be documented.
 * @returns The schema to document.
 */
function documentArg(arg: MetadataTypes.Arg, warn?: SchemaWarn): z.ZodType {
  if (!arg.validationSchema) {
    return z.string().optional();
  }

  if (isOpenApiZod(arg.validationSchema)) {
    return withRequired(arg.validationSchema);
  }

  const converted = toOpenApiSchema(arg.validationSchema);

  if (!converted) {
    warn?.(`the validation schema of "${arg.data?.name}" has no JSON Schema converter, it is documented as a string`);
  }

  return converted ?? z.string().optional();
}

/**
 * A missing value reaches validation as `undefined`, so a schema that rejects
 * `undefined` makes the parameter required. zod-to-openapi documents bare
 * `z.coerce.*` schemas as optional, since their input is `unknown`, so the
 * parameter is marked required explicitly when validation would reject it.
 *
 * @param schema - The validation schema of the argument.
 * @returns The schema, marked required when it rejects `undefined`.
 */
function withRequired(schema: z.ZodType): z.ZodType {
  try {
    return schema.safeParse(undefined).success ? schema : schema.openapi({ param: { required: true } });
  } catch {
    // async refinements cannot be checked synchronously
    return schema;
  }
}

/**
 * Adds the shape to `schema.request[key]`. Entries that are already there,
 * set explicitly in `@Schema` or by another resolver, take precedence. A
 * non-object schema already in place is left untouched.
 *
 * @param schema - The route schema.
 * @param key - The request part to extend.
 * @param shape - The shape to add.
 */
function mergeShape(schema: DeepPartial<RouteConfig>, key: RequestKey, shape: Record<string, z.ZodType>): void {
  const existing = schema.request?.[key] as unknown;

  if (existing && !(existing instanceof z.ZodObject)) {
    return;
  }

  schema.request = {
    ...schema.request,
    [key]: z.object({ ...shape, ...(existing as z.ZodObject | undefined)?.shape }) as any,
  };
}

/**
 * Resolves single `@QueryParam` arguments into the query schema.
 * @param metadata - The metadata of the method.
 * @param schema - The schema to resolve the query params for.
 * @param warn - Reports a schema that cannot be documented.
 * @returns void
 */
export function SchemaQueryParamResolver(
  metadata: MetadataTypes.Method,
  schema: DeepPartial<RouteConfig>,
  warn?: SchemaWarn,
): void {
  const shape = collectShape(metadata, 'query-param', warn);

  if (shape) {
    mergeShape(schema, 'query', shape);
  }
}

/**
 * Resolves `@Header` arguments into the headers schema.
 * @param metadata - The metadata of the method.
 * @param schema - The schema to resolve the headers for.
 * @param warn - Reports a schema that cannot be documented.
 * @returns void
 */
export function SchemaHeaderResolver(metadata: MetadataTypes.Method, schema: DeepPartial<RouteConfig>, warn?: SchemaWarn): void {
  const shape = collectShape(metadata, 'header', warn);

  if (shape) {
    mergeShape(schema, 'headers', shape);
  }
}
