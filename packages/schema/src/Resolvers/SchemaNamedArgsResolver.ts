import { z } from 'zod';
import { isOpenApiZod, toOpenApiSchema, withRequired } from '../Utils/StandardSchema';
import type { SchemaWarn } from '../Utils/StandardSchema';
import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import type { DeepPartial, MetadataTypes } from '@vercube/core';

type RequestKey = 'query' | 'headers';

/**
 * Header parameters OpenAPI 3 says are ignored: `Authorization` belongs to
 * security schemes, `Accept` and `Content-Type` to the content of the operation.
 */
const IGNORED_HEADERS: ReadonlySet<string> = new Set(['authorization', 'content-type', 'accept']);

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
  const args = metadata.args
    .filter((arg) => arg.type === type && arg.data?.name)
    // OpenAPI ignores these as header parameters: they are described by security and content
    .filter((arg) => type !== 'header' || !IGNORED_HEADERS.has(String(arg.data!.name).toLowerCase()))
    .toSorted((a, b) => a.idx - b.idx);

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
 * Adds the shape to `schema.request[key]`. Entries that are already there,
 * set explicitly in `@Schema` or by another resolver, take precedence. An
 * object wrapped in a transform or refinement is unwrapped to its input
 * object; any other schema already in place is left untouched.
 *
 * @param schema - The route schema.
 * @param key - The request part to extend.
 * @param shape - The shape to add.
 */
function mergeShape(schema: DeepPartial<RouteConfig>, key: RequestKey, shape: Record<string, z.ZodType>): void {
  let existing = schema.request?.[key] as unknown;

  // documented by its input: a `.transform()` or `.pipe()` wraps the object it reads
  while (existing instanceof z.ZodPipe) {
    existing = existing.in;
  }

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
