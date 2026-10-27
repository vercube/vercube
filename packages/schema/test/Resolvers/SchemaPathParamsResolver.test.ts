import { OpenApiGeneratorV3, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { describe, expect, it } from 'vitest';
import { z } from '../../src';
import { SchemaPathParamsResolver } from '../../src/Resolvers/SchemaPathParamsResolver';
import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import type { DeepPartial, MetadataTypes } from '@vercube/core';

const meta = (args: Partial<MetadataTypes.Arg>[] = []) => ({ args }) as MetadataTypes.Method;
const pathOf = (params: string[], optional: string[] = [], patterns: Record<string, string> = {}) => ({
  params,
  optional,
  patterns,
});

describe('SchemaPathParamsResolver', () => {
  it('should do nothing when there are no params', () => {
    const schema: DeepPartial<RouteConfig> = {};
    SchemaPathParamsResolver(pathOf([]), meta(), schema);

    expect(schema.request).toBeUndefined();
  });

  it('should declare every param as a string', () => {
    const schema: DeepPartial<RouteConfig> = {};
    SchemaPathParamsResolver(pathOf(['pageId', 'id']), meta(), schema);

    const params = schema.request?.params as unknown as z.ZodObject;
    expect(Object.keys(params.shape)).toEqual(['pageId', 'id']);
    expect(params.parse({ pageId: '1', id: '2' })).toEqual({ pageId: '1', id: '2' });
  });

  it('should use the zod validationSchema of @Param', () => {
    const id = z.coerce.number().int();
    const schema: DeepPartial<RouteConfig> = {};
    SchemaPathParamsResolver(
      pathOf(['pageId', 'id']),
      meta([
        { type: 'param', idx: 1, data: { name: 'id' }, validate: true, validationSchema: id },
        { type: 'param', idx: 0, data: { name: 'pageId' } },
      ]),
      schema,
    );

    const params = schema.request?.params as unknown as z.ZodObject;
    expect(params.shape.id.parse('5')).toBe(5);
    expect(params.shape.pageId).toBeInstanceOf(z.ZodString);
  });

  it('should ignore a validationSchema that is not zod', () => {
    const schema: DeepPartial<RouteConfig> = {};
    SchemaPathParamsResolver(
      pathOf(['id']),
      meta([{ type: 'param', idx: 0, data: { name: 'id' }, validate: true, validationSchema: { '~standard': {} } as any }]),
      schema,
    );

    expect((schema.request!.params as unknown as z.ZodObject).shape.id).toBeInstanceOf(z.ZodString);
  });

  it('should keep params defined explicitly in @Schema', () => {
    const explicit = z.object({ id: z.string().uuid() });
    const schema: DeepPartial<RouteConfig> = { request: { params: explicit as any } };
    SchemaPathParamsResolver(pathOf(['id']), meta(), schema);

    expect(schema.request?.params).toBe(explicit);
  });

  it('should mark an optional param and carry its pattern', () => {
    const schema: DeepPartial<RouteConfig> = {};
    SchemaPathParamsResolver(pathOf(['id', 'slug'], ['slug'], { id: String.raw`\d+` }), meta(), schema);

    const registry = new OpenAPIRegistry();
    registry.registerPath({ method: 'get', path: '/a/{id}/{slug}', request: schema.request as any, responses: {} });
    const document = new OpenApiGeneratorV3(registry.definitions).generateDocument({
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
    });

    expect(document.paths['/a/{id}/{slug}'].get?.parameters).toEqual([
      expect.objectContaining({ name: 'id', required: true, schema: expect.objectContaining({ pattern: String.raw`\d+` }) }),
      expect.objectContaining({ name: 'slug', required: false }),
    ]);
  });
});
