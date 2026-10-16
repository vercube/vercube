import { z } from 'zod';
import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec';

/**
 * Reports a validation schema that cannot be documented.
 */
export type SchemaWarn = (message: string) => void;

/**
 * Whether the schema can be handed to zod-to-openapi as is. Only classic zod
 * schemas qualify: `zod/mini` has no `.meta()` or `.openapi()`, and other
 * Standard Schema vendors are not zod at all.
 *
 * @param schema - The validation schema.
 * @returns True for a classic zod schema.
 */
export function isOpenApiZod(schema: unknown): schema is z.ZodType {
  return schema instanceof z.ZodType;
}

/**
 * Converts a validation schema to an OpenAPI 3.0 schema object, using zod's
 * own converter for zod schemas (`zod/mini` included) and the Standard JSON
 * Schema converter of any other vendor.
 *
 * @param schema - The validation schema.
 * @returns The JSON schema of the input, or undefined when the schema has no converter.
 */
export function toJsonSchema(schema: unknown): Record<string, unknown> | undefined {
  try {
    if (schema instanceof z.core.$ZodType) {
      return withoutDialect(z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input', unrepresentable: 'any' }));
    }

    const converter = (schema as Partial<StandardJSONSchemaV1> | null)?.['~standard']?.jsonSchema;

    if (!converter) {
      return undefined;
    }

    try {
      return withoutDialect(converter.input({ target: 'openapi-3.0' }));
    } catch {
      // OpenAPI 3.0 is best-effort for converters, draft-07 is close enough
      return withoutDialect(converter.input({ target: 'draft-07' }));
    }
  } catch {
    return undefined;
  }
}

/**
 * Whether a missing value fails validation. Asynchronous validators cannot be
 * checked here, so they count as optional.
 *
 * @param schema - The validation schema.
 * @returns True when `undefined` is rejected.
 */
export function rejectsUndefined(schema: unknown): boolean {
  try {
    const result = (schema as StandardSchemaV1)['~standard'].validate(undefined);

    return !(result instanceof Promise) && !!result.issues;
  } catch {
    return false;
  }
}

/**
 * Wraps a schema for zod-to-openapi. A classic zod schema is returned as is;
 * any other schema with a JSON Schema converter is documented through a
 * `z.unknown()` carrying the converted schema.
 *
 * @param schema - The validation schema.
 * @returns The zod schema, or undefined when the schema cannot be documented.
 */
export function toOpenApiSchema(schema: unknown): z.ZodType | undefined {
  if (isOpenApiZod(schema)) {
    return schema;
  }

  const json = toJsonSchema(schema);

  if (!json) {
    return undefined;
  }

  return rejectsUndefined(schema)
    ? z.unknown().openapi({ ...json, param: { required: true } } as any)
    : z.unknown().openapi(json as any);
}

/**
 * Turns an object schema into a zod object whose properties carry the
 * converted JSON schemas, so zod-to-openapi can lay them out as parameters.
 *
 * @param schema - The validation schema of an object.
 * @returns The zod object, or undefined when the schema cannot be documented as one.
 */
export function toOpenApiObject(schema: unknown): z.ZodObject | undefined {
  // every field is a parameter of its own, required when validation rejects it missing
  if (schema instanceof z.ZodObject) {
    return schema.extend(
      Object.fromEntries(
        Object.entries(schema.shape as Record<string, z.ZodType>).map(([name, field]) => [name, withRequired(field)]),
      ),
    );
  }

  const json = toJsonSchema(schema);
  const properties = json?.properties as Record<string, Record<string, unknown>> | undefined;

  if (!properties) {
    return undefined;
  }

  const required = new Set((json?.required as string[] | undefined) ?? []);

  return z.object(
    Object.fromEntries(
      Object.entries(properties).map(([name, property]) => [
        name,
        required.has(name)
          ? z.unknown().openapi({ ...property, param: { required: true } } as any)
          : z.unknown().openapi(property as any),
      ]),
    ),
  );
}

/**
 * Drops the `$schema` dialect marker, which has no place inside an OpenAPI document.
 *
 * @param json - A JSON schema.
 * @returns The schema without `$schema`.
 */
function withoutDialect(json: Record<string, unknown>): Record<string, unknown> {
  const { $schema: _, ...rest } = json;
  return rest;
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
export function withRequired(schema: z.ZodType): z.ZodType {
  try {
    return schema.safeParse(undefined).success ? schema : schema.openapi({ param: { required: true } });
  } catch {
    // async refinements cannot be checked synchronously
    return schema;
  }
}
