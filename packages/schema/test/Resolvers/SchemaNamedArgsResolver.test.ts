import { describe, expect, it } from 'vitest';
import { z } from '../../src';
import { SchemaHeaderResolver, SchemaQueryParamResolver } from '../../src/Resolvers/SchemaNamedArgsResolver';
import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import type { DeepPartial, MetadataTypes } from '@vercube/core';

function method(args: MetadataTypes.Arg[]): MetadataTypes.Method {
  return { req: null, res: null, method: 'GET', url: '/mock', actions: [], args, meta: {} };
}

const shapeOf = (schema: unknown) => (schema as z.ZodObject).shape;

describe('SchemaQueryParamResolver', () => {
  it('should do nothing without @QueryParam args', () => {
    const schema: DeepPartial<RouteConfig> = {};
    SchemaQueryParamResolver(method([{ idx: 0, type: 'body' }]), schema);

    expect(schema.request).toBeUndefined();
  });

  it('should use the validation schema of each @QueryParam', () => {
    const uuid = z.string().uuid().optional();
    const schema: DeepPartial<RouteConfig> = {};
    SchemaQueryParamResolver(
      method([{ idx: 0, type: 'query-param', data: { name: 'producerId' }, validationSchema: uuid }]),
      schema,
    );

    expect(shapeOf(schema.request?.query).producerId).toBe(uuid);
  });

  it('should mark a param required when its schema rejects undefined', () => {
    const limit = z.coerce.number();
    const schema: DeepPartial<RouteConfig> = {};
    SchemaQueryParamResolver(method([{ idx: 0, type: 'query-param', data: { name: 'limit' }, validationSchema: limit }]), schema);

    const documented = shapeOf(schema.request?.query).limit as z.ZodType;
    // a copy carrying the openapi metadata, the user's schema is not mutated
    expect(documented).not.toBe(limit);
    expect(documented.parse('5')).toBe(5);
  });

  it('should document a @QueryParam without schema as an optional string', () => {
    const schema: DeepPartial<RouteConfig> = {};
    SchemaQueryParamResolver(method([{ idx: 0, type: 'query-param', data: { name: 'q' } }]), schema);

    const q = shapeOf(schema.request?.query).q as z.ZodType;
    expect(q.safeParse(undefined).success).toBe(true);
    expect(q.safeParse('text').success).toBe(true);
  });

  it('should merge with an existing query object and keep its entries', () => {
    const explicit = z.number();
    const schema: DeepPartial<RouteConfig> = { request: { query: z.object({ page: explicit, a: explicit }) as any } };
    SchemaQueryParamResolver(
      method([
        { idx: 0, type: 'query-param', data: { name: 'a' }, validationSchema: z.string() },
        { idx: 1, type: 'query-param', data: { name: 'b' } },
      ]),
      schema,
    );

    const shape = shapeOf(schema.request?.query);
    expect(Object.keys(shape).sort()).toEqual(['a', 'b', 'page']);
    expect(shape.a).toBe(explicit);
  });

  it('should leave a non-object query schema untouched', () => {
    const explicit = z.record(z.string(), z.string());
    const schema: DeepPartial<RouteConfig> = { request: { query: explicit as any } };
    SchemaQueryParamResolver(method([{ idx: 0, type: 'query-param', data: { name: 'a' } }]), schema);

    expect(schema.request?.query).toBe(explicit);
  });
});

describe('SchemaHeaderResolver', () => {
  it('should document @Header args', () => {
    const schema: DeepPartial<RouteConfig> = {};
    SchemaHeaderResolver(method([{ idx: 0, type: 'header', data: { name: 'x-tenant' } }]), schema);

    expect(Object.keys(shapeOf(schema.request?.headers))).toEqual(['x-tenant']);
  });
});
